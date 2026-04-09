import { isValidListingUuid } from "./listingParams";
import { isSchemaNotInCache } from "./postgrestErrors";
import { CITY_ALL_RUSSIA } from "./russianCities";
import { supabase } from "./supabase";
import type { ListingInsertPayload, ListingRow } from "./types";

const LISTING_DETAIL_FETCH_MS = 5000;

const LISTINGS_FETCH_MS = 28_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`${label}: нет ответа за ${Math.round(ms / 1000)} с (сеть или Supabase)`)),
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
};

/** PostgREST по умолчанию отдаёт ~1000 строк; при тысячах партнёрок «верх» ленты может быть только обычными — партнёрок не будет в ответе. */
const FEED_LISTINGS_PER_KIND = 4000;

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
  const fullSelect = "*, images:images(url, sort_order)";
  const cap = FEED_LISTINGS_PER_KIND;
  const capWide = cap * 2;

  async function runDual(select: string) {
    const qOrg = listingsQuery(filters, select).eq("is_partner_ad", false).limit(cap);
    const qPar = listingsQuery(filters, select).eq("is_partner_ad", true).limit(cap);
    const [org, par] = await Promise.all([
      withTimeout(qOrg, LISTINGS_FETCH_MS, "Лента"),
      withTimeout(qPar, LISTINGS_FETCH_MS, "Лента"),
    ]);
    return { org, par };
  }

  async function trySelect(select: string): Promise<FetchListingsResult | "schema" | "fail"> {
    const dual = await runDual(select);
    if (!dual.org.error && !dual.par.error) {
      const rows = mergeFeedRows((dual.org.data ?? []) as unknown[], (dual.par.data ?? []) as unknown[]);
      return {
        listings: rows.map((r) => parseListingRow(r as Record<string, unknown>)),
        sqlSetupRequired: false,
      };
    }
    const dualErr = dual.org.error || dual.par.error;
    if (isSchemaNotInCache(dualErr)) return "schema";

    const wide = listingsQuery(filters, select).limit(capWide);
    const { data, error } = await withTimeout(wide, LISTINGS_FETCH_MS, "Лента");
    if (!error) {
      const rows = (data ?? []) as unknown[];
      return {
        listings: rows.map((r) => parseListingRow(r as Record<string, unknown>)),
        sqlSetupRequired: false,
      };
    }
    if (isSchemaNotInCache(error)) return "schema";
    return "fail";
  }

  const first = await trySelect(fullSelect);
  if (first !== "fail" && first !== "schema") return first;
  if (first === "schema") return { listings: [], sqlSetupRequired: true };

  const second = await trySelect("*");
  if (second !== "fail" && second !== "schema") return second;
  if (second === "schema") return { listings: [], sqlSetupRequired: true };

  throw new Error("Ошибка загрузки объявлений");
}

/**
 * Объявления пользователя (профиль, продвижение, публичный профиль).
 * Если select с вложением images падает — повтор без embed (как в ленте).
 */
export async function fetchListingsForUser(userId: string): Promise<ListingRow[]> {
  if (!userId?.trim()) return [];
  const fullSelect = "*, images:images(url, sort_order)";
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

export async function incrementViews(listingId: string) {
  const { error } = await supabase.rpc("increment_listing_views", { listing: listingId });
  if (error && !isSchemaNotInCache(error)) {
    console.warn("increment_listing_views", error.message);
  }
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
      .select("*, images:images(url, sort_order)")
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

/**
 * Создаёт строку в `listings`. `id` не передаём — задаётся в БД.
 * Требуется строка в `public.users` с тем же id (FK), иначе будет ошибка FK.
 */
export async function insertListingRow(payload: ListingInsertPayload): Promise<string> {
  const uid = payload.user_id?.trim();
  if (!uid) {
    console.error("SUPABASE_SAVE_ERROR: нет user_id — пользователь не в сессии");
    throw new Error("Нет сессии. Войдите снова.");
  }

  const priceNum = Number(payload.price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    console.error("SUPABASE_SAVE_ERROR: price не число", payload.price);
    throw new Error("Некорректная цена");
  }

  const cityVal = payload.city.trim() || "Не указан";
  const base = {
    user_id: uid,
    title: payload.title.trim(),
    description: payload.description.trim(),
    price: priceNum,
    category: payload.category,
  };

  let { data, error } = await supabase.from("listings").insert({ ...base, city: cityVal }).select("id").single();

  const missingCity =
    error?.code === "PGRST204" && typeof error.message === "string" && error.message.includes("'city'");
  if (missingCity) {
    console.warn("listings insert: в схеме нет city — пробуем колонку location");
    const second = await supabase.from("listings").insert({ ...base, location: cityVal }).select("id").single();
    data = second.data;
    error = second.error;
  }

  if (error) {
    console.error("SUPABASE_SAVE_ERROR:", error);
    throw error;
  }
  if (!data?.id) {
    console.error("SUPABASE_SAVE_ERROR: пустой ответ, нет id");
    throw new Error("Объявление не создано (пустой ответ сервера)");
  }
  return data.id;
}
