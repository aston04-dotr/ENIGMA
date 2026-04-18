import { isValidListingUuid } from "./listingParams";
import { isSchemaNotInCache, logRlsIfBlocked } from "./postgrestErrors";
import { CITY_ALL_RUSSIA, RUSSIAN_CITIES } from "./russianCities";
import { decreaseTrust } from "./trust";
import { supabase } from "./supabase";
import type { ListingInsertPayload, ListingRow } from "./types";

const LISTING_DETAIL_FETCH_MS = 5000;

const LISTINGS_FETCH_MS = 28_000;

const LISTINGS_FEED_NETWORK_UI =
  "Не удалось загрузить объявления. Проверь интернет или попробуй позже.";

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isLikelyNetworkFailureMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("load failed") ||
    m.includes("authretryablefetcherror") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("нет ответа за")
  );
}

function normalizeListingsCatchError(e: unknown): string {
  console.error("NETWORK ERROR", e);
  const msg =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : String(e);
  const raw = msg || "Нет соединения с сервером";
  if (raw.includes("AuthRetryableFetchError")) {
    return "Ошибка подключения к серверу";
  }
  if (raw.includes("Load failed")) {
    return "Нет соединения с сервером. Проверь интернет.";
  }
  return raw;
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(
      () => reject(`${label}: нет ответа за ${Math.round(ms / 1000)} с (сеть или Supabase)`),
      ms
    );
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

export type FetchListingsResult = {
  listings: ListingRow[];
  /** Нужно выполнить supabase/schema.sql в SQL Editor */
  sqlSetupRequired: boolean;
  error?: string;
};

/** PostgREST по умолчанию отдаёт ~1000 строк; при тысячах партнёрок «верх» ленты может быть только обычными — партнёрок не будет в ответе. */
const FEED_LISTINGS_PER_KIND = 4000;

/** Города РФ + федеральные объявления; для фильтра ленты «только Россия». */
const RUSSIA_CITY_SET = new Set(RUSSIAN_CITIES);

let warned = new Set<string>();

function rowIsRussiaListing(row: Record<string, unknown>): boolean {
  const id = String(row.id ?? "");
  const country = typeof row.country === "string" ? row.country.trim() : "";
  const city = typeof row.city === "string" ? row.city.trim() : "";
  const location = typeof row.location === "string" ? row.location.trim() : "";

  if (country) {
    const c = country.toLowerCase();
    if (c === "россия" || c === "russia" || c === "ru") return true;
    return false;
  }

  if (!country && !city && !location) {
    if (!warned.has(id)) {
      console.warn("UNKNOWN GEO:", id || "(no id)");
      warned.add(id);
    }
    return true;
  }

  const cityLine = city || location;
  return RUSSIA_CITY_SET.has(cityLine);
}

function filterListingsRussiaOnly(rows: unknown[]): unknown[] {
  return rows.filter((r) => {
    if (!r || typeof r !== "object") return false;
    return rowIsRussiaListing(r as Record<string, unknown>);
  });
}

function mergeFeedRows(a: unknown[], b: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  const push = (r: unknown) => {
    const id = r && typeof r === "object" && "id" in r ? String((r as { id: unknown }).id) : "";
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(r);
  };
  for (const r of a) push(r);
  for (const r of b) push(r);
  return out;
}

function listingsQuery(
  filters: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    /** Город из списка РФ; «Вся Россия» — только федеральные; иначе город + федеральные. */
    city?: string;
  },
  select: string
) {
  let q = supabase.from("listings").select(select).order("created_at", { ascending: false });
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.minPrice != null) q = q.gte("price", filters.minPrice);
  if (filters.maxPrice != null) q = q.lte("price", filters.maxPrice);
  const city = filters.city?.trim();
  if (city) {
    if (city === CITY_ALL_RUSSIA) {
      q = q.eq("city", CITY_ALL_RUSSIA);
    } else {
      const esc = city.replace(/"/g, "");
      q = q.or(`city.eq."${esc}",city.eq."${CITY_ALL_RUSSIA}"`);
    }
  }
  const s = filters.search?.trim();
  if (s) {
    const safe = s.replace(/%/g, "").replace(/,/g, "").replace(/[()]/g, "").slice(0, 80);
    if (safe) {
      const pat = `%${safe}%`;
      q = q.or(`title.ilike.${pat},description.ilike.${pat},city.ilike.${pat}`);
    }
  }
  return q;
}

