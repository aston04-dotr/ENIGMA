import { isValidListingUuid } from "./listingParams";
import { isSchemaNotInCache, logRlsIfBlocked } from "./postgrestErrors";
import { decreaseTrust } from "./trust";
import { supabase, isSupabaseConfigured } from "./supabase";
import type { ListingInsertPayload, ListingRow } from "./types";

const LISTING_DETAIL_FETCH_MS = 5000;

/** Размер страницы ленты (limit в fetchListings). */
export const LISTINGS_PAGE_SIZE = 20;

/** Курсор keyset: `created_at` не уникален — добавляем `id`. */
export type FeedListingsCursor = { created_at: string; id: string };

const FEED_SELECT =
  "id,user_id,title,price,created_at,city,category,is_partner_ad,is_boosted,boosted_at,boosted_until,images(url,sort_order)";

function quotePostgrestValue(v: string): string {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function compositeCursorOrClause(c: FeedListingsCursor): string {
  const ts = quotePostgrestValue(c.created_at);
  const id = quotePostgrestValue(c.id);
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`;
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
  return {
    id: String(data.id),
    user_id: String(data.user_id ?? ""),
    title: String(data.title ?? ""),
    description: "",
    price: Number(data.price ?? 0),
    category: String(data.category ?? ""),
    city: String(data.city ?? data.location ?? ""),
    view_count: 0,
    created_at: String(data.created_at ?? ""),
    is_partner_ad: data.is_partner_ad === true,
    is_boosted: data.is_boosted === true,
    boosted_at: data.boosted_at != null ? String(data.boosted_at) : null,
    boosted_until: data.boosted_until != null ? String(data.boosted_until) : null,
    images: normalizeListingImages(data.images),
  };
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
      images: [],
      is_boosted: false,
      is_partner_ad: false,
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
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  city?: string;
};

function listingsFeedSelectBase() {
  return supabase
    .from("listings")
    .select(FEED_SELECT)
    .order("sort_order", { ascending: true, foreignTable: "images" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LISTINGS_PAGE_SIZE);
}

type ListingsFeedQuery = ReturnType<typeof listingsFeedSelectBase>;

function applySafeFilters(
  query: ListingsFeedQuery,
  filters: ListingFilters,
  searchActive: boolean,
  searchTrim: string
): ListingsFeedQuery {
  try {
    let q = query;
    const city = filters.city?.trim();
    if (city) {
      q = q.eq("city", city);
    }
    const category = filters.category?.trim();
    if (category) {
      q = q.eq("category", category);
    }
    if (searchActive) {
      const safe = searchTrim
        .replace(/%/g, "")
        .replace(/_/g, "")
        .replace(/,/g, "")
        .replace(/[()]/g, "")
        .slice(0, 80);
      if (safe.length >= 3) {
        q = q.ilike("title", `${safe}%`);
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
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  city?: string;
  /** Курсор следующей страницы (composite). Строковый legacy-курсор игнорируется. */
  cursor?: FeedListingsCursor | string | null;
}): Promise<FetchListingsResult> {
  console.log("FETCH LISTINGS START", filters);
  console.log(
    "SUPABASE URL env",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "(unset)"
  );

  const demo = (notice: string): FetchListingsResult => ({
    listings: getDemoListings(),
    sqlSetupRequired: false,
    error: null,
    notice,
    nextCursor: null,
  });

  if (!isSupabaseConfigured) {
    return demo("Нет ключей Supabase в .env — показаны примеры.");
  }

  const cursor = normalizeFeedCursor(filters.cursor);

  const searchTrim = filters.search?.trim() ?? "";
  const searchActive = searchTrim.length >= 3;

  const filterPayload: ListingFilters = {
    city: filters.city,
    category: filters.category,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    search: filters.search,
  };

  const hasFilters = Boolean(
    filters.city?.trim() ||
      filters.category?.trim() ||
      searchActive ||
      filters.minPrice != null ||
      filters.maxPrice != null
  );

  try {
    const runOnce = async () => {
      const mkQuery = (useLtCreatedAt: boolean, withFilters: boolean) => {
        let q = listingsFeedSelectBase();
        if (cursor) {
          q = useLtCreatedAt ? q.lt("created_at", cursor.created_at) : q.or(compositeCursorOrClause(cursor));
        }
        if (withFilters) {
          q = applySafeFilters(q, filterPayload, searchActive, searchTrim);
        }
        return q;
      };

      let { data, error } = await mkQuery(false, true);
      console.log("Listings data:", data);
      console.log("Listings error:", error);

      if (isRealError(error) && !data && cursor) {
        console.warn("LISTINGS composite cursor query failed, fallback lt(created_at):", error);
        const second = await mkQuery(true, true);
        data = second.data;
        error = second.error;
        console.log("Listings data:", data);
        console.log("Listings error:", error);
      }

      if (isRealError(error) && !data && hasFilters) {
        console.warn("LISTINGS filtered query failed without data; falling back to base:", error);
        let fallback = await mkQuery(false, false);
        if (isRealError(fallback.error) && !fallback.data && cursor) {
          fallback = await mkQuery(true, false);
        }
        data = fallback.data;
        error = fallback.error;
        console.log("Listings data:", data);
        console.log("Listings error:", error);
      }

      return { data, error };
    };

    let { data, error } = await runOnce();

    if (isRealError(error) && !data) {
      console.error("REAL LISTINGS ERROR:", error.message);
      await new Promise((r) => setTimeout(r, 1000));
      const second = await runOnce();
      data = second.data;
      error = second.error;
      if (isRealError(error) && !data) {
        console.error("REAL LISTINGS ERROR:", error.message);
        return demo("Не удалось загрузить объявления. Проверь интернет или попробуй позже.");
      }
    }

    const rows = Array.isArray(data) ? data : [];
    let listings = rows.map((r) => parseFeedListingRow(r as Record<string, unknown>));
    listings = dedupeListingsById(listings);
    if (listings.length === 0) {
      return demo("Объявлений пока нет — показаны примеры.");
    }

    const pack = (merged: ListingRow[]): FetchListingsResult => {
      const last = merged.length > 0 ? merged[merged.length - 1]! : null;
      const nextCursor: FeedListingsCursor | null =
        merged.length === LISTINGS_PAGE_SIZE && last
          ? { created_at: last.created_at, id: last.id }
          : null;
      console.log("NEXT CURSOR:", nextCursor);
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
    return demo("Ошибка загрузки. Показаны примеры — попробуй обновить страницу.");
  }
}

/**
 * Объявления пользователя (профиль, продвижение, публичный профиль).
 * Если select с вложением images падает — повтор без embed (как в ленте).
 */
export async function fetchListingsForUser(userId: string): Promise<ListingRow[]> {
  if (!userId?.trim()) return [];
  const fullSelect = "*, images:images(url)";
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
    let { data, error } = await supabase.schema("public").rpc("listing_favorites_count", { listing: listingId });
    if (error) {
      const alt = await supabase.schema("public").rpc("listing_favorites_count", { listing_id: listingId });
      data = alt.data;
      error = alt.error;
    }
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
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      throw new Error(userError?.message || "not_authenticated");
    }

    if (next.isFavorited) {
      const { error } = await supabase.from("listing_favorites").insert({
        user_id: user.id,
        listing_id: id,
      });
      if (error && error.code !== "23505") {
        throw error;
      }
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

/** Пакетно для ленты: id → count (объявления без строк в favorites получают 0). */
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
    let { data, error } = await supabase.schema("public").rpc("listing_favorites_counts", { p_ids: ids });
    if (error) {
      const alt = await supabase.schema("public").rpc("listing_favorites_counts", { listing_ids: ids });
      data = alt.data;
      error = alt.error;
    }
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
  const countMap = await fetchListingFavoriteCounts(listings.map((l) => l.id));
  return listings.map((l) => ({ ...l, favorite_count: countMap.get(l.id) ?? 0 }));
}

/** true, если RPC выполнился без ошибки (можно локально +1 к счётчику). */
export async function incrementViews(listingId: string): Promise<boolean> {
  const { error } = await supabase.rpc("increment_listing_views", { listing: listingId });
  if (error && !isSchemaNotInCache(error)) {
    console.warn("increment_listing_views", error.message);
    return false;
  }
  return !error;
}

/** PostgREST иногда отдаёт `images` как null, один объект или массив — приводим к массиву. */
export function normalizeListingImages(raw: unknown): { url: string; sort_order?: number }[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    const out: { url: string; sort_order?: number }[] = [];
    for (const x of raw) {
      if (x && typeof x === "object" && "url" in x) {
        const o = x as { url: unknown; sort_order?: unknown };
        const url = String(o.url ?? "");
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
    const url = String(o.url ?? "");
    if (!url) return [];
    return [{ url, sort_order: o.sort_order != null ? Number(o.sort_order) : undefined }];
  }
  return [];
}

/** Приводим строку из Postgres numeric/json к числу для UI. */
export function parseListingRow(data: Record<string, unknown>): ListingRow {
  const fc = data.favorite_count;
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    price: Number(data.price),
    category: String(data.category ?? ""),
    city: String(data.city ?? data.location ?? ""),
    view_count: Number(data.view_count ?? 0),
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

    if (error) {
      console.error("LISTING_LOAD_ERROR:", error);
      return { row: null, loadError: error.message };
    }
    if (!data || typeof data !== "object") {
      return { row: null, loadError: null };
    }
    return { row: parseListingRow(data as Record<string, unknown>), loadError: null };
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
    // 1. GUARANTEE USER AUTHENTICATION
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    
    if (authErr) {
      console.error("AUTH ERROR:", authErr.message);
      return { error: "Ошибка авторизации" };
    }
    
    const user = authData?.user;
    if (!user) {
      console.error("NO USER");
      return { error: "Вы не авторизованы" };
    }
    
    console.log("CURRENT USER:", user.id);
    
    // 2. FORM CLEAN PAYLOAD
    const priceNum = Number(payload.price);
    const insertPayload = {
      user_id: user.id,
      title: payload.title?.trim() || "",
      description: payload.description?.trim() || "",
      price: priceNum,
      city: payload.city?.trim() || "Не указан",
      category: payload.category || "other",
    };
    
    console.log("INSERT PAYLOAD:", insertPayload);
    
    // 3. VALIDATION BEFORE INSERT
    if (!insertPayload.title) {
      console.error("VALIDATION ERROR: empty title");
      return { error: "Укажите название объявления" };
    }
    
    if (!Number.isFinite(insertPayload.price) || insertPayload.price < 0) {
      console.error("VALIDATION ERROR: invalid price", payload.price);
      return { error: "Укажите корректную цену" };
    }
    
    if (!insertPayload.city) {
      console.error("VALIDATION ERROR: empty city");
      return { error: "Укажите город" };
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
