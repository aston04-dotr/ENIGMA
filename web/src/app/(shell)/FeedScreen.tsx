"use client";

import type { Session } from "@supabase/supabase-js";
import { EmptyState } from "@/components/EmptyState";
import {
  ErrorUi,
  FETCH_ERROR_MESSAGE,
  LISTINGS_FEED_ERROR_MESSAGE,
} from "@/components/ErrorUi";
import { ListingCard } from "@/components/ListingCard";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { trackEvent } from "@/lib/analytics";
import { recordMeaningfulAction } from "@/lib/saveEnigmaFlow";
import { normalizeAllowedListingCity } from "@/lib/russianCities";
import { listingIsRussiaForFeed } from "@/lib/feedGeo";
import {
  fetchListings,
  fetchListingsCount,
  getCitiesByRegionFromDb,
  getDistrictsByCityFromDb,
  getRegionIdByCityName,
  getRegionsFromDb,
  type CityRow,
  type CityDistrictRow,
  type RegionRow,
  type FeedListingsCursor,
} from "@/lib/listings";
import {
  FEED_HIDDEN_CHANGED_EVENT,
  getHiddenListingIdsSet,
} from "@/lib/feedHiddenListings";
import { subscribeListingPromotionApplied } from "@/lib/listingPromotionEvents";
import {
  interleavePartnerFeedMain,
  promotionTierRank,
  sortListingsByPromotionTierForFeed,
} from "@/lib/monetization";
import { parsePlotAreaToSotki, plotFilterBoundsToSotki } from "@/lib/plotAreaSotki";
import type { ListingRow } from "@/lib/types";
import { useTheme } from "@/context/theme-context";
import { useFormattedIntegerInput } from "@/hooks/useFormattedIntegerInput";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CACHE_KEY = "cached_listings";
const CACHE_KEY_WANTED = "cached_listings_wanted";
const FEED_CATEGORY_KEY = "feed_category";
const FEED_STATE_KEY = "feed_state";
const ALL_CATEGORY = "all";
const FILTERS_DEBOUNCE_MS = 350;
const TEXT_SEARCH_DEBOUNCE_MS = 300;
/** Приблизительная высота карточки в ленте для window virtualizer (уточняется measureElement). */
const FEED_VIRTUAL_ESTIMATE_PX = 400;
/**
 * Мягкий предел карточек в памяти (новые в начале; при переполнении отбрасываем самые старые с конца).
 */
const FEED_ITEMS_SOFT_CAP = 450;

function trimFeedItemsTail(items: ListingRow[]): ListingRow[] {
  if (!Array.isArray(items) || items.length <= FEED_ITEMS_SOFT_CAP) return items;
  return items.slice(0, FEED_ITEMS_SOFT_CAP);
}

const SEARCH_STOP_WORDS = new Set([
  "и",
  "или",
  "а",
  "но",
  "в",
  "во",
  "на",
  "по",
  "за",
  "для",
  "до",
  "от",
  "из",
  "к",
  "ко",
  "у",
  "о",
  "об",
  "с",
  "со",
  "под",
  "при",
  "между",
  "без",
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "with",
  "by",
]);

type FeedCache = { items: ListingRow[]; nextCursor: FeedListingsCursor | null };
type StoredFeedState = {
  regionId?: string;
  city?: string;
  district?: string;
  category?: string;
  scrollY?: number;
  timestamp?: number;
  /** Фильтры недвижимости в ленте → префилл формы «Снять». */
  realAreaFrom?: string;
  realAreaTo?: string;
  realFloor?: string;
  realFloorsTotal?: string;
  /** Фильтр площади участка (сотки; опционально ввод в га через realPlotUseHa). */
  realPlotFrom?: string;
  realPlotTo?: string;
  realPlotUseHa?: boolean;
  /** Продажа / аренда в основной ленте (предложения). */
  dealSegment?: "sale" | "rent";
};
type FeedSort = "newest" | "price_asc" | "price_desc";

function parseStoredCursor(raw: unknown): FeedListingsCursor | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as { created_at?: unknown; id?: unknown };
  const created_at = String(o.created_at ?? "").trim();
  const id = String(o.id ?? "").trim();
  if (!created_at || !id) return null;
  return { created_at, id };
}

function parseIntOrNull(raw: string): number | null {
  const normalized = String(raw ?? "")
    .replace(/\s/g, "")
    .trim();
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}

function tokenizeSearchQuery(raw: string): string[] {
  const normalized = String(raw ?? "")
    .toLowerCase()
    .replace(/[^0-9a-zA-Zа-яА-ЯёЁ]+/g, " ");
  const tokens = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !SEARCH_STOP_WORDS.has(part));
  return Array.from(new Set(tokens));
}

function getParamsObject(row: ListingRow): Record<string, unknown> {
  const maybe = (row as ListingRow & { params?: unknown }).params;
  if (maybe && typeof maybe === "object") return maybe as Record<string, unknown>;
  return {};
}

function getParamInt(row: ListingRow, key: string): number | null {
  const params = getParamsObject(row);
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") return parseIntOrNull(value);
  return null;
}

function getParamBool(row: ListingRow, key: string): boolean | null {
  const params = getParamsObject(row);
  const value = params[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "да") return true;
    if (normalized === "false" || normalized === "нет") return false;
  }
  return null;
}

function getParamText(row: ListingRow, key: string): string {
  const params = getParamsObject(row);
  return String(params[key] ?? "").trim();
}

function getListingPriceForSort(row: ListingRow): number {
  return getParamInt(row, "price") ?? Number(row.price ?? 0) ?? 0;
}

function readFeedCache(storageKey: string = CACHE_KEY): FeedCache {
  if (typeof window === "undefined") return { items: [], nextCursor: null };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { items: [], nextCursor: null };
    const j = JSON.parse(raw) as
      | FeedCache
      | ListingRow[]
      | { items?: unknown; nextCursor?: unknown };
    if (Array.isArray(j)) return { items: j, nextCursor: null };
    const items = Array.isArray(j.items) ? (j.items as ListingRow[]) : [];
    const nc = parseStoredCursor(j.nextCursor);
    return { items, nextCursor: nc };
  } catch {
    return { items: [], nextCursor: null };
  }
}

function readStoredFeedCategory(): string {
  if (typeof window === "undefined") return ALL_CATEGORY;
  try {
    const raw = localStorage.getItem(FEED_CATEGORY_KEY);
    if (!raw) return ALL_CATEGORY;
    const normalized = raw.trim();
    if (normalized === ALL_CATEGORY) return ALL_CATEGORY;
    return CATEGORIES.some((x) => x.id === normalized) ? normalized : ALL_CATEGORY;
  } catch {
    return ALL_CATEGORY;
  }
}