export async function fetchListings(filters: {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  city?: string;
}): Promise<FetchListingsResult> {
  console.log("SUPABASE URL", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)");
  if (isBrowserOffline()) {
    return { listings: [], sqlSetupRequired: false, error: "Нет интернета" };
  }
  try {
    // В некоторых проектах `images.sort_order` может отсутствовать → embed с `sort_order` ломает весь select.
    // Поэтому основной select берём безопасным: только url.
    const fullSelect = "*, images:images(url)";
    const capWide = FEED_LISTINGS_PER_KIND * 2;

    const run = (select: string) => withTimeout(listingsQuery(filters, select).limit(capWide), LISTINGS_FETCH_MS, "Лента");

    if (isBrowserOffline()) {
      return { listings: [], sqlSetupRequired: false, error: "Нет интернета" };
    }
    const first = await run(fullSelect);
    if (!first.error) {
      const rows = filterListingsRussiaOnly((first.data ?? []) as unknown[]);
      const partnerCount = rows.filter((x) => (x as { is_partner_ad?: unknown })?.is_partner_ad === true).length;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("PARTNERS AFTER FETCH:", partnerCount);
      }
      const listings = rows.map((r) => parseListingRow(r as Record<string, unknown>));
      if (isBrowserOffline()) {
        return { listings: [], sqlSetupRequired: false, error: "Нет интернета" };
      }
      return {
        listings: await mergeFavoriteCounts(listings),
        sqlSetupRequired: false,
      };
    }
    const firstMsg = first.error?.message ?? "";
    if (isLikelyNetworkFailureMessage(firstMsg)) {
      console.error("LISTINGS FETCH ERROR", first.error);
      return { listings: [], sqlSetupRequired: false, error: LISTINGS_FEED_NETWORK_UI };
    }
    if (isSchemaNotInCache(first.error)) {
      return { listings: [], sqlSetupRequired: true };
    }

    // Fallback: без embed вообще.
    if (isBrowserOffline()) {
      return { listings: [], sqlSetupRequired: false, error: "Нет интернета" };
    }
    const second = await run("*");
    if (!second.error) {
      const rows = filterListingsRussiaOnly((second.data ?? []) as unknown[]);
      const partnerCount = rows.filter((x) => (x as { is_partner_ad?: unknown })?.is_partner_ad === true).length;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("PARTNERS AFTER FETCH:", partnerCount);
      }
      const listings = rows.map((r) => parseListingRow(r as Record<string, unknown>));
      if (isBrowserOffline()) {
        return { listings: [], sqlSetupRequired: false, error: "Нет интернета" };
      }
      return {
        listings: await mergeFavoriteCounts(listings),
        sqlSetupRequired: false,
      };
    }
    if (isSchemaNotInCache(second.error)) {
      return { listings: [], sqlSetupRequired: true };
    }

    const msg = second.error?.message || first.error?.message || "Ошибка загрузки объявлений";
    console.error("LISTINGS FETCH ERROR", msg);
    if (isLikelyNetworkFailureMessage(msg)) {
      return { listings: [], sqlSetupRequired: false, error: LISTINGS_FEED_NETWORK_UI };
    }
    return { listings: [], sqlSetupRequired: false, error: msg };
  } catch (e) {
    const rawStr =
      typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
    const normalized = normalizeListingsCatchError(e);
    if (
      isLikelyNetworkFailureMessage(rawStr) ||
      rawStr.includes("AuthRetryableFetchError") ||
      rawStr.includes("Load failed") ||
      normalized.includes("Ошибка подключения к серверу") ||
      normalized.includes("Нет соединения с сервером")
    ) {
      return { listings: [], sqlSetupRequired: false, error: LISTINGS_FEED_NETWORK_UI };
    }
    console.error("LISTINGS FETCH ERROR", normalized);
    return { listings: [], sqlSetupRequired: false, error: normalized || LISTINGS_FEED_NETWORK_UI };
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
  const { data, error } = await supabase.rpc("listing_favorites_count", { listing: listingId });
  if (error) {
    console.warn("favorite_count RPC failed", error);
    return 0;
  }
  return Number(data ?? 0);
}

