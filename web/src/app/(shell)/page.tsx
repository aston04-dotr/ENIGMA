"use client";

import type { Session } from "@supabase/supabase-js";
import { EmptyState } from "@/components/EmptyState";
import {
  ErrorUi,
  FETCH_ERROR_MESSAGE,
  LISTINGS_FEED_ERROR_MESSAGE,
} from "@/components/ErrorUi";
import { LandingScreen } from "@/components/LandingScreen";
import { ListingCard } from "@/components/ListingCard";
import { useAuth } from "@/context/auth-context";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { trackEvent } from "@/lib/analytics";
import { ALLOWED_LISTING_CITIES, isAllowedListingCity } from "@/lib/russianCities";
import { listingIsRussiaForFeed } from "@/lib/feedGeo";
import {
  fetchListings,
  getCitiesFromDb,
  type FeedListingsCursor,
} from "@/lib/listings";
import { subscribeListingPromotionApplied } from "@/lib/listingPromotionEvents";
import { interleavePartnerFeedMain } from "@/lib/monetization";
import { parsePlotAreaToSotki, plotFilterBoundsToSotki } from "@/lib/plotAreaSotki";
import type { ListingRow } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CACHE_KEY = "cached_listings";
const FEED_CATEGORY_KEY = "feed_category";
const FEED_STATE_KEY = "feed_state";
const ALL_CATEGORY = "all";
const FILTERS_DEBOUNCE_MS = 350;

type FeedCache = { items: ListingRow[]; nextCursor: FeedListingsCursor | null };
type StoredFeedState = {
  city?: string;
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
  const normalized = String(raw ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
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

function readFeedCache(): FeedCache {
  if (typeof window === "undefined") return { items: [], nextCursor: null };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
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
) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, nextCursor }));
  } catch {
    /* quota / private mode */
  }
}