function persistFeedCategory(category: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEED_CATEGORY_KEY, category);
  } catch {
    /* private mode */
  }
}

function readFeedState(): StoredFeedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FEED_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFeedState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistFeedState(state: StoredFeedState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FEED_STATE_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota
  }
}

function persistFeed(
  items: ListingRow[],
  nextCursor: FeedListingsCursor | null,
  storageKey: string = CACHE_KEY,
) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ items, nextCursor }));
  } catch {
    /* quota / private mode */
  }
}

function mixFeed(rows: ListingRow[], userId?: string) {
  const sorted = sortListingsByPromotionTierForFeed(rows);
  try {
    const interleaved = interleavePartnerFeedMain(sorted, { userId });
    return Array.isArray(interleaved) ? interleaved : sorted;
  } catch (e) {
    console.error("LISTINGS FEED MIX ERROR", e);
    return sorted;
  }
}

export function FeedPage({
  session,
  feedVariant = "offers",
}: {
  session: Session | null;
  feedVariant?: "offers" | "seeking";
}) {
  const { theme } = useTheme();
  const cacheStorageKey = feedVariant === "seeking" ? CACHE_KEY_WANTED : CACHE_KEY;
  const feedSeed = useMemo(() => {
    const raw = readFeedCache(cacheStorageKey);
    return {
      items: trimFeedItemsTail(raw.items),
      nextCursor: raw.nextCursor,
    };
  }, [cacheStorageKey]);
  const feedStateSeed = useMemo(() => readFeedState(), []);
  const seededRegionId = String(feedStateSeed?.regionId ?? "").trim();
  const seededCity = String(feedStateSeed?.city ?? "").trim();
  const seededDistrict = String(feedStateSeed?.district ?? "").trim();
  const seededCategory = String(feedStateSeed?.category ?? "").trim();
  const [items, setItems] = useState<ListingRow[]>(() => feedSeed.items);
  const [nextCursor, setNextCursor] = useState<FeedListingsCursor | null>(
    () => feedSeed.nextCursor,
  );
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedNotice, setFeedNotice] = useState<string | null>(null);
  const [serverFoundCount, setServerFoundCount] = useState<number | null>(null);
  const [city, setCity] = useState<string>(normalizeAllowedListingCity(seededCity) ?? "");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [district, setDistrict] = useState<string>(seededDistrict);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string>(seededRegionId);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [citySheetStep, setCitySheetStep] = useState<1 | 2>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (seededCategory === ALL_CATEGORY) return ALL_CATEGORY;
    return CATEGORIES.some((x) => x.id === seededCategory)
      ? seededCategory
      : ALL_CATEGORY;
  });
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<FeedSort>("newest");
  const [feedDealSegment, setFeedDealSegment] = useState<"sale" | "rent">(() => {
    if (feedVariant === "seeking") return "sale";
    return feedStateSeed?.dealSegment === "rent" ? "rent" : "sale";
  });
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const { formattedProps: priceFromInput } = useFormattedIntegerInput(priceFrom, setPriceFrom);
  const { formattedProps: priceToInput } = useFormattedIntegerInput(priceTo, setPriceTo);
  const [autoYearFrom, setAutoYearFrom] = useState("");
  const [autoYearTo, setAutoYearTo] = useState("");
  const [autoMileageFrom, setAutoMileageFrom] = useState("");
  const [autoMileageTo, setAutoMileageTo] = useState("");
  const [autoTransmission, setAutoTransmission] = useState("");
  const [autoClearedOnly, setAutoClearedOnly] = useState(false);
  const [autoDamagedOnly, setAutoDamagedOnly] = useState(false);
  const [realAreaFrom, setRealAreaFrom] = useState(() =>
    String(feedStateSeed?.realAreaFrom ?? "").trim(),
  );
  const [realAreaTo, setRealAreaTo] = useState(() => String(feedStateSeed?.realAreaTo ?? "").trim());
  const [realFloor, setRealFloor] = useState(() => String(feedStateSeed?.realFloor ?? "").trim());
  const [realFloorsTotal, setRealFloorsTotal] = useState(() =>
    String(feedStateSeed?.realFloorsTotal ?? "").trim(),
  );
  const [realRooms, setRealRooms] = useState("");
  const [realPlotFrom, setRealPlotFrom] = useState(() =>
    String(feedStateSeed?.realPlotFrom ?? "").trim(),
  );
  const [realPlotTo, setRealPlotTo] = useState(() =>
    String(feedStateSeed?.realPlotTo ?? "").trim(),
  );
  const [realPlotUseHa, setRealPlotUseHa] = useState(
    feedStateSeed?.realPlotUseHa === true,
  );
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [districts, setDistricts] = useState<CityDistrictRow[]>([]);
  const [feedNonce, setFeedNonce] = useState(0);
  /** Реактивировать сортировку/бейджи по времени истечения `*_until` без перезапроса ленты. */
  const [promotionTimeTick, setPromotionTimeTick] = useState(0);
  const previousRegionIdRef = useRef<string>("");
  const regionSeedRef = useRef({
    regionId: seededRegionId,
    citySeed: seededCity,
  });

  useEffect(() => {
    const id = window.setInterval(() => setPromotionTimeTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dbRegions = await getRegionsFromDb();
      if (cancelled) return;
      setRegions(dbRegions);
      const { regionId: seedR, citySeed } = regionSeedRef.current;
      let nextRegion = String(seedR ?? "").trim();
      if (!nextRegion && citySeed.trim()) {
        const mapped = await getRegionIdByCityName(citySeed.trim());
        if (cancelled) return;
        nextRegion = String(mapped ?? "").trim();
      }
      if (nextRegion) {
        setSelectedRegionId((prev) => (String(prev ?? "").trim() ? prev : nextRegion));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const rid = String(selectedRegionId ?? "").trim();
    const prevRegionId = previousRegionIdRef.current;
    previousRegionIdRef.current = rid;
    if (!rid) {
      setCities([]);
      setSelectedCityId("");
      setCity("");
      setDistricts([]);
      setDistrict("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const dbCities = await getCitiesByRegionFromDb(rid);
      if (cancelled) return;
      setCities(dbCities);
      const changedByUser = prevRegionId.length > 0 && prevRegionId !== rid;
      if (changedByUser) {
        setSelectedCityId("");
        setCity("");
        setDistricts([]);
        setDistrict("");
        return;
      }
      setCity((prevCity) => {
        const normalized = normalizeAllowedListingCity(prevCity);
        if (!normalized) return "";
        const cityMatch = dbCities.find((c) => c.name === normalized);
        setSelectedCityId(cityMatch?.id ?? "");
        return dbCities.some((c) => c.name === normalized) ? normalized : "";
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRegionId]);

  useEffect(() => {
    if (seededCategory) return;
    setSelectedCategory(readStoredFeedCategory());
  }, [seededCategory]);

  useEffect(() => {
    const state = readFeedState();
    if (!state) return;
    const savedRegionId = String(state.regionId ?? "").trim();
    const savedCity = String(state.city ?? "").trim();
    const savedDistrict = String(state.district ?? "").trim();
    const savedCategory = String(state.category ?? "").trim();
    const savedScrollY = Number(state.scrollY ?? 0);
    if (savedRegionId) setSelectedRegionId(savedRegionId);
    const normalizedSavedCity = normalizeAllowedListingCity(savedCity);
    if (normalizedSavedCity) setCity(normalizedSavedCity);
    if (savedDistrict) setDistrict(savedDistrict);
    if (savedCategory === ALL_CATEGORY || CATEGORIES.some((x) => x.id === savedCategory)) {
      setSelectedCategory(savedCategory || ALL_CATEGORY);
    }

    if (savedScrollY > 0) {
      let attempts = 0;
      const restore = () => {
        attempts += 1;
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        const target = Math.min(savedScrollY, Math.max(0, maxScroll));
        window.scrollTo(0, target);
        if (attempts < 8 && maxScroll + 20 < savedScrollY) {
          window.setTimeout(restore, 120);
        }
      };
      window.setTimeout(restore, 80);
    }
  }, []);

  useEffect(() => {
    const cityId = String(selectedCityId ?? "").trim();
    if (!cityId) {
      setDistricts([]);
      setDistrict("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dbDistricts = await getDistrictsByCityFromDb(cityId);
        if (cancelled) return;
        setDistricts(dbDistricts);
        setDistrict((prev) =>
          dbDistricts.some((row) => row.name === prev) ? prev : "",
        );
      } catch {
        if (cancelled) return;
        setDistricts([]);
        setDistrict("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCityId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      persistFeedState({
        regionId: selectedRegionId || undefined,
        city,
        district,
        category: selectedCategory,
        scrollY: typeof window !== "undefined" ? window.scrollY : 0,
        timestamp: Date.now(),
        realAreaFrom,
        realAreaTo,
        realFloor,
        realFloorsTotal,
        realPlotFrom,
        realPlotTo,
        realPlotUseHa,
        ...(feedVariant === "offers" ? { dealSegment: feedDealSegment } : {}),
      });
    }, FILTERS_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [
    selectedRegionId,
    city,
    district,
    selectedCategory,
    realAreaFrom,
    realAreaTo,
    realFloor,
    realFloorsTotal,
    realPlotFrom,
    realPlotTo,
    realPlotUseHa,
    feedVariant,
    feedDealSegment,
  ]);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [feedHiddenTick, setFeedHiddenTick] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, TEXT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const searchActionRef = useRef<{ q: string; at: number }>({ q: "", at: 0 });
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return;
    const now = Date.now();
    if (searchActionRef.current.q === q && now - searchActionRef.current.at < 20_000) {
      return;
    }
    searchActionRef.current = { q, at: now };
    recordMeaningfulAction("search_used", 1);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHiddenChanged = () => setFeedHiddenTick((n) => n + 1);
    window.addEventListener(FEED_HIDDEN_CHANGED_EVENT, onHiddenChanged);
    return () => window.removeEventListener(FEED_HIDDEN_CHANGED_EVENT, onHiddenChanged);
  }, []);

  const prefetchedRef = useRef<FeedCache | null>(null);
  const prefetchKeyRef = useRef<string | null>(null);
  const prefetchingRef = useRef(false);
  const loadMoreLockRef = useRef(false);
  const lastPrefetchAtRef = useRef(0);
  const lastLoadMoreAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugLogFeedFetch = useCallback(
    (source: "replace" | "append", fetchedCount: number) => {
      console.log("[feed] server payload", {
        source,
        fetchedCount,
        filters: {
          city,
          district,
          category: selectedCategory,
          listingType: feedDealSegment,
          searchText: searchQuery.trim(),
          feedVariant,
        },
      });
    },
    [city, district, selectedCategory, feedDealSegment, searchQuery, feedVariant],
  );
  const feedFilters = useMemo(() => {
    const f: Parameters<typeof fetchListings>[0] = { city: city.trim() };
    if (district.trim()) {
      f.district = district.trim();
    }
    const q = searchQuery.trim();
    if (q.length > 2) {
      f.search = q;
    }
    if (feedVariant === "seeking") {
      f.listingKind = "seeking";
      f.dealType = feedDealSegment;
      if (selectedCategory === ALL_CATEGORY) {
        f.categoriesIn = ["realestate", "auto", "moto"];
      } else {
        f.category = selectedCategory;
      }
      return f;
    }
    f.listingKind = "offer";
    f.dealType = feedDealSegment;
    if (selectedCategory !== ALL_CATEGORY) {
      f.category = selectedCategory;
    }
    return f;
  }, [city, district, selectedCategory, feedDealSegment, feedVariant, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const count = await fetchListingsCount(feedFilters);
          if (cancelled) return;
          setServerFoundCount(Number.isFinite(count) ? count : 0);
        } catch {
          if (cancelled) return;
          setServerFoundCount(null);
        }
      })();
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [feedFilters]);

  const filtered = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const hiddenIds =
      typeof window !== "undefined" ? getHiddenListingIdsSet() : new Set<string>();
    const base = items.filter((x) => {
      if (hiddenIds.has(String(x.id ?? "").trim())) return false;
      if (!listingIsRussiaForFeed(x)) return false;
      if (city.trim() && x.city?.toLowerCase().trim() !== city.toLowerCase().trim()) return false;
      if (
        district.trim() &&
        String(x.district ?? "").toLowerCase().trim() !== district.toLowerCase().trim()
      ) {
        return false;
      }
      const rowDealRaw =
        String(x.deal_type ?? "").trim() ||
        String(getParamsObject(x).deal_type ?? "").trim();
      const rowDeal = rowDealRaw || "sale";
      const rowKindRaw = String(x.listing_kind ?? "").trim();
      const rowKind = rowKindRaw || "offer";
      if (feedVariant === "offers") {
        if (rowKind !== "offer") return false;
        if (feedDealSegment === "sale" && rowDeal !== "sale") return false;
        if (feedDealSegment === "rent" && rowDeal !== "rent") return false;
      } else {
        if (rowKind !== "seeking") return false;
        if (feedDealSegment === "sale" && rowDeal !== "sale") return false;
        if (feedDealSegment === "rent" && rowDeal !== "rent") return false;
        if (selectedCategory === ALL_CATEGORY) {
          const cat = String(x.category ?? "").trim();
          if (cat !== "realestate" && cat !== "auto" && cat !== "moto") return false;
        }
      }
      if (selectedCategory === ALL_CATEGORY) return true;
      return (x.category ?? "").trim() === selectedCategory;
    });
    const searchTokens = tokenizeSearchQuery(searchQuery);
    const withSearch =
      searchTokens.length === 0
        ? base
        : base.filter((row) => {
            const title = String(row.title ?? "").toLowerCase();
            const description = String(row.description ?? "").toLowerCase();
            const districtText = String(row.district ?? "").toLowerCase();
            const haystack = `${title} ${description} ${districtText}`;
            return searchTokens.every((token) => haystack.includes(token));
          });
    const minPrice = parseIntOrNull(priceFrom);
    const maxPrice = parseIntOrNull(priceTo);
    const yearFrom = parseIntOrNull(autoYearFrom);
    const yearTo = parseIntOrNull(autoYearTo);
    const mileageFrom = parseIntOrNull(autoMileageFrom);
    const mileageTo = parseIntOrNull(autoMileageTo);
    const areaFrom = parseIntOrNull(realAreaFrom);
    const areaTo = parseIntOrNull(realAreaTo);
    const floorEq = parseIntOrNull(realFloor);
    const floorsTotalEq = parseIntOrNull(realFloorsTotal);
    const roomsEq = parseIntOrNull(realRooms);
    const plotBounds = plotFilterBoundsToSotki(realPlotFrom, realPlotTo, realPlotUseHa);

    const afterFilters = withSearch.filter((row) => {
      const listingPrice = getListingPriceForSort(row);
      if (minPrice != null && listingPrice < minPrice) return false;
      if (maxPrice != null && listingPrice > maxPrice) return false;

      if (selectedCategory === "auto") {
        const year = getParamInt(row, "year");
        const mileage = getParamInt(row, "mileage");
        const transmission = getParamText(row, "transmission").toLowerCase();
        const isCleared = getParamBool(row, "is_cleared");
        const isDamaged = getParamBool(row, "is_damaged");
        if (yearFrom != null && (year == null || year < yearFrom)) return false;
        if (yearTo != null && (year == null || year > yearTo)) return false;
        if (mileageFrom != null && (mileage == null || mileage < mileageFrom)) return false;
        if (mileageTo != null && (mileage == null || mileage > mileageTo)) return false;
        if (
          autoTransmission &&
          transmission !== autoTransmission.trim().toLowerCase()
        ) {
          return false;
        }
        if (autoClearedOnly && isCleared !== true) return false;
        if (autoDamagedOnly && isDamaged !== true) return false;
      }

      if (selectedCategory === "realestate") {
        const listingType = getParamText(row, "type");
        const isPlotListing = listingType === "Участок";
        const area = getParamInt(row, "area_m2");
        const floor = getParamInt(row, "floor");
        const floorsTotal = getParamInt(row, "floors_total");
        const rooms = getParamInt(row, "rooms");
        if (!isPlotListing) {
          if (areaFrom != null && (area == null || area < areaFrom)) return false;
          if (areaTo != null && (area == null || area > areaTo)) return false;
          if (floorEq != null && floor !== floorEq) return false;
          if (floorsTotalEq != null && floorsTotal !== floorsTotalEq) return false;
          if (roomsEq != null && rooms !== roomsEq) return false;
        }

        if (plotBounds.from != null || plotBounds.to != null) {
          if (listingType !== "Участок") return false;
          const rawPlot =
            (typeof row.plot_area === "string" ? row.plot_area.trim() : "") ||
            getParamText(row, "plot_area");
          const listingSotki = parsePlotAreaToSotki(rawPlot);
          if (listingSotki == null) return false;
          if (plotBounds.from != null && listingSotki < plotBounds.from) return false;
          if (plotBounds.to != null && listingSotki > plotBounds.to) return false;
        }
      }

      return true;
    });

    const sorted = [...afterFilters];
    if (sortMode === "price_asc") {
      sorted.sort((a, b) => {
        const pa = getListingPriceForSort(a);
        const pb = getListingPriceForSort(b);
        if (pa !== pb) return pa - pb;
        const trb = promotionTierRank(b);
        const tra = promotionTierRank(a);
        if (trb !== tra) return trb - tra;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return sorted;
    }
    if (sortMode === "price_desc") {
      sorted.sort((a, b) => {
        const pa = getListingPriceForSort(a);
        const pb = getListingPriceForSort(b);
        if (pa !== pb) return pb - pa;
        const trb = promotionTierRank(b);
        const tra = promotionTierRank(a);
        if (trb !== tra) return trb - tra;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return sorted;
    }
    return sortListingsByPromotionTierForFeed(afterFilters);
  }, [
    feedHiddenTick,
    promotionTimeTick,
    items,
    city,
    district,
    selectedCategory,
    priceFrom,
    priceTo,
    autoYearFrom,
    autoYearTo,
    autoMileageFrom,
    autoMileageTo,
    autoTransmission,
    autoClearedOnly,
    autoDamagedOnly,
    searchQuery,
        realFloor,
        realFloorsTotal,
        realRooms,
        sortMode,
        realPlotFrom,
        realPlotTo,
        realPlotUseHa,
        feedDealSegment,
        feedVariant,
      ]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filtered.length,
    estimateSize: () => FEED_VIRTUAL_ESTIMATE_PX,
    overscan: 6,
  });

  const applyRes = useCallback(
    (
      res: Awaited<ReturnType<typeof fetchListings>>,
      mode: "replace" | "append",
    ) => {
      const raw = Array.isArray(res.listings) ? res.listings : [];
      setFeedNotice(res.notice ?? null);
      if (res.error) {
        console.error("LISTINGS FETCH ERROR", res.error);
        setFeedError(res.error || LISTINGS_FEED_ERROR_MESSAGE);
        if (mode === "replace") {
          const capped = trimFeedItemsTail(raw);
          setItems(capped);
          setNextCursor(res.nextCursor ?? null);
          persistFeed(capped, res.nextCursor ?? null, cacheStorageKey);
        }
        return;
      }
      prefetchedRef.current = null;
      prefetchKeyRef.current = null;
      setFeedError(null);
      debugLogFeedFetch(mode, raw.length);
      const mix = mixFeed(raw, session?.user?.id);
      const serverNext = res.nextCursor ?? null;
      if (mode === "replace") {
        const capped = trimFeedItemsTail(mix);
        setItems(capped);
        setNextCursor(serverNext);
        persistFeed(capped, serverNext, cacheStorageKey);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const add = mix.filter((x) => !seen.has(x.id));
          const merged = trimFeedItemsTail([...prev, ...add]);
          persistFeed(merged, serverNext, cacheStorageKey);
          return merged;
        });
        setNextCursor(serverNext);
      }
    },
    [session?.user?.id, cacheStorageKey, debugLogFeedFetch],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let fetchStarted = false;
    prefetchedRef.current = null;
    prefetchKeyRef.current = null;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      if (cancelled) return;
      fetchStarted = true;
      setIsFeedRefreshing(true);
      void (async () => {
        try {
          const res = await fetchListings(feedFilters);
          if (cancelled) return;
          const raw = Array.isArray(res.listings) ? res.listings : [];
          setFeedNotice(res.notice ?? null);
          if (res.error) {
            console.error("LISTINGS FETCH ERROR", res.error);
            setFeedError(res.error || LISTINGS_FEED_ERROR_MESSAGE);
            const capped = trimFeedItemsTail(raw);
            setItems(capped);
            setNextCursor(res.nextCursor ?? null);
            persistFeed(capped, res.nextCursor ?? null, cacheStorageKey);
            return;
          }
          prefetchedRef.current = null;
          prefetchKeyRef.current = null;
          setFeedError(null);
          debugLogFeedFetch("replace", raw.length);
          const mix = mixFeed(raw, session?.user?.id);
          const serverNext = res.nextCursor ?? null;
          const capped = trimFeedItemsTail(mix);
          setItems(capped);
          setNextCursor(serverNext);
          persistFeed(capped, serverNext, cacheStorageKey);
        } catch (e) {
          if (cancelled) return;
          console.error("LISTINGS INITIAL FETCH ERROR", e);
          setFeedError(FETCH_ERROR_MESSAGE);
        } finally {
          if (!cancelled) {
            setIsFeedRefreshing(false);
          }
        }
      })();
    }, FILTERS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (!fetchStarted) {
        setIsFeedRefreshing(false);
      }
    };
  }, [feedFilters, session?.user?.id, feedNonce, debugLogFeedFetch]);

  useEffect(() => {
    return subscribeListingPromotionApplied(() => {
      setFeedNonce((n) => n + 1);
    });
  }, []);

  const runPrefetch = useCallback(async () => {
    if (!nextCursor || prefetchingRef.current) return;
    const key = `${nextCursor.created_at}\0${nextCursor.id}\0${city}\0${district}\0${selectedCategory}\0${feedDealSegment}\0${feedVariant}\0${cacheStorageKey}`;
    if (prefetchedRef.current && prefetchKeyRef.current === key) return;
    prefetchingRef.current = true;
    try {
      const res = await fetchListings({ ...feedFilters, cursor: nextCursor });
      const raw = Array.isArray(res.listings) ? res.listings : [];
      const mix = mixFeed(raw, session?.user?.id);
      const c = res.nextCursor ?? null;
      prefetchedRef.current = { items: mix, nextCursor: c };
      prefetchKeyRef.current = key;
      console.log("LISTINGS PREFETCH STORED", {
        count: mix.length,
        nextCursor: c,
      });
    } catch (e) {
      console.error("LISTINGS PREFETCH ERROR", e);
    } finally {
      prefetchingRef.current = false;
    }
  }, [nextCursor, feedFilters, city, district, selectedCategory, session?.user?.id, feedDealSegment, feedVariant, cacheStorageKey]);

  useEffect(() => {
    persistFeedCategory(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    if (!nextCursor) return;
    const t = window.setTimeout(() => void runPrefetch(), 0);
    return () => window.clearTimeout(t);
  }, [nextCursor, runPrefetch]);

  const flushPrefetch = useCallback(() => {
    const p = prefetchedRef.current;
    if (!p) return false;
    prefetchedRef.current = null;
    prefetchKeyRef.current = null;
    setItems((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const add = p.items.filter((x) => !seen.has(x.id));
      const merged = trimFeedItemsTail([...prev, ...add]);
      persistFeed(merged, p.nextCursor, cacheStorageKey);
      return merged;
    });
    setNextCursor(p.nextCursor);
    return true;
  }, [cacheStorageKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadMoreLockRef.current) return;
    if (flushPrefetch()) return;
    loadMoreLockRef.current = true;
    try {
      const res = await fetchListings({ ...feedFilters, cursor: nextCursor });
      applyRes(res, "append");
    } catch (e) {
      console.error("FETCH ERROR", e);
      setFeedError(FETCH_ERROR_MESSAGE);
    } finally {
      loadMoreLockRef.current = false;
    }
  }, [nextCursor, feedFilters, applyRes, flushPrefetch]);

  useEffect(() => {
    let rafId: number | null = null;
    const run = () => {
      rafId = null;
      const y = window.scrollY || window.pageYOffset || 0;
      setShowScrollTop(y > 300);

      const el = document.documentElement;
      const denom = el.scrollHeight - el.clientHeight;
      const ratio = denom > 0 ? el.scrollTop / denom : 0;
      const now = Date.now();
      if (ratio > 0.7 && nextCursor && now - lastPrefetchAtRef.current > 500) {
        lastPrefetchAtRef.current = now;
        void runPrefetch();
      }
      if (ratio > 0.92 && nextCursor && now - lastLoadMoreAtRef.current > 450) {
        lastLoadMoreAtRef.current = now;
        void loadMore();
      }
    };
    const onScroll = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [nextCursor, runPrefetch, loadMore]);

  const categoryTitle =
    selectedCategory === ALL_CATEGORY ? "Все" : categoryLabel(selectedCategory);
  const foundCountLabel = new Intl.NumberFormat("ru-RU").format(
    serverFoundCount ?? filtered.length,
  );

  const filterRowClass =
    theme === "light"
      ? "pressable flex w-full items-center justify-between rounded-card border border-neutral-200 bg-[#FFFFFF] px-4 py-3 text-left shadow-[0_1px_2px_rgba(13,148,136,0.04)] transition-colors hover:border-[#22d3ee]/30 hover:bg-[#FAFCFF] active:scale-[0.995]"
      : "pressable flex w-full items-center justify-between rounded-card border border-white/12 bg-transparent px-4 py-3 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.995]";
  const filterRowLabelClass =
    theme === "light" ? "text-sm font-medium text-[#1793e6]" : "text-sm font-medium text-white";
  const filterRowChevronClass =
    theme === "light" ? "text-sm font-semibold text-[#22d3ee]" : "text-sm font-semibold text-white";

  function categoryQuickChipClass(active: boolean): string {
    const base =
      "pressable shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors";
    if (theme === "light") {
      return `${base} ${
        active
          ? "border-[#22d3ee]/45 bg-[#e8f6fc] text-[#0b7cbf]"
          : "border-neutral-200 bg-[#FFFFFF] text-[#1793e6] hover:border-[#22d3ee]/28 hover:bg-[#FAFCFF]"
      }`;
    }
    return `${base} ${
      active
        ? "border-white/28 bg-white/[0.07] text-white"
        : "border-white/12 bg-transparent text-white hover:bg-white/[0.05]"
    }`;
  }
  const hasActiveFilters =
    Boolean(city.trim()) ||
    Boolean(district.trim()) ||
    selectedCategory !== ALL_CATEGORY ||
    sortMode !== "newest" ||
    Boolean(
      searchInput.trim() ||
      priceFrom ||
        priceTo ||
        autoYearFrom ||
        autoYearTo ||
        autoMileageFrom ||
        autoMileageTo ||
        autoTransmission ||
        autoClearedOnly ||
        autoDamagedOnly ||
        realAreaFrom ||
        realAreaTo ||
        realFloor ||
        realFloorsTotal ||
        realRooms ||
        realPlotFrom ||
        realPlotTo ||
        realPlotUseHa,
    );
  const quickCategories = useMemo(
    () => CATEGORIES.filter((cat) => cat.id !== "other"),
    [],
  );
  const selectedRegionName = useMemo(
    () => regions.find((r) => r.id === selectedRegionId)?.name ?? "",
    [regions, selectedRegionId],
  );
  const allCitiesFilterActive = useMemo(
    () => !city.trim() && !selectedCityId.trim() && !selectedRegionId.trim(),
    [city, selectedCityId, selectedRegionId],
  );

  const resetFilters = useCallback(() => {
    trackEvent("filters_reset", {
      city,
      category: selectedCategory,
    });
    setCity("");
    setSelectedCityId("");
    setSelectedRegionId("");
    setDistrict("");
    setDistricts([]);
    setSelectedCategory(ALL_CATEGORY);
    setFeedDealSegment("sale");
    setSortMode("newest");
    setSearchInput("");
    setSearchQuery("");
    setPriceFrom("");
    setPriceTo("");
    setAutoYearFrom("");
    setAutoYearTo("");
    setAutoMileageFrom("");
    setAutoMileageTo("");
    setAutoTransmission("");
    setAutoClearedOnly(false);
    setAutoDamagedOnly(false);
    setRealAreaFrom("");
    setRealAreaTo("");
    setRealFloor("");
    setRealFloorsTotal("");
    setRealRooms("");
    setRealPlotFrom("");
    setRealPlotTo("");
    setRealPlotUseHa(false);
    setCitySheetOpen(false);
    setCategorySheetOpen(false);
    setFiltersSheetOpen(false);
  }, [city, selectedCategory]);

  const sortLabel = useMemo(() => {
    if (sortMode === "price_asc") return "Сначала дешёвые";
    if (sortMode === "price_desc") return "Сначала дорогие";
    return "Сначала новые";
  }, [sortMode]);

  const rememberFeedStateBeforeOpen = useCallback(() => {
    persistFeedState({
      regionId: selectedRegionId || undefined,
      city,
      district,
      category: selectedCategory,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      timestamp: Date.now(),
      realAreaFrom,
      realAreaTo,
      realFloor,
      realFloorsTotal,
      realPlotFrom,
      realPlotTo,
      realPlotUseHa,
      ...(feedVariant === "offers" ? { dealSegment: feedDealSegment } : {}),
    });
  }, [
    selectedRegionId,
    city,
    district,
    selectedCategory,
    realAreaFrom,
    realAreaTo,
    realFloor,
    realFloorsTotal,
    realPlotFrom,
    realPlotTo,
    realPlotUseHa,
    feedVariant,
    feedDealSegment,
  ]);

  return (
    <main className="safe-pt min-h-[100svh] bg-main">
      <header className="border-b border-line bg-main">
        <div className="mx-auto w-full max-w-none px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            {feedVariant !== "seeking" ? (
              <div>
                <h1 className="relative -top-0.5 pb-0.5 bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] bg-clip-text text-[28px] font-bold leading-none tracking-tight text-transparent">
                  Enigma
                </h1>
              </div>
            ) : null}
          </div>
          <div
            className={`mt-4 ${
              theme === "light"
                ? "relative rounded-2xl border border-neutral-200 bg-[#FFFFFF] px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                : "relative rounded-2xl border border-white/12 bg-transparent px-4 py-3.5"
            }`}
          >
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск объявлений..."
              enterKeyHint="search"
              className={
                theme === "light"
                  ? "w-full bg-transparent pr-8 text-[15px] text-[#111827] placeholder:text-neutral-400 outline-none"
                  : "w-full bg-transparent pr-8 text-[15px] text-white placeholder:text-white/45 outline-none"
              }
            />
            {searchInput.trim() ? (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                }}
                className={
                  theme === "light"
                    ? "absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-400 hover:text-neutral-600"
                    : "absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/50 hover:text-white/80"
                }
              >
                X
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-2.5">
            <div
              className={
                theme === "light"
                  ? "rounded-[14px] border border-neutral-200 bg-[#FFFFFF] p-1.5 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]"
                  : "rounded-[14px] border border-white/10 bg-[#000000] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
              }
            >
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setFeedDealSegment("sale");
                    trackEvent("feed_deal_segment", { segment: "sale", variant: feedVariant });
                  }}
                  className={`min-h-[44px] rounded-[11px] text-[15px] font-bold leading-none tracking-tight transition-all duration-300 ease-out active:scale-[0.98] ${
                    feedDealSegment === "sale"
                      ? "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-[0_6px_24px_rgba(139,95,255,0.38)]"
                      : theme === "light"
                        ? "bg-transparent text-neutral-500 hover:text-neutral-700"
                        : "bg-transparent text-white/40 hover:text-white/72"
                  }`}
                >
                  Продажа
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedDealSegment("rent");
                    trackEvent("feed_deal_segment", { segment: "rent", variant: feedVariant });
                  }}
                  className={`min-h-[44px] rounded-[11px] text-[15px] font-bold leading-none tracking-tight transition-all duration-300 ease-out active:scale-[0.98] ${
                    feedDealSegment === "rent"
                      ? "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-[0_6px_24px_rgba(139,95,255,0.38)]"
                      : theme === "light"
                        ? "bg-transparent text-neutral-500 hover:text-neutral-700"
                        : "bg-transparent text-white/40 hover:text-white/72"
                  }`}
                >
                  Аренда
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setCitySheetStep(1);
                  setCitySheetOpen(true);
                }}
                className={filterRowClass}
              >
                <span className={filterRowLabelClass}>
                  {district ? `Район: ${district}` : `Город: ${city || "Все города"}`}
                </span>
                <span className={filterRowChevronClass}>{">"}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategorySheetOpen(true)}
                className={filterRowClass}
              >
                <span className={filterRowLabelClass}>Категория: {categoryTitle}</span>
                <span className={filterRowChevronClass}>{">"}</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltersSheetOpen(true)}
                className={filterRowClass}
              >
                <span className={filterRowLabelClass}>Фильтры: {sortLabel}</span>
                <span className={filterRowChevronClass}>{">"}</span>
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Найдено: {foundCountLabel} объявлений</p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="pressable text-sm font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  Сбросить
                </button>
              ) : null}
            </div>
            <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => {
                  trackEvent("category_quick_select", { category: ALL_CATEGORY });
                  setSelectedCategory(ALL_CATEGORY);
                }}
                className={categoryQuickChipClass(selectedCategory === ALL_CATEGORY)}
              >
                Все
              </button>
              {quickCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    trackEvent("category_quick_select", { category: cat.id });
                    setSelectedCategory(cat.id);
                  }}
                  className={categoryQuickChipClass(selectedCategory === cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {feedNotice ? (
        <div className="border-b border-line bg-elev-2/80">
          <div className="mx-auto w-full max-w-none px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-muted">{feedNotice}</p>
          </div>
        </div>
      ) : null}
      {feedError ? (
        <div className="mx-auto w-full max-w-none px-4 pt-4 sm:px-6 lg:px-8">
          <ErrorUi text={feedError} />
        </div>
      ) : null}

      <div
        className={`relative mx-auto w-full max-w-none scroll-smooth px-4 pb-8 pt-6 transition-opacity duration-200 sm:px-6 lg:max-w-[760px] lg:px-0 xl:max-w-[800px] ${
          isFeedRefreshing ? "pointer-events-none opacity-50" : "opacity-100"
        }`}
      >
        {filtered.length > 0 ? (
          <div
            className="w-full"
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = filtered[virtualRow.index];
              return (
                <div
                  key={item.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="box-border pb-4 md:pb-5"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ListingCard
                    item={item}
                    index={virtualRow.index}
                    favoriteRealtime={false}
                    omitOuterMargin
                    onOpen={rememberFeedStateBeforeOpen}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState
            title={feedVariant === "seeking" ? "Запросов нет" : "Лента пуста"}
            subtitle={
              feedVariant === "seeking"
                ? "В этом городе пока нет объявлений «сниму», «куплю» и похожих."
                : undefined
            }
            actionLabel={feedVariant === "seeking" ? "Разместить запрос" : "Создать"}
            actionHref={feedVariant === "seeking" ? "/create?role=seeking" : "/create"}
          />
        ) : null}
        {isFeedRefreshing ? (
          <div className="pointer-events-none absolute inset-0 z-10 px-1 pt-2">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={`feed-refresh-skeleton-${idx}`}
                  className="overflow-hidden rounded-card border border-line/70 bg-elevated/80 p-3"
                >
                  <div className="h-40 animate-skeleton rounded-xl bg-elev-2/85" />
                  <div className="mt-3 h-4 w-2/3 animate-skeleton rounded bg-elev-2/85" />
                  <div className="mt-2 h-4 w-1/3 animate-skeleton rounded bg-elev-2/85" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Наверх"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-elevated text-lg font-bold text-fg shadow-soft transition-all duration-[250ms] ease-out ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        ↑
      </button>

      {categorySheetOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-main/40 p-4 backdrop-blur-sm animate-[feedBackdropIn_200ms_ease-out] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-category-title"
          onClick={() => setCategorySheetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-line bg-elevated p-4 shadow-soft animate-[feedSheetUp_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="feed-category-title" className="text-base font-semibold text-fg">
              Выберите категорию
            </h2>
            <div className="mt-3 max-h-[55vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  trackEvent("category_select_sheet", { category: ALL_CATEGORY });
                  setSelectedCategory(ALL_CATEGORY);
                  setCategorySheetOpen(false);
                }}
                className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedCategory === ALL_CATEGORY
                    ? "bg-accent/10 text-accent"
                    : "text-fg hover:bg-elev-2"
                }`}
              >
                <span>Все</span>
                {selectedCategory === ALL_CATEGORY ? <span>✓</span> : null}
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    trackEvent("category_select_sheet", { category: cat.id });
                    setSelectedCategory(cat.id);
                    setCategorySheetOpen(false);
                  }}
                  className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedCategory === cat.id
                      ? "bg-accent/10 text-accent"
                      : "text-fg hover:bg-elev-2"
                  }`}
                >
                  <span>{cat.label}</span>
                  {selectedCategory === cat.id ? <span>✓</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {citySheetOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-main/40 p-4 backdrop-blur-sm animate-[feedBackdropIn_200ms_ease-out] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-city-title"
          onClick={() => setCitySheetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-line bg-elevated p-4 shadow-soft animate-[feedSheetUp_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="feed-city-title" className="text-base font-semibold text-fg">
                Локация
              </h2>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
                {citySheetStep} из 2
              </span>
            </div>
            {citySheetStep === 2 ? (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-fg">{selectedRegionName || "Выбран регион"}</p>
                <button
                  type="button"
                  onClick={() => setCitySheetStep(1)}
                  className="pressable rounded-card border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg"
                >
                  Назад
                </button>
              </div>
            ) : null}
            <div className="relative mt-3 h-[min(58vh,460px)] overflow-hidden">
              <div
                className={`absolute inset-0 transition-all duration-250 ${
                  citySheetStep === 1
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-4 pointer-events-none opacity-0"
                }`}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Выберите регион
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pr-1 [-webkit-overflow-scrolling:touch]">
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent("city_select", { scope: "all_cities", feedVariant });
                        setSelectedRegionId("");
                        setCity("");
                        setSelectedCityId("");
                        setDistrict("");
                        setDistricts([]);
                        setCitySheetOpen(false);
                      }}
                      className={`pressable mb-2 flex w-full flex-col gap-0.5 rounded-card border px-3 py-3 text-left transition-colors ${
                        allCitiesFilterActive
                          ? "border-accent/40 bg-accent/12 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "border-line/80 bg-elev-2/40 text-fg hover:bg-elev-2"
                      }`}
                    >
                      <span className="text-[13px] font-semibold leading-tight tracking-tight">
                        Все города
                      </span>
                      <span className="text-[11px] font-normal leading-snug text-muted">
                        Объявления по всей России
                      </span>
                    </button>
                    {regions.map((region) => (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => {
                          setSelectedRegionId(region.id);
                          setCitySheetStep(2);
                        }}
                        className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                          !allCitiesFilterActive && selectedRegionId === region.id
                            ? "bg-accent/10 text-accent"
                            : "text-fg hover:bg-elev-2"
                        }`}
                      >
                        <span>{region.name}</span>
                        {!allCitiesFilterActive && selectedRegionId === region.id ? <span>✓</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div
                className={`absolute inset-0 transition-all duration-250 ${
                  citySheetStep === 2
                    ? "translate-x-0 opacity-100"
                    : "translate-x-4 pointer-events-none opacity-0"
                }`}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Выберите город
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pr-1 [-webkit-overflow-scrolling:touch]">
                    {cities.map((cityOption) => (
                      <button
                        key={cityOption.id}
                        type="button"
                        onClick={() => {
                          trackEvent("city_select", {
                            city: cityOption.name,
                            regionId: selectedRegionId,
                          });
                          setCity(cityOption.name);
                          setSelectedCityId(cityOption.id);
                          setDistrict("");
                          setCitySheetOpen(false);
                        }}
                        className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                          city === cityOption.name
                            ? "bg-accent/10 text-accent"
                            : "text-fg hover:bg-elev-2"
                        }`}
                      >
                        <span>{cityOption.name}</span>
                        {city === cityOption.name ? <span>✓</span> : null}
                      </button>
                    ))}
                    {cities.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted">
                        В этом регионе пока нет городов
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {filtersSheetOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-main/40 p-4 backdrop-blur-sm animate-[feedBackdropIn_200ms_ease-out] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-filters-title"
          onClick={() => setFiltersSheetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-line bg-elevated p-4 shadow-soft animate-[feedSheetUp_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="feed-filters-title" className="text-base font-semibold text-fg">
              Фильтры и сортировка
            </h2>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                Сортировка
              </label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as FeedSort)}
                className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg"
              >
                <option value="newest">Сначала новые</option>
                <option value="price_asc">Сначала дешёвые</option>
                <option value="price_desc">Сначала дорогие</option>
              </select>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                Цена
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  {...priceFromInput}
                  placeholder="От"
                  className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm tabular-nums tracking-tight text-fg placeholder:text-muted"
                />
                <input
                  {...priceToInput}
                  placeholder="До"
                  className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm tabular-nums tracking-tight text-fg placeholder:text-muted"
                />
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                Район
              </label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                disabled={!selectedCityId || districts.length === 0}
                className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {!selectedCityId
                    ? "Сначала выберите город"
                    : districts.length === 0
                      ? "Для города пока нет районов"
                      : "Любой район"}
                </option>
                {districts.map((districtOption) => (
                  <option key={districtOption.id} value={districtOption.name}>
                    {districtOption.name}
                  </option>
                ))}
              </select>
              {selectedCategory === "auto" ? (
                <>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Авто
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={autoYearFrom} onChange={(e) => setAutoYearFrom(e.target.value)} inputMode="numeric" placeholder="Год от" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                    <input value={autoYearTo} onChange={(e) => setAutoYearTo(e.target.value)} inputMode="numeric" placeholder="Год до" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={autoMileageFrom} onChange={(e) => setAutoMileageFrom(e.target.value)} inputMode="numeric" placeholder="Пробег от" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                    <input value={autoMileageTo} onChange={(e) => setAutoMileageTo(e.target.value)} inputMode="numeric" placeholder="Пробег до" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                  </div>
                  <select value={autoTransmission} onChange={(e) => setAutoTransmission(e.target.value)} className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg">
                    <option value="">Коробка: любая</option>
                    <option value="механика">Механика</option>
                    <option value="автомат">Автомат</option>
                    <option value="робот">Робот</option>
                    <option value="вариатор">Вариатор</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input type="checkbox" checked={autoClearedOnly} onChange={(e) => setAutoClearedOnly(e.target.checked)} />
                    Растаможен
                  </label>
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input type="checkbox" checked={autoDamagedOnly} onChange={(e) => setAutoDamagedOnly(e.target.checked)} />
                    Битый
                  </label>
                </>
              ) : null}
              {selectedCategory === "realestate" ? (
                <>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Недвижимость
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={realAreaFrom} onChange={(e) => setRealAreaFrom(e.target.value)} inputMode="numeric" placeholder="Площадь от" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                    <input value={realAreaTo} onChange={(e) => setRealAreaTo(e.target.value)} inputMode="numeric" placeholder="Площадь до" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={realFloor} onChange={(e) => setRealFloor(e.target.value)} inputMode="numeric" placeholder="Этаж" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                    <input value={realFloorsTotal} onChange={(e) => setRealFloorsTotal(e.target.value)} inputMode="numeric" placeholder="Этажность" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                    <input value={realRooms} onChange={(e) => setRealRooms(e.target.value)} inputMode="numeric" placeholder="Комнаты" className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted" />
                  </div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Участок (площадь)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={realPlotFrom}
                      onChange={(e) => setRealPlotFrom(e.target.value)}
                      inputMode="decimal"
                      placeholder={realPlotUseHa ? "От, га" : "От, сот."}
                      className="min-w-[108px] flex-1 rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted"
                    />
                    <input
                      value={realPlotTo}
                      onChange={(e) => setRealPlotTo(e.target.value)}
                      inputMode="decimal"
                      placeholder={realPlotUseHa ? "До, га" : "До, сот."}
                      className="min-w-[108px] flex-1 rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted"
                    />
                    <label className="flex shrink-0 cursor-pointer select-none items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={realPlotUseHa}
                        aria-label="Площадь участка в гектарах"
                        onClick={() => setRealPlotUseHa((v) => !v)}
                        className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border transition-colors duration-200 ${
                          realPlotUseHa
                            ? "border-accent bg-accent"
                            : "border-line bg-elev-2"
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 ${
                            realPlotUseHa ? "translate-x-[22px]" : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        ГА
                      </span>
                    </label>
                  </div>
                </>
              ) : null}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setFiltersSheetOpen(false)}
                  className="pressable min-h-[44px] rounded-card border border-line bg-elev-2 px-3 text-sm font-medium text-fg"
                >
                  Применить
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="pressable min-h-[44px] rounded-card border border-line bg-elevated px-3 text-sm font-medium text-muted"
                >
                  Сбросить
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx global>{`
        @keyframes feedBackdropIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes feedSheetUp {
          from {
            transform: translateY(100%);
            opacity: 0.96;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}
