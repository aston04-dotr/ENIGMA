import { isValidListingUuid } from "./listingParams";
import { isSchemaNotInCache, logRlsIfBlocked } from "./postgrestErrors";
import { getListingsPageSize } from "./runtimeConfig";
import { FAVORITES_CHANGED_EVENT } from "./favoriteEvents";
import { trackEvent } from "./analytics";
import { decreaseTrust } from "./trust";
import { supabase, isSupabaseConfigured } from "./supabase";
import {
  ALLOWED_LISTING_CITIES,
  isAllowedListingCity,
  normalizeAllowedListingCity,
} from "./russianCities";
import type { ListingInsertPayload, ListingRow, UserRow } from "./types";

const LISTING_DETAIL_FETCH_MS = 5000;

/** Размер страницы ленты (limit в fetchListings). */
export const LISTINGS_PAGE_SIZE = getListingsPageSize();

/** Курсор keyset: `created_at` не уникален — добавляем `id`. */
export type FeedListingsCursor = { created_at: string; id: string };

const FEED_SELECT = "*,images(url,sort_order)";

function quotePostgrestValue(v: string): string {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function compositeCursorOrClause(c: FeedListingsCursor): string {
  const ts = quotePostgrestValue(c.created_at);
  const id = quotePostgrestValue(c.id);
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`;
}

/** Колонки недвижимости из PostgREST (* включает их при наличии в схеме). */
function applyListingRealEstateColumns(row: ListingRow, data: Record<string, unknown>): void {
  const plot = data.plot_area;
  if (plot != null && String(plot).trim() !== "") {
    row.plot_area = String(plot).trim();
  }
  const landType = data.land_type;
  if (landType != null && String(landType).trim() !== "") {
    row.land_type = String(landType).trim();
  }
  const landOwn = data.land_ownership_status;
  if (landOwn != null && String(landOwn).trim() !== "") {
    row.land_ownership_status = String(landOwn).trim();
  }
  if (typeof data.comms_gas === "boolean") row.comms_gas = data.comms_gas;
  if (typeof data.comms_water === "boolean") row.comms_water = data.comms_water;
  if (data.comms_electricity != null && String(data.comms_electricity).trim() !== "") {
    row.comms_electricity = String(data.comms_electricity).trim();
  }
  if (typeof data.comms_sewage === "boolean") row.comms_sewage = data.comms_sewage;
}

function applyListingAutoEngineColumns(row: ListingRow, data: Record<string, unknown>): void {
  const ep = data.engine_power;
  if (ep != null && String(ep).trim() !== "") {
    row.engine_power = String(ep).trim();
  }
  const ev = data.engine_volume;
  if (ev != null && String(ev).trim() !== "") {
    row.engine_volume = String(ev).trim();
  }
}

function applyListingMotoColumns(row: ListingRow, data: Record<string, unknown>): void {
  const mt = data.moto_type;
  if (mt != null && String(mt).trim() !== "") {
    row.moto_type = String(mt).trim();
  }
  const me = data.moto_engine;
  if (me != null && String(me).trim() !== "") {
    row.moto_engine = String(me).trim();
  }
  const mm = data.moto_mileage;
  if (mm != null && String(mm).trim() !== "") {
    row.moto_mileage = String(mm).trim();
  }
  const mc = data.moto_customs_cleared;
  if (mc != null && String(mc).trim() !== "") {
    row.moto_customs_cleared = String(mc).trim();
  }
  const mo = data.moto_owners_pts;
  if (mo != null && String(mo).trim() !== "") {
    row.moto_owners_pts = String(mo).trim();
  }
}

function applyListingExpiryColumns(row: ListingRow, data: Record<string, unknown>): void {
  const st = data.status;
  if (st != null && String(st).trim() !== "") {
    row.status = String(st).trim();
  }
  const ex = data.expires_at;
  if (ex != null && String(ex).trim() !== "") {
    row.expires_at = String(ex).trim();
  }
}

function dedupeListingsById(rows: ListingRow[]): ListingRow[] {
  const seen = new Set<string>();
  const out: ListingRow[] = [];
  for (const r of rows) {
    const id = String(r?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

function parseFeedListingRow(data: Record<string, unknown>): ListingRow {
  const normalizedCity = normalizeAllowedListingCity(data.city ?? data.location);
  const row: ListingRow = {
    id: String(data.id),
    user_id: String(data.user_id ?? ""),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    price: Number(data.price ?? 0),
    category: String(data.category ?? ""),
    city: normalizedCity,
    view_count: 0,
    created_at: String(data.created_at ?? ""),
    is_partner_ad: data.is_partner_ad === true,
    is_boosted: data.is_boosted === true,
    boosted_at: data.boosted_at != null ? String(data.boosted_at) : null,
    boosted_until: data.boosted_until != null ? String(data.boosted_until) : null,
    images: normalizeListingImages(data.images),
  };
  (row as ListingRow & { contact_phone?: string | null }).contact_phone =
    data.contact_phone != null ? String(data.contact_phone) : null;
  (row as ListingRow & { params?: Record<string, unknown> | null }).params =
    data.params && typeof data.params === "object"
      ? (data.params as Record<string, unknown>)
      : null;
  applyListingRealEstateColumns(row, data);
  applyListingAutoEngineColumns(row, data);
  applyListingMotoColumns(row, data);
  applyListingExpiryColumns(row, data);
  const dtFeed = data.deal_type;
  if (dtFeed != null && String(dtFeed).trim() !== "") {
    row.deal_type = String(dtFeed).trim();
  }
  const ctFeed = data.commercial_type;
  if (ctFeed != null && String(ctFeed).trim() !== "") {
    row.commercial_type = String(ctFeed).trim();
  }
  const lkFeed = data.listing_kind;
  if (lkFeed != null && String(lkFeed).trim() !== "") {
    row.listing_kind = String(lkFeed).trim();
  }
  const fcFeed = data.favorite_count;
  if (fcFeed != null && fcFeed !== "") {
    const n = Number(fcFeed);
    if (Number.isFinite(n)) row.favorite_count = n;
  }
  return row;
}

export type FetchListingsResult = {
  listings: ListingRow[];
  sqlSetupRequired: boolean;
  /** Всегда задано явно: `null` = нет блокирующей ошибки для ленты */
  error: string | null;
  /** Информация (например, демо-лента при сбое сети) */
  notice?: string | null;
  /** Курсор следующей страницы или конец ленты */
  nextCursor: FeedListingsCursor | null;
};

function getDemoListings(): ListingRow[] {
  const now = new Date().toISOString();
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000000",
      title: "Тестовое объявление",
      description: "Демо-карточка: проверь интернет и переменные Supabase в .env.",
      price: 1000,
      category: "other",
      city: "Москва",
      view_count: 0,
      created_at: now,
      status: "active",
      images: [],
      is_boosted: false,
      is_partner_ad: false,
      deal_type: "sale",
      listing_kind: "offer",
    },
  ];
}

function normalizeFeedCursor(raw: unknown): FeedListingsCursor | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    return null;
  }
  if (typeof raw === "object" && raw !== null && "created_at" in raw && "id" in raw) {
    const o = raw as { created_at: unknown; id: unknown };
    const created_at = String(o.created_at ?? "").trim();
    const id = String(o.id ?? "").trim();
    if (!created_at || !id) return null;
    return { created_at, id };
  }
  return null;
}

function isRealError(error: unknown): error is { message: string } {
  if (!error) return false;
  const maybeError = error as { message?: unknown };
  if (typeof maybeError.message !== "string") return false;
  const msg = maybeError.message.trim();
  if (!msg) return false;
  if (msg === "Load failed") return false;
  if (msg.toLowerCase().includes("fetch")) return false;
  return true;
}

type ListingFilters = {
  category?: string;
  /** Фильтр по нескольким категориям (для ленты запросов). */
  categoriesIn?: string[];
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  city?: string;
  dealType?: "sale" | "rent";
  listingKind?: "offer" | "seeking";
};

function listingsFeedSelectBase() {
  return supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .in("city", [...ALLOWED_LISTING_CITIES])
    .order("sort_order", { ascending: true, foreignTable: "images" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LISTINGS_PAGE_SIZE);
}

type ListingsFeedQuery = ReturnType<typeof listingsFeedSelectBase>;

/** Колонки вне строгих типов клиента Supabase — только через строковые фильтры. */
type LooseFeedQuery = ListingsFeedQuery & {
  eq: (column: string, value: string) => ListingsFeedQuery;
  or: (filters: string) => ListingsFeedQuery;
  textSearch: (
    column: string,
    query: string,
    options?: { config?: string; type?: "plain" | "phrase" | "websearch" },
  ) => ListingsFeedQuery;
};

type SearchMode = "fts" | "ilike";

function applySafeFilters(
  query: ListingsFeedQuery,
  filters: ListingFilters,
  searchActive: boolean,
  searchTrim: string,
  searchMode: SearchMode = "fts",
): ListingsFeedQuery {
  try {
    let q = query;
    const loose = () => q as unknown as LooseFeedQuery;
    const city = normalizeAllowedListingCity(filters.city);
    if (city) {
      q = q.eq("city", city);
    }
    const category = filters.category?.trim();
    if (filters.categoriesIn && filters.categoriesIn.length > 0) {
      q = q.in("category", filters.categoriesIn);
    } else if (category) {
      q = q.eq("category", category);
    }

    if (filters.listingKind === "seeking") {
      q = loose().eq("listing_kind", "seeking");
    } else if (filters.listingKind === "offer") {
      q = loose().or("listing_kind.eq.offer,listing_kind.is.null");
    }

    if (filters.dealType === "rent") {
      q = loose().eq("deal_type", "rent");
    } else if (filters.dealType === "sale") {
      q = loose().or("deal_type.eq.sale,deal_type.is.null");
    }

    if (searchActive) {
      const safe = searchTrim
        .replace(/%/g, "")
        .replace(/_/g, "")
        .replace(/,/g, "")
        .replace(/[()]/g, "")
        .slice(0, 80);
      if (safe.length >= 3) {
        if (searchMode === "fts") {
          const tsQuery = safe
            .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (tsQuery.length >= 3) {
            q = loose().textSearch("fts", tsQuery, {
              config: "russian",
              type: "websearch",
            });
          }
        } else {
          q = loose().or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
        }
      }
    }
    if (filters.minPrice != null && Number.isFinite(Number(filters.minPrice))) {
      q = q.gte("price", filters.minPrice);
    }
    if (filters.maxPrice != null && Number.isFinite(Number(filters.maxPrice))) {
      q = q.lte("price", filters.maxPrice);
    }
    return q;
  } catch (filterErr) {
    console.warn("LISTINGS FILTER APPLY ERROR:", filterErr);
    return query;
  }
}

function rpcErrorPayload(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { raw: error };
  }
  const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    message: e.message,
    code: e.code,
    details: e.details,
    hint: e.hint,
    raw: error,
  };
}

/**
 * Лента: безопасный запрос к БД, опциональные фильтры, повтор при ошибке, демо при полном сбое.
 */
export async function fetchListings(filters: {
  category?: string;
  categoriesIn?: string[];
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  city?: string;
  dealType?: "sale" | "rent";
  listingKind?: "offer" | "seeking";
  /** Курсор следующей страницы (composite). Строковый legacy-курсор игнорируется. */
  cursor?: FeedListingsCursor | string | null;
}): Promise<FetchListingsResult> {
  const seekingNoDemo = filters.listingKind === "seeking";

  const demo = (notice: string): FetchListingsResult => ({
    listings: getDemoListings(),
    sqlSetupRequired: false,
    error: null,
    notice,
    nextCursor: null,
  });

  const emptySeeking = (notice: string | null): FetchListingsResult => ({
    listings: [],
    sqlSetupRequired: false,
    error: null,
    notice,
    nextCursor: null,
  });

  if (!isSupabaseConfigured) {
    return seekingNoDemo
      ? emptySeeking("Нет ключей Supabase в .env.")
      : demo("Нет ключей Supabase в .env — показаны примеры.");
  }

  const cursor = normalizeFeedCursor(filters.cursor);

  const searchTrim = filters.search?.trim() ?? "";
  const searchActive = searchTrim.length >= 3;

  const filterPayload: ListingFilters = {
    city: filters.city,
    category: filters.category,
    categoriesIn:
      Array.isArray(filters.categoriesIn) && filters.categoriesIn.length > 0
        ? filters.categoriesIn
        : undefined,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    search: filters.search,
    dealType: filters.dealType,
    listingKind: filters.listingKind,
  };

  const hasFilters = Boolean(
    filters.city?.trim() ||
      filters.category?.trim() ||
      (filters.categoriesIn && filters.categoriesIn.length > 0) ||
      searchActive ||
      filters.minPrice != null ||
      filters.maxPrice != null ||
      filters.dealType ||
      filters.listingKind,
  );

  try {
    const runOnce = async () => {
      const mkQuery = (
        useLtCreatedAt: boolean,
        withFilters: boolean,
        searchMode: SearchMode,
      ) => {
        let q = listingsFeedSelectBase();
        if (cursor) {
          q = useLtCreatedAt ? q.lt("created_at", cursor.created_at) : q.or(compositeCursorOrClause(cursor));
        }
        if (withFilters) {
          q = applySafeFilters(q, filterPayload, searchActive, searchTrim, searchMode);
        }
        return q;
      };

      let { data, error } = await mkQuery(false, true, "fts");

      if (isRealError(error) && !data && cursor) {
        console.warn("LISTINGS composite cursor query failed, fallback lt(created_at):", error);
        const second = await mkQuery(true, true, "fts");
        data = second.data;
        error = second.error;
      }

      if (!isRealError(error) && searchActive && Array.isArray(data) && data.length === 0) {
        const fallbackSearch = await mkQuery(false, true, "ilike");
        data = fallbackSearch.data;
        error = fallbackSearch.error;
      }

      if (isRealError(error) && !data && hasFilters) {
        console.warn("LISTINGS filtered query failed without data; falling back to base:", error);
        let fallback = await mkQuery(false, false, "fts");
        if (isRealError(fallback.error) && !fallback.data && cursor) {
          fallback = await mkQuery(true, false, "fts");
        }
        data = fallback.data;
        error = fallback.error;
      }

      return { data, error };
    };

    let { data, error } = await runOnce();

    if (isRealError(error) && !data) {
      console.error("REAL LISTINGS ERROR:", error.message);
      await new Promise((r) => setTimeout(r, 200));
      const second = await runOnce();
      data = second.data;
      error = second.error;
      if (isRealError(error) && !data) {
        console.error("REAL LISTINGS ERROR:", error.message);
        return seekingNoDemo
          ? emptySeeking(
              "Не удалось загрузить запросы. Проверь интернет или попробуй позже.",
            )
          : demo("Не удалось загрузить объявления. Проверь интернет или попробуй позже.");
      }
    }

    const rows = Array.isArray(data) ? data : [];
    let listings = rows.map((r) => parseFeedListingRow(r as Record<string, unknown>));
    listings = dedupeListingsById(listings);
    if (listings.length === 0) {
      if (seekingNoDemo) {
        return emptySeeking(null);
      }
      return demo("Объявлений пока нет — показаны примеры.");
    }

    const pack = (merged: ListingRow[]): FetchListingsResult => {
      const last = merged.length > 0 ? merged[merged.length - 1]! : null;
      const nextCursor: FeedListingsCursor | null =
        merged.length === LISTINGS_PAGE_SIZE && last
          ? { created_at: last.created_at, id: last.id }
          : null;
      return {
        listings: merged,
        sqlSetupRequired: false,
        error: null,
        notice: null,
        nextCursor,
      };
    };

    try {
      const merged = await mergeFavoriteCounts(listings);
      console.log("FETCH LISTINGS RESULT", {
        count: merged.length,
        pageSize: LISTINGS_PAGE_SIZE,
        cursor: cursor ?? "(none)",
      });
      return pack(dedupeListingsById(merged));
    } catch (mergeErr) {
      console.warn("LISTINGS MERGE WARNING:", mergeErr);
      return pack(listings);
    }
  } catch (e) {
    if (isRealError(e)) {
      console.error("REAL LISTINGS ERROR:", e.message);
    }
    return seekingNoDemo
      ? emptySeeking("Ошибка загрузки. Попробуй обновить страницу.")
      : demo("Ошибка загрузки. Показаны примеры — попробуй обновить страницу.");
  }
}

export async function fetchListingsCount(filters: {
  category?: string;
  categoriesIn?: string[];
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  city?: string;
  dealType?: "sale" | "rent";
  listingKind?: "offer" | "seeking";
}): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const searchTrim = filters.search?.trim() ?? "";
  const searchActive = searchTrim.length > 2;
  const filterPayload: ListingFilters = {
    city: filters.city,
    category: filters.category,
    categoriesIn:
      Array.isArray(filters.categoriesIn) && filters.categoriesIn.length > 0
        ? filters.categoriesIn
        : undefined,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    search: filters.search,
    dealType: filters.dealType,
    listingKind: filters.listingKind,
  };

  const mkCountQuery = (searchMode: SearchMode) => {
    const base = supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .in("city", [...ALLOWED_LISTING_CITIES]);
    const q = applySafeFilters(
      base as unknown as ListingsFeedQuery,
      filterPayload,
      searchActive,
      searchTrim,
      searchMode,
    );
    return q as unknown as PromiseLike<{ count: number | null; error: unknown }>;
  };

  const first = await mkCountQuery("fts");
  if (!isRealError(first.error) && typeof first.count === "number" && first.count > 0) {
    return first.count;
  }
  if (searchActive) {
    const second = await mkCountQuery("ilike");
    if (!isRealError(second.error) && typeof second.count === "number") {
      return second.count;
    }
  }
  if (!isRealError(first.error) && typeof first.count === "number") return first.count;
  return 0;
}

/**
 * Объявления пользователя (профиль, продвижение, публичный профиль).
 * Если select с вложением images падает — повтор без embed (как в ленте).
 */
export async function fetchListingsForUser(userId: string): Promise<ListingRow[]> {
  if (!userId?.trim()) return [];
  const fullSelect = FEED_SELECT;
  const { data, error } = await supabase
    .from("listings")
    .select(fullSelect)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!error && data) {
    return (data as unknown[]).map((r) => parseListingRow(r as Record<string, unknown>));
  }
  if (isSchemaNotInCache(error)) {
    return [];
  }

  const { data: plain, error: errPlain } = await supabase
    .from("listings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!errPlain && plain) {
    return (plain as unknown[]).map((r) => parseListingRow(r as Record<string, unknown>));
  }
  return [];
}

export async function getMyListings(userId: string): Promise<ListingRow[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (!error && data) {
    return (data as unknown[]).map((r) => parseListingRow(r as Record<string, unknown>));
  }
  if (isSchemaNotInCache(error)) {
    return [];
  }

  const { data: plain, error: errPlain } = await supabase
    .from("listings")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (errPlain) throw errPlain;
  return (plain as unknown[]).map((r) => parseListingRow(r as Record<string, unknown>));
}

/** Одно объявление: число избранных (RPC, SECURITY DEFINER). */
export async function fetchListingFavoriteCount(listingId: string): Promise<number> {
  if (!listingId?.trim()) return 0;
  const cached = favoriteSingleCache.get(listingId);
  if (cached && Date.now() - cached.ts < 2000) {
    return cached.value;
  }
  if (Date.now() < favoriteSingleRpcUnavailableUntil) {
    return cached?.value ?? 0;
  }
  try {
    const { data, error } = await supabase
      .schema("public")
      .rpc("listing_favorites_count", { listing_id_input: listingId });
    if (error) {
      favoriteSingleRpcUnavailableUntil = Date.now() + 15_000;
      if (process.env.NODE_ENV === "development") {
        console.warn("RPC ERROR listing_favorites_count", rpcErrorPayload(error));
      }
      return 0;
    }
    favoriteSingleRpcUnavailableUntil = 0;
    if (process.env.NODE_ENV === "development") {
      console.debug("FAVORITES:", data);
    }
    const value = Number(data ?? 0);
    setFavoriteSingleCache(listingId, value);
    return value;
  } catch (error) {
    favoriteSingleRpcUnavailableUntil = Date.now() + 15_000;
    if (process.env.NODE_ENV === "development") {
      console.warn("RPC ERROR listing_favorites_count", error);
    }
    return 0;
  }
}

type SingleFavoriteCacheEntry = { value: number; ts: number };
let favoriteSingleCache = new Map<string, SingleFavoriteCacheEntry>();
const FAVORITE_SINGLE_CACHE_LIMIT = 500;

export async function getCitiesFromDb(): Promise<string[]> {
  return [...ALLOWED_LISTING_CITIES];
}
let favoriteSingleRpcUnavailableUntil = 0;

function setFavoriteSingleCache(listingId: string, value: number) {
  const id = String(listingId ?? "").trim();
  if (!id) return;
  if (favoriteSingleCache.has(id)) {
    favoriteSingleCache.delete(id);
  }
  favoriteSingleCache.set(id, { value: Math.max(0, Number(value ?? 0)), ts: Date.now() });
  while (favoriteSingleCache.size > FAVORITE_SINGLE_CACHE_LIMIT) {
    const oldestKey = favoriteSingleCache.keys().next().value;
    if (!oldestKey) break;
    favoriteSingleCache.delete(oldestKey);
  }
}

let favoritesCountsCache = new Map<string, number>();
let favoritesCountsCacheKey = "";
let favoritesCountsLastFetch = 0;
let favoriteToggleInFlight = new Set<string>();
let favoritesCountsRpcUnavailableUntil = 0;

type FavoriteOptimisticState = {
  isFavorited: boolean;
  favoriteCount: number;
};

type ToggleFavoriteArgs = {
  listingId: string;
  state: FavoriteOptimisticState;
  onOptimistic: (next: FavoriteOptimisticState) => void;
  onRollback?: (prev: FavoriteOptimisticState) => void;
};

type ToggleFavoriteResult = {
  ok: boolean;
  state: FavoriteOptimisticState;
  error?: string;
};

function clearFavoritesBatchCache() {
  favoritesCountsCache = new Map<string, number>();
  favoritesCountsCacheKey = "";
  favoritesCountsLastFetch = 0;
}

/** Сброс in-memory кешей объявлений/избранного (кнопка «Обновить» в таббаре). */
export function resetListingClientCaches(): void {
  clearFavoritesBatchCache();
  favoriteSingleCache.clear();
  favoriteSingleRpcUnavailableUntil = 0;
  favoritesCountsRpcUnavailableUntil = 0;
}

function syncFavoriteCaches(listingId: string, favoriteCount: number) {
  const value = Math.max(0, Number(favoriteCount ?? 0));
  setFavoriteSingleCache(listingId, value);

  if (!favoritesCountsCacheKey) return;
  const ids = favoritesCountsCacheKey.split(",").filter(Boolean);
  if (!ids.includes(listingId)) return;

  favoritesCountsCache = new Map(favoritesCountsCache);
  favoritesCountsCache.set(listingId, value);
  favoritesCountsLastFetch = Date.now();
}

/** Актуальный счётчик с сервера (Realtime); синхронизирует локальные кеши ленты. */
export function applyFavoriteCountFromServer(listingId: string, favoriteCount: number): void {
  const id = String(listingId ?? "").trim();
  if (!id) return;
  syncFavoriteCaches(id, favoriteCount);
}

function normalizeFavoriteState(state: FavoriteOptimisticState): FavoriteOptimisticState {
  return {
    isFavorited: Boolean(state.isFavorited),
    favoriteCount: Math.max(0, Number(state.favoriteCount ?? 0)),
  };
}

/**
 * Мгновенный optimistic toggle (без рефетча):
 * - сразу обновляет UI через onOptimistic
 * - отправляет insert/delete
 * - при ошибке откатывает UI через onRollback
 */
export async function toggleFavorite({ listingId, state, onOptimistic, onRollback }: ToggleFavoriteArgs): Promise<ToggleFavoriteResult> {
  const id = String(listingId ?? "").trim();
  const prev = normalizeFavoriteState(state);

  if (!id) {
    return { ok: false, state: prev, error: "invalid_listing_id" };
  }

  if (favoriteToggleInFlight.has(id)) {
    return { ok: false, state: prev, error: "in_flight" };
  }

  favoriteToggleInFlight.add(id);

  const next: FavoriteOptimisticState = prev.isFavorited
    ? { isFavorited: false, favoriteCount: Math.max(0, prev.favoriteCount - 1) }
    : { isFavorited: true, favoriteCount: prev.favoriteCount + 1 };

  onOptimistic(next);

  syncFavoriteCaches(id, next.favoriteCount);

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (sessionError || !user?.id) {
      throw new Error(sessionError?.message || "not_authenticated");
    }

    if (next.isFavorited) {
      const { error } = await supabase.from("listing_favorites").insert({
        user_id: user.id,
        listing_id: id,
      });
      if (error && error.code !== "23505") {
        throw error;
      }
      trackEvent("favorite_add", { listing_id: id });
    } else {
      const { error } = await supabase
        .from("listing_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("listing_id", id);
      if (error) {
        throw error;
      }
    }

    syncFavoriteCaches(id, next.favoriteCount);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
    }

    return { ok: true, state: next };
  } catch (error) {
    console.error("RPC ERROR toggleFavorite", error);
    onRollback?.(prev);
    syncFavoriteCaches(id, prev.favoriteCount);
    return {
      ok: false,
      state: prev,
      error: error instanceof Error ? error.message : "toggle_favorite_failed",
    };
  } finally {
    favoriteToggleInFlight.delete(id);
  }
}

/** Объявления из избранного пользователя (вкладка профиля). */
export async function fetchFavoriteListingsForUser(userId: string): Promise<ListingRow[]> {
  const uid = String(userId ?? "").trim();
  if (!uid || !isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("listing_favorites")
    .select(`created_at, listings (${FEED_SELECT})`)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("fetchFavoriteListingsForUser", rpcErrorPayload(error));
    }
    return [];
  }

  const rows: ListingRow[] = [];
  for (const row of data as { listings?: unknown }[]) {
    const embedded = row.listings;
    if (embedded && typeof embedded === "object" && !Array.isArray(embedded)) {
      const parsed = parseFeedListingRow(embedded as Record<string, unknown>);
      Object.assign(parsed, { is_favorited: true, isFavorited: true });
      rows.push(parsed);
    }
  }

  try {
    return await mergeFavoriteCounts(rows);
  } catch {
    return rows;
  }
}

/** Пакетно для ленты: id → count (объявления без строк в listing_favorites получают 0). */
export async function fetchListingFavoriteCounts(listingIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(listingIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return map;
  const cacheKey = [...ids].sort().join(",");
  if (cacheKey === favoritesCountsCacheKey && Date.now() - favoritesCountsLastFetch < 2000) {
    return new Map(favoritesCountsCache);
  }
  if (Date.now() < favoritesCountsRpcUnavailableUntil) {
    if (cacheKey === favoritesCountsCacheKey && favoritesCountsCache.size > 0) {
      return new Map(favoritesCountsCache);
    }
    return map;
  }
  try {
    const { data, error } = await supabase
      .schema("public")
      .rpc("listing_favorites_counts", { ids_input: ids });
    if (error) {
      favoritesCountsRpcUnavailableUntil = Date.now() + 15_000;
      if (process.env.NODE_ENV === "development") {
        console.warn("RPC ERROR listing_favorites_counts", {
          ...rpcErrorPayload(error),
          idsCount: ids.length,
        });
      }
      return map;
    }
    favoritesCountsRpcUnavailableUntil = 0;
    if (process.env.NODE_ENV === "development") {
      console.debug("FAVORITES:", data);
    }
    if (!Array.isArray(data)) return map;
    for (const row of data as { listing_id: string; favorite_count: number | string }[]) {
      if (row?.listing_id == null) continue;
      map.set(String(row.listing_id), Number(row.favorite_count ?? 0));
    }
    favoritesCountsCache = new Map(map);
    favoritesCountsCacheKey = cacheKey;
    favoritesCountsLastFetch = Date.now();
    return map;
  } catch (error) {
    favoritesCountsRpcUnavailableUntil = Date.now() + 15_000;
    if (process.env.NODE_ENV === "development") {
      console.warn("RPC ERROR listing_favorites_counts", error);
    }
    return map;
  }
}

async function mergeFavoriteCounts(listings: ListingRow[]): Promise<ListingRow[]> {
  if (listings.length === 0) return listings;
  const countMap = await fetchListingFavoriteCounts(listings.map((listing) => listing.id));
  return listings.map((listing) => {
    const fromRow =
      listing.favorite_count != null && Number.isFinite(Number(listing.favorite_count))
        ? Number(listing.favorite_count)
        : null;
    const fromRpc = countMap.get(listing.id);
    return {
      ...listing,
      favorite_count: fromRow ?? fromRpc ?? 0,
    };
  });
}

/** true, если RPC выполнился без ошибки (можно локально +1 к счётчику). */
export async function incrementViews(listingId: string): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    if (process.env.NODE_ENV === "development") {
      console.warn("no user, skip rpc increment_listing_views");
    }
    return false;
  }
  const { error } = await supabase.rpc("increment_listing_views", { listing: listingId });
  if (error && !isSchemaNotInCache(error)) {
    console.warn("increment_listing_views", error.message);
    return false;
  }
  return !error;
}

function normalizeListingText(raw: unknown, fallback = ""): string {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (raw && typeof raw === "object" && "name" in raw) {
    const name = (raw as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return fallback;
}

function normalizeNullableListingText(raw: unknown): string | null {
  const value = normalizeListingText(raw, "").trim();
  return value ? value : null;
}

/** PostgREST иногда отдаёт `images` как null, один объект, { data: [] } или массив — приводим к массиву. */
export function normalizeListingImages(raw: unknown): { url: string; sort_order?: number }[] {
  if (raw == null) return [];
  if (typeof raw === "object" && raw !== null && "data" in raw) {
    return normalizeListingImages((raw as { data?: unknown }).data);
  }
  if (Array.isArray(raw)) {
    const out: { url: string; sort_order?: number }[] = [];
    for (const x of raw) {
      if (x && typeof x === "object" && "url" in x) {
        const o = x as { url: unknown; sort_order?: unknown };
        const url = String(o.url ?? "").trim();
        if (!url) continue;
        const so = o.sort_order;
        const sort_order =
          so != null && so !== "" && Number.isFinite(Number(so)) ? Number(so) : undefined;
        out.push(sort_order !== undefined ? { url, sort_order } : { url });
      }
    }
    return out;
  }
  if (typeof raw === "object" && raw !== null && "url" in raw) {
    const o = raw as { url: unknown; sort_order?: unknown };
    const url = String(o.url ?? "").trim();
    if (!url) return [];
    return [{ url, sort_order: o.sort_order != null ? Number(o.sort_order) : undefined }];
  }
  return [];
}

/** Приводим строку из Postgres numeric/json к числу для UI. */
export function parseListingRow(data: Record<string, unknown>): ListingRow {
  const normalizedCity = normalizeAllowedListingCity(data.city ?? data.location);
  const fc = data.favorite_count;
  const price = Number(data.price);
  const viewCount = Number(data.view_count ?? 0);
  const row: ListingRow = {
    id: String(data.id ?? ""),
    user_id: String(data.user_id ?? ""),
    title: normalizeListingText(data.title, ""),
    description: normalizeListingText(data.description, ""),
    price: Number.isFinite(price) ? price : 0,
    category: normalizeListingText(data.category, ""),
    city: normalizedCity,
    view_count: Number.isFinite(viewCount) ? viewCount : 0,
    created_at: String(data.created_at ?? ""),
    updated_at: data.updated_at != null ? String(data.updated_at) : undefined,
    is_vip: data.is_vip as boolean | null | undefined,
    vip_until: data.vip_until != null ? String(data.vip_until) : null,
    is_top: data.is_top as boolean | null | undefined,
    top_until: data.top_until != null ? String(data.top_until) : null,
    boosted_at: data.boosted_at != null ? String(data.boosted_at) : null,
    boosted_until: data.boosted_until != null ? String(data.boosted_until) : null,
    is_partner_ad: data.is_partner_ad === true,
    is_boosted: data.is_boosted != null ? Boolean(data.is_boosted) : undefined,
    favorite_count: fc != null && fc !== "" ? Number(fc) : undefined,
    images: normalizeListingImages(data.images),
  };
  (row as ListingRow & { contact_phone?: string | null }).contact_phone =
    data.contact_phone != null ? String(data.contact_phone) : null;
  (row as ListingRow & { params?: Record<string, unknown> | null }).params =
    data.params && typeof data.params === "object"
      ? (data.params as Record<string, unknown>)
      : null;
  applyListingRealEstateColumns(row, data);
  applyListingAutoEngineColumns(row, data);
  applyListingMotoColumns(row, data);
  applyListingExpiryColumns(row, data);
  const dtDetail = data.deal_type;
  if (dtDetail != null && String(dtDetail).trim() !== "") {
    row.deal_type = String(dtDetail).trim();
  }
  const ctDetail = data.commercial_type;
  if (ctDetail != null && String(ctDetail).trim() !== "") {
    row.commercial_type = String(ctDetail).trim();
  }
  const lkDetail = data.listing_kind;
  if (lkDetail != null && String(lkDetail).trim() !== "") {
    row.listing_kind = String(lkDetail).trim();
  }
  return row;
}

export type FetchListingDetailResult = {
  row: ListingRow | null;
  loadError: string | null;
  timedOut?: boolean;
  invalidId?: boolean;
};

async function fetchListingByIdFromSupabase(listingId: string): Promise<FetchListingDetailResult> {
  try {
    let { data, error } = await supabase
      .from("listings")
      .select("*, images:images(url)")
      .eq("id", listingId)
      .maybeSingle();

    if (error && !isSchemaNotInCache(error)) {
      const second = await supabase.from("listings").select("*").eq("id", listingId).maybeSingle();
      data = second.data as typeof data;
      error = second.error;
    }

    console.log("RAW LISTING RESPONSE", data);

    if (error) {
      console.error("LISTING_LOAD_ERROR:", error);
      return { row: null, loadError: error.message };
    }
    if (!data || typeof data !== "object") {
      return { row: null, loadError: null };
    }

    const row = parseListingRow(data as Record<string, unknown>);
    let seller: UserRow | null = null;

    if (row.user_id) {
      const { data: sellerRow, error: sellerError } = await supabase
        .from("profiles")
        .select("id, phone, phone_updated_at, device_id, email, trust_score")
        .eq("id", row.user_id)
        .maybeSingle();

      if (sellerError) {
        console.warn("LISTING_SELLER_LOAD_ERROR", sellerError.message);
      } else if (sellerRow) {
        const p = sellerRow as Record<string, unknown>;
        seller = {
          id: String(p.id ?? row.user_id),
          phone: p.phone != null ? String(p.phone) : null,
          phone_updated_at: p.phone_updated_at != null ? String(p.phone_updated_at) : null,
          device_id: p.device_id != null ? String(p.device_id) : null,
          name: null,
          email: p.email != null ? String(p.email) : null,
          avatar: null,
          public_id: "—",
          created_at: "",
          trust_score: typeof p.trust_score === "number" ? p.trust_score : null,
        };
      }
    }

    return { row: { ...row, seller }, loadError: null };
  } catch (e) {
    console.error("LISTING_LOAD_ERROR:", e);
    return { row: null, loadError: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchListingById(listingId: string): Promise<FetchListingDetailResult> {
  if (!isValidListingUuid(listingId)) {
    return { row: null, loadError: null, invalidId: true };
  }
  return Promise.race([
    fetchListingByIdFromSupabase(listingId),
    new Promise<FetchListingDetailResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            row: null,
            loadError: "Превышено время ожидания (5 с)",
            timedOut: true,
          }),
        LISTING_DETAIL_FETCH_MS
      )
    ),
  ]);
}

export type InsertListingRowResult = { id?: string; error?: string };

/**
 * Создаёт строку в `listings`. `id` не передаём — задаётся в БД.
 * Стабильная версия с гарантированной валидацией.
 */
export async function insertListingRow(payload: ListingInsertPayload): Promise<InsertListingRowResult> {
  console.log("CREATE LISTING START");
  
  try {
    // 1. GUARANTEE USER AUTHENTICATION (anti-race после свежего входа)
    let { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      await supabase.auth.refreshSession();
      const retry = await supabase.auth.getUser();
      userData = retry.data;
      authErr = retry.error;
    }

    if (authErr || !userData?.user) {
      console.error("AUTH ERROR:", authErr?.message);
      return { error: "Вы не авторизованы" };
    }

    const effectiveUserId = userData.user.id;
    console.log("CURRENT USER:", effectiveUserId);
    
    // 2. FORM CLEAN PAYLOAD
    const priceNum = Number(payload.price);
    const payloadContactPhone = (payload as ListingInsertPayload & { contact_phone?: string | null })
      .contact_phone;
    const payloadExtended = payload as ListingInsertPayload & {
      commercial_type?: string | null;
      has_gas?: boolean;
      has_water?: boolean;
      has_electricity?: boolean;
      has_sewage?: boolean;
      comms_gas?: boolean;
      comms_water?: boolean;
      comms_electricity?: string | null;
      comms_sewage?: boolean;
      plot_area?: string | null;
      land_type?: string | null;
      land_ownership_status?: string | null;
      deal_type?: string | null;
      engine_power?: string | null;
      engine_volume?: string | null;
      moto_type?: string | null;
      moto_engine?: string | null;
      moto_mileage?: string | null;
      moto_customs_cleared?: string | null;
      moto_owners_pts?: string | null;
    };
    const payloadParams =
      payload.params && typeof payload.params === "object"
        ? payload.params
        : null;
    const normalizedCity = normalizeAllowedListingCity(payload.city);
    if (!normalizedCity) {
      return { error: "Пожалуйста, выберите город из списка (Москва/Сочи)" };
    }
    const insertPayload: Record<string, unknown> = {
      user_id: payload.user_id || effectiveUserId,
      owner_id: payload.owner_id || effectiveUserId,
      title: payload.title?.trim() || "",
      description: payload.description?.trim() || "",
      price: priceNum,
      city: normalizedCity,
      category: payload.category || "other",
      params: payloadParams,
      contact_phone: payloadContactPhone || null,
    };
    if (payloadExtended.commercial_type != null && payloadExtended.commercial_type !== "") {
      insertPayload.commercial_type = payloadExtended.commercial_type;
    }
    if (typeof payloadExtended.has_gas === "boolean") {
      insertPayload.has_gas = payloadExtended.has_gas;
    }
    if (typeof payloadExtended.has_water === "boolean") {
      insertPayload.has_water = payloadExtended.has_water;
    }
    if (typeof payloadExtended.has_electricity === "boolean") {
      insertPayload.has_electricity = payloadExtended.has_electricity;
    }
    if (typeof payloadExtended.has_sewage === "boolean") {
      insertPayload.has_sewage = payloadExtended.has_sewage;
    }
    if (typeof payloadExtended.comms_gas === "boolean") {
      insertPayload.comms_gas = payloadExtended.comms_gas;
    }
    if (typeof payloadExtended.comms_water === "boolean") {
      insertPayload.comms_water = payloadExtended.comms_water;
    }
    if (payloadExtended.comms_electricity != null && payloadExtended.comms_electricity !== "") {
      insertPayload.comms_electricity = payloadExtended.comms_electricity;
    }
    if (typeof payloadExtended.comms_sewage === "boolean") {
      insertPayload.comms_sewage = payloadExtended.comms_sewage;
    }
    if (payloadExtended.plot_area != null && String(payloadExtended.plot_area).trim() !== "") {
      insertPayload.plot_area = String(payloadExtended.plot_area).trim();
    }
    if (payloadExtended.land_type != null && String(payloadExtended.land_type).trim() !== "") {
      insertPayload.land_type = String(payloadExtended.land_type).trim();
    }
    if (
      payloadExtended.land_ownership_status != null &&
      String(payloadExtended.land_ownership_status).trim() !== ""
    ) {
      insertPayload.land_ownership_status = String(payloadExtended.land_ownership_status).trim();
    }
    if (payloadExtended.deal_type === "rent" || payloadExtended.deal_type === "sale") {
      insertPayload.deal_type = payloadExtended.deal_type;
    }
    if (payloadExtended.listing_kind === "seeking" || payloadExtended.listing_kind === "offer") {
      insertPayload.listing_kind = payloadExtended.listing_kind;
    }
    if (payloadExtended.engine_power != null && String(payloadExtended.engine_power).trim() !== "") {
      insertPayload.engine_power = String(payloadExtended.engine_power).trim();
    }
    if (payloadExtended.engine_volume != null && String(payloadExtended.engine_volume).trim() !== "") {
      insertPayload.engine_volume = String(payloadExtended.engine_volume).trim();
    }
    if (payloadExtended.moto_type != null && String(payloadExtended.moto_type).trim() !== "") {
      insertPayload.moto_type = String(payloadExtended.moto_type).trim();
    }
    if (payloadExtended.moto_engine != null && String(payloadExtended.moto_engine).trim() !== "") {
      insertPayload.moto_engine = String(payloadExtended.moto_engine).trim();
    }
    if (payloadExtended.moto_mileage != null && String(payloadExtended.moto_mileage).trim() !== "") {
      insertPayload.moto_mileage = String(payloadExtended.moto_mileage).trim();
    }
    if (
      payloadExtended.moto_customs_cleared != null &&
      String(payloadExtended.moto_customs_cleared).trim() !== ""
    ) {
      insertPayload.moto_customs_cleared = String(payloadExtended.moto_customs_cleared).trim();
    }
    if (payloadExtended.moto_owners_pts != null && String(payloadExtended.moto_owners_pts).trim() !== "") {
      insertPayload.moto_owners_pts = String(payloadExtended.moto_owners_pts).trim();
    }

    console.log("INSERT PHONE:", payloadContactPhone);
    console.log("INSERT PAYLOAD:", insertPayload);
    
    // 3. VALIDATION BEFORE INSERT
    if (!insertPayload.title) {
      console.error("VALIDATION ERROR: empty title");
      return { error: "Укажите название объявления" };
    }
    
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      console.error("VALIDATION ERROR: invalid price", payload.price);
      return { error: "Укажите корректную цену" };
    }
    
    if (!isAllowedListingCity(normalizedCity)) {
      console.error("VALIDATION ERROR: invalid city", normalizedCity);
      return { error: "Пожалуйста, выберите город из списка (Москва/Сочи)" };
    }
    
    if (!insertPayload.category) {
      console.error("VALIDATION ERROR: empty category");
      return { error: "Выберите категорию" };
    }
    
    // 4. PROPER INSERT
    const { data, error } = await supabase
      .from("listings")
      .insert([insertPayload])
      .select("id")
      .single();
    
    // 5. ERROR HANDLING
    if (error) {
      console.error("CREATE LISTING ERROR FULL:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      
      // Daily limit check
      if (error.code === "23514" || 
          (typeof error.message === "string" && 
           (error.message.includes("LISTING_DAILY_LIMIT") || error.message.includes("Maximum 5 listings")))) {
        return { error: "Не более 5 объявлений в сутки (UTC). Попробуй завтра." };
      }
      
      // FK violation - user not in users table
      if (error.code === "23503") {
        return { error: "Ошибка профиля. Обратитесь в поддержку." };
      }
      
      // RLS violation
      if (error.code === "42501") {
        return { error: "Ошибка доступа. Попробуйте перезайти." };
      }
      
      return { error: error?.message || "Не удалось создать объявление" };
    }
    
    if (!data?.id) {
      console.error("CREATE LISTING ERROR: no id returned");
      return { error: "Не удалось создать объявление" };
    }
    
    // 6. SUCCESS
    console.log("CREATE LISTING SUCCESS:", data.id);
    return { id: data.id };
    
  } catch (e) {
    console.error("NETWORK CREATE LISTING ERROR:", e);
    const msg = e instanceof Error ? e.message : "Ошибка сети";
    return { error: msg };
  }
}