/** Пакетно для ленты: id → count (объявления без строк в listing_favorites получают 0). */
export async function fetchListingFavoriteCounts(listingIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(listingIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await supabase.rpc("listing_favorites_counts", { p_ids: ids });
  if (error) {
    console.warn("favorite_count RPC failed", error);
    return map;
  }
  if (!Array.isArray(data)) return map;
  for (const row of data as { listing_id: string; favorite_count: number | string }[]) {
    if (row?.listing_id == null) continue;
    map.set(String(row.listing_id), Number(row.favorite_count ?? 0));
  }
  return map;
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
    contact_phone: data.contact_phone != null ? String(data.contact_phone) : null,
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
 * Требуется строка в `public.users` с тем же id (FK), иначе будет ошибка FK.
 */
export async function insertListingRow(payload: ListingInsertPayload): Promise<InsertListingRowResult> {
  console.log("CREATE LISTING START");
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    console.log("USER", authData?.user);
    if (authErr || !authData.user) {
      console.error("CREATE LISTING ERROR", authErr);
      const msg = "Не удалось создать объявление. Попробуй снова.";
      console.log("CREATE LISTING RESULT", { error: msg });
      return { error: msg };
    }
    const effectiveUserId = authData.user.id;

    const payloadUid = payload.user_id?.trim();
    if (payloadUid && payloadUid !== effectiveUserId) {
      console.warn("LISTINGS_INSERT user_id payload !== JWT (используем JWT)", {
        payload_user_id: payloadUid,
        jwt_user_id: effectiveUserId,
      });
    }

    const priceNum = Number(payload.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      console.error("CREATE LISTING ERROR", payload.price);
      const msg = "Не удалось создать объявление. Попробуй снова.";
      console.log("CREATE LISTING RESULT", { error: msg });
      return { error: msg };
    }

    const cityVal = payload.city.trim() || "Не указан";
    const base = {
      user_id: effectiveUserId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      price: priceNum,
      category: payload.category,
      contact_phone: payload.contact_phone?.trim() || null,
    };

    const insertPayload = { ...base, city: cityVal };
    console.log("INSERT PAYLOAD", insertPayload);

    let { data, error } = await supabase.from("listings").insert([insertPayload]).select("id").single();
    console.log("INSERT RESULT", data);
    console.log("INSERT ERROR", error);
    logRlsIfBlocked(error);

    const dailyLimit =
      error &&
      (error.code === "23514" ||
        (typeof error.message === "string" &&
          (error.message.includes("LISTING_DAILY_LIMIT") || error.message.includes("Maximum 5 listings"))));
    if (dailyLimit) {
      const msg = "Не более 5 объявлений в сутки (UTC). Попробуй завтра.";
      console.log("CREATE LISTING RESULT", { error: msg });
      return { error: msg };
    }

    const missingCity =
      error?.code === "PGRST204" && typeof error.message === "string" && error.message.includes("'city'");
    if (missingCity) {
      console.warn("listings insert: в схеме нет city — пробуем колонку location");
      const payloadLoc = { ...base, location: cityVal };
      console.log("INSERT PAYLOAD (location)", payloadLoc);
      const second = await supabase.from("listings").insert([payloadLoc]).select("id").single();
      data = second.data;
      error = second.error;
      console.log("INSERT RESULT", second.data);
      console.log("INSERT ERROR", second.error);
      logRlsIfBlocked(second.error);
    }

    if (error) {
      console.error("CREATE LISTING ERROR", error);
      const msg = "Не удалось создать объявление. Попробуй снова.";
      console.log("CREATE LISTING RESULT", { error: msg });
      return { error: msg };
    }
    if (!data?.id) {
      console.error("CREATE LISTING ERROR: пустой ответ, нет id");
      const msg = "Не удалось создать объявление. Попробуй снова.";
      console.log("CREATE LISTING RESULT", { error: msg });
      return { error: msg };
    }

    const { data: dupRows, error: dupErr } = await supabase
      .from("listings")
      .select("id")
      .eq("user_id", effectiveUserId)
      .eq("title", payload.title.trim())
      .eq("description", payload.description.trim());
    if (!dupErr && dupRows && dupRows.length >= 2) {
      void decreaseTrust(effectiveUserId, 10);
    }

    const res: InsertListingRowResult = { id: data.id };
    console.log("CREATE LISTING RESULT", res);
    return res;
  } catch (e) {
    console.error("NETWORK CREATE LISTING ERROR", e);
    const msg = e instanceof Error ? e.message : "Ошибка сети";
    console.log("CREATE LISTING RESULT", { error: msg });
    return { error: msg };
  }
}