function sortByCreatedDesc(rows: ListingRow[]) {
  return [...rows].sort((a, b) => {
    const tb = new Date(b.created_at).getTime();
    const ta = new Date(a.created_at).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

function mixFeed(rows: ListingRow[], userId?: string) {
  const sorted = sortByCreatedDesc(rows);
  try {
    const interleaved = interleavePartnerFeedMain(sorted, { userId });
    return Array.isArray(interleaved) ? interleaved : sorted;
  } catch (e) {
    console.error("LISTINGS FEED MIX ERROR", e);
    return sorted;
  }
}

export default function HomePage() {
  const { session, loading } = useAuth();

  if (loading && !session?.user) {
    return <LandingScreen />;
  }

  if (!session?.user) {
    return <LandingScreen />;
  }

  return (
    <div className="min-h-screen bg-main">
      <FeedPage session={session} />
    </div>
  );
}

function FeedPage({ session }: { session: Session }) {
  const feedSeed = useMemo(() => readFeedCache(), []);
  const feedStateSeed = useMemo(() => readFeedState(), []);
  const seededCity = String(feedStateSeed?.city ?? "").trim();
  const seededCategory = String(feedStateSeed?.category ?? "").trim();
  const [items, setItems] = useState<ListingRow[]>(() => feedSeed.items);
  const [nextCursor, setNextCursor] = useState<FeedListingsCursor | null>(
    () => feedSeed.nextCursor,
  );
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedNotice, setFeedNotice] = useState<string | null>(null);
  const [city, setCity] = useState<string>(
    isAllowedListingCity(seededCity) ? seededCity : ALLOWED_LISTING_CITIES[0],
  );
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (seededCategory === ALL_CATEGORY) return ALL_CATEGORY;
    return CATEGORIES.some((x) => x.id === seededCategory)
      ? seededCategory
      : ALL_CATEGORY;
  });
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [sortMode, setSortMode] = useState<FeedSort>("newest");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
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
  const [cities, setCities] = useState<string[]>([...ALLOWED_LISTING_CITIES]);
  const [feedNonce, setFeedNonce] = useState(0);

  useEffect(() => {
    void (async () => {
      const dbCities = await getCitiesFromDb();
      console.log("[CITIES-FEED] Loaded:", dbCities.length, "cities");
      setCities(dbCities);
    })();
  }, []);

  useEffect(() => {
    if (seededCategory) return;
    setSelectedCategory(readStoredFeedCategory());
  }, [seededCategory]);

  useEffect(() => {
    const state = readFeedState();
    if (!state) return;
    const savedCity = String(state.city ?? "").trim();
    const savedCategory = String(state.category ?? "").trim();
    const savedScrollY = Number(state.scrollY ?? 0);
    if (isAllowedListingCity(savedCity)) {
      setCity(savedCity);
    }
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
    const id = window.setTimeout(() => {
      persistFeedState({
        city,
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
      });
    }, FILTERS_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [
    city,
    selectedCategory,
    realAreaFrom,
    realAreaTo,
    realFloor,
    realFloorsTotal,
    realPlotFrom,
    realPlotTo,
    realPlotUseHa,
  ]);

  const [showScrollTop, setShowScrollTop] = useState(false);

  const prefetchedRef = useRef<FeedCache | null>(null);
  const prefetchKeyRef = useRef<string | null>(null);
  const prefetchingRef = useRef(false);
  const loadMoreLockRef = useRef(false);
  const lastPrefetchAtRef = useRef(0);
  const lastLoadMoreAtRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedFilters = useMemo(() => {
    const f: Parameters<typeof fetchListings>[0] = { city: city.trim() };
    if (selectedCategory !== ALL_CATEGORY) {
      f.category = selectedCategory;
    }
    return f;
  }, [city, selectedCategory]);

  const filtered = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const base = items.filter((x) => {
      if (!listingIsRussiaForFeed(x)) return false;
      if (x.city?.toLowerCase().trim() !== city.toLowerCase().trim()) return false;
      if (selectedCategory === ALL_CATEGORY) return true;
      return (x.category ?? "").trim() === selectedCategory;
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

    const afterFilters = base.filter((row) => {
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
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return sorted;
    }
    if (sortMode === "price_desc") {
      sorted.sort((a, b) => {
        const pa = getListingPriceForSort(a);
        const pb = getListingPriceForSort(b);
        if (pa !== pb) return pb - pa;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return sorted;
    }
    sorted.sort((a, b) => {
      const tb = new Date(b.created_at).getTime();
      const ta = new Date(a.created_at).getTime();
      if (tb !== ta) return tb - ta;
      return b.id.localeCompare(a.id);
    });
    return sorted;
  }, [
    items,
    city,
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
        realFloor,
        realFloorsTotal,
        realRooms,
        sortMode,
        realPlotFrom,
        realPlotTo,
        realPlotUseHa,
      ]);

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
          setItems(raw);
          setNextCursor(res.nextCursor ?? null);
          persistFeed(raw, res.nextCursor ?? null);
        }
        return;
      }
      prefetchedRef.current = null;
      prefetchKeyRef.current = null;
      setFeedError(null);
      const mix = mixFeed(raw, session?.user?.id);
      const serverNext = res.nextCursor ?? null;
      if (mode === "replace") {
        setItems(mix);
        setNextCursor(serverNext);
        persistFeed(mix, serverNext);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const add = mix.filter((x) => !seen.has(x.id));
          const merged = [...prev, ...add];
          persistFeed(merged, serverNext);
          return merged;
        });
        setNextCursor(serverNext);
      }
    },
    [session?.user?.id],
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
            setItems(raw);
            setNextCursor(res.nextCursor ?? null);
            persistFeed(raw, res.nextCursor ?? null);
            return;
          }
          prefetchedRef.current = null;
          prefetchKeyRef.current = null;
          setFeedError(null);
          const mix = mixFeed(raw, session?.user?.id);
          const serverNext = res.nextCursor ?? null;
          setItems(mix);
          setNextCursor(serverNext);
          persistFeed(mix, serverNext);
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
  }, [feedFilters, session?.user?.id, feedNonce]);

  useEffect(() => {
    return subscribeListingPromotionApplied(() => {
      setFeedNonce((n) => n + 1);
    });
  }, []);

  const runPrefetch = useCallback(async () => {
    if (!nextCursor || prefetchingRef.current) return;
    const key = `${nextCursor.created_at}\0${nextCursor.id}\0${city}\0${selectedCategory}`;
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
  }, [nextCursor, feedFilters, city, selectedCategory, session?.user?.id]);

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
      const merged = [...prev, ...add];
      persistFeed(merged, p.nextCursor);
      return merged;
    });
    setNextCursor(p.nextCursor);
    return true;
  }, []);

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
    const onScroll = () => {
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
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [nextCursor, runPrefetch, loadMore]);

  const categoryTitle =
    selectedCategory === ALL_CATEGORY ? "Все" : categoryLabel(selectedCategory);
  const foundCountLabel = new Intl.NumberFormat("ru-RU").format(filtered.length);
  const filterRowClass =
    "pressable flex w-full items-center justify-between rounded-card border border-line bg-elevated px-4 py-3 text-left transition-colors hover:bg-elev-2 active:scale-[0.995]";
  const hasActiveFilters =
    city !== ALLOWED_LISTING_CITIES[0] ||
    selectedCategory !== ALL_CATEGORY ||
    sortMode !== "newest" ||
    Boolean(
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
  const quickCategories = useMemo(() => CATEGORIES.slice(0, 8), []);

  const resetFilters = useCallback(() => {
    trackEvent("filters_reset", {
      city,
      category: selectedCategory,
    });
    setCity(ALLOWED_LISTING_CITIES[0]);
    setSelectedCategory(ALL_CATEGORY);
    setSortMode("newest");
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
      city,
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
    });
  }, [
    city,
    selectedCategory,
    realAreaFrom,
    realAreaTo,
    realFloor,
    realFloorsTotal,
    realPlotFrom,
    realPlotTo,
    realPlotUseHa,
  ]);

  return (
    <main className="safe-pt min-h-screen bg-main">
      <header className="border-b border-line bg-main">
        <div className="mx-auto w-full max-w-none px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="relative -top-0.5 pb-0.5 bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] bg-clip-text text-[28px] font-bold leading-none tracking-tight text-transparent">
                Enigma
              </h1>
            </div>
          </div>
          <div className="mt-6 space-y-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setCitySheetOpen(true)}
                className={filterRowClass}
              >
                <span className="text-sm text-fg">Город: {city}</span>
                <span className="text-sm font-semibold text-muted">{">"}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategorySheetOpen(true)}
                className={filterRowClass}
              >
                <span className="text-sm text-fg">Категория: {categoryTitle}</span>
                <span className="text-sm font-semibold text-muted">{">"}</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltersSheetOpen(true)}
                className={filterRowClass}
              >
                <span className="text-sm text-fg">Фильтры: {sortLabel}</span>
                <span className="text-sm font-semibold text-muted">{">"}</span>
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
                className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  selectedCategory === ALL_CATEGORY
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-line bg-elevated text-fg hover:bg-elev-2"
                }`}
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
                  className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selectedCategory === cat.id
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-line bg-elevated text-fg hover:bg-elev-2"
                  }`}
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
        {filtered.map((item, idx) => (
          <ListingCard
            key={item.id}
            item={item}
            index={idx}
            onOpen={rememberFeedStateBeforeOpen}
          />
        ))}
        {filtered.length === 0 ? (
          <EmptyState
            title="Пока пусто. Создай первое объявление."
            subtitle="Запусти ленту первым - это займёт меньше минуты."
            actionLabel="Создать"
            actionHref="/create"
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
            <h2 id="feed-city-title" className="text-base font-semibold text-fg">
              Выберите город
            </h2>
            <div className="mt-3 max-h-[55vh] overflow-y-auto">
              {cities.map((cityOption) => (
                <button
                  key={cityOption}
                  type="button"
                  onClick={() => {
                    trackEvent("city_select", { city: cityOption });
                    setCity(cityOption || ALLOWED_LISTING_CITIES[0]);
                    setCitySheetOpen(false);
                  }}
                  className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                    city === cityOption
                      ? "bg-accent/10 text-accent"
                      : "text-fg hover:bg-elev-2"
                  }`}
                >
                  <span>{cityOption}</span>
                  {city === cityOption ? <span>✓</span> : null}
                </button>
              ))}
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
                  value={priceFrom}
                  onChange={(e) => setPriceFrom(e.target.value)}
                  inputMode="numeric"
                  placeholder="От"
                  className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted"
                />
                <input
                  value={priceTo}
                  onChange={(e) => setPriceTo(e.target.value)}
                  inputMode="numeric"
                  placeholder="До"
                  className="w-full rounded-card border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted"
                />
              </div>
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
