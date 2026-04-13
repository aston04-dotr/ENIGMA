import { supabase } from "./supabase";
import type { ListingRow } from "./types";

/** Лимиты бесплатных объявлений по категориям (ключ = id категории в приложении). */
export const CATEGORY_RULES: Record<
  string,
  { freeLimit: number; periodDays: number; priceRub: number }
> = {
  auto: { freeLimit: 1, periodDays: 30, priceRub: 1000 },
  realestate: { freeLimit: 1, periodDays: 90, priceRub: 1500 },
  default: { freeLimit: 2, periodDays: 30, priceRub: 200 },
};

export function getCategoryRule(categoryId: string) {
  return CATEGORY_RULES[categoryId] ?? CATEGORY_RULES.default;
}

export function isTopActive(l: Pick<ListingRow, "is_top" | "top_until">): boolean {
  if (!l.is_top || !l.top_until) return false;
  return new Date(l.top_until).getTime() > Date.now();
}

export function isVipActive(l: Pick<ListingRow, "is_vip" | "vip_until">): boolean {
  if (!l.is_vip || !l.vip_until) return false;
  return new Date(l.vip_until).getTime() > Date.now();
}

/** Активный BOOST: есть boosted_until в будущем. */
export function isBoostActive(l: Pick<ListingRow, "boosted_until" | "boosted_at">): boolean {
  if (l.boosted_until) {
    return new Date(l.boosted_until).getTime() > Date.now();
  }
  return false;
}

/** Сколько обычных карточек подряд до одной партнёрской в основной ленте (не подряд две рекламы). */
export const PARTNER_FEED_ORGANIC_BEFORE_AD = 5;

function isPartnerAd(l: Pick<ListingRow, "is_partner_ad">): boolean {
  return l.is_partner_ad === true;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Production interleave партнёрских объявлений в ленте (UX/монетизация):
 * - динамический интервал по доле рекламы + небольшой random offset
 * - партнёрские сортируются по `boost_weight` (если есть)
 * - входные массивы не мутируются; на выходе нет дублей по `id`
 * - минимум 1 organic между рекламами и без 2 реклам подряд (если физически возможно при данном объёме organic)
 */
export function interleavePartnerFeedMain(
  sortedMain: ListingRow[],
  options?: { userId?: string }
): ListingRow[] {
  type ListingRowExt = ListingRow & {
    /** Монетизация партнёрок: вес буста (чем выше — тем выше в показах). */
    boost_weight?: number;
    /** Истечение буста: активен пока `boost_expires_at > now`. */
    boost_expires_at?: string;
    id: string;
  };

  const DEBUG_SHOW_ADS = false;

  const dedupeById = (rows: ListingRowExt[]): ListingRowExt[] => {
    const seen = new Set<string>();
    const out: ListingRowExt[] = [];
    for (const r of rows) {
      const id = String(r?.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
    return out;
  };

  const input = (sortedMain ?? []) as ListingRowExt[];
  const organic = dedupeById(input.filter((l) => !isPartnerAd(l)));
  const partnerRaw = dedupeById(input.filter((l) => isPartnerAd(l)));

  let MIN_ORGANIC_BEFORE_AD =
    organic.length < 6 ? 1 :
    organic.length < 15 ? 2 :
    3;

  // 6) FALLBACK
  if (organic.length === 0) {
    const total = partnerRaw.length;
    const ratio = total === 0 ? 0 : 1;
    const interval = 5;
    const seed = options?.userId ?? "global";
    const rand = seededRandom(seed);
    const randomOffset = Math.floor(rand() * 2);
    const effectiveInterval = interval + randomOffset;
    const result = [...partnerRaw];
    return result;
  }

  if (partnerRaw.length === 0) {
    const total = organic.length;
    const ratio = total === 0 ? 0 : 0;
    const interval = 5;
    const seed = options?.userId ?? "global";
    const rand = seededRandom(seed);
    const randomOffset = Math.floor(rand() * 2);
    const effectiveInterval = interval + randomOffset;
    const result = [...organic];
    return result;
  }

  // 7) ДИНАМИЧЕСКИЙ ИНТЕРВАЛ
  const total = organic.length + partnerRaw.length;
  const ratio = total === 0 ? 0 : partnerRaw.length / total;
  let interval = 5;
  if (ratio > 0.4) interval = 2;
  else if (ratio > 0.2) interval = 3;

  void DEBUG_SHOW_ADS;

  // 3) Персонализация + 8) стабильный random offset
  const seed = options?.userId ?? "global";
  const rand = seededRandom(seed);
  const randomOffset = Math.floor(rand() * 2);
  const effectiveInterval = interval + randomOffset;

  const randCache = new Map<string, number>();
  const getRand = (key: string) => {
    if (!randCache.has(key)) {
      randCache.set(key, seededRandom(key)());
    }
    return randCache.get(key)!;
  };

  // 9) СОРТИРОВКА РЕКЛАМЫ (active boost → weight → стабильный random)
  const now = Date.now();
  const partners = [...partnerRaw].sort((a, b) => {
    const ea = a.boost_expires_at ? new Date(a.boost_expires_at).getTime() : 0;
    const eb = b.boost_expires_at ? new Date(b.boost_expires_at).getTime() : 0;
    const activeA = ea > now;
    const activeB = eb > now;
    if (activeA !== activeB) return activeB ? 1 : -1;

    const wa = typeof a.boost_weight === "number" ? a.boost_weight : 1;
    const wb = typeof b.boost_weight === "number" ? b.boost_weight : 1;
    if (wb !== wa) return wb - wa;

    const ra = getRand(`${seed}:partner:${a.id}`);
    const rb = getRand(`${seed}:partner:${b.id}`);
    return rb - ra;
  });

  // 11) ВСТАВКА
  const result: ListingRowExt[] = [];
  let pi = 0;
  let organicRun = 0;

  for (let oi = 0; oi < organic.length; oi++) {
    const row = organic[oi]!;
    result.push(row);
    organicRun++;

    // UX защита: первые 3 — без рекламы.
    if (oi + 1 < MIN_ORGANIC_BEFORE_AD) continue;

    // Рекламу вставляем только ПОСЛЕ organic.
    if (pi < partners.length && organicRun >= effectiveInterval) {
      // Гарантия «не подряд две рекламы»: в result перед вставкой всегда organic.
      result.push(partners[pi++]!);
      organicRun = 0;
    }
  }

  // 12) ДОБИВКА: остаток партнёрок вставляем после organic, где возможно (без 2 подряд).
  if (pi < partners.length) {
    for (let i = 0; i < result.length && pi < partners.length; i++) {
      if (isPartnerAd(result[i]!)) continue;
      const after = i + 1 < result.length ? result[i + 1]! : null;
      if (after && isPartnerAd(after)) continue;
      result.splice(i + 1, 0, partners[pi++]!);
      i++;
    }
  }

  // Если партнёрок всё ещё больше, чем separators (organic), без потери показов докидываем в конец.
  while (pi < partners.length) result.push(partners[pi++]!);

  const final = dedupeById(result).map((x) => x as ListingRow);
  return final;
}

/** Сортировка ленты: приоритетный слот (TOP) без партнёрок; основная лента — сначала обычные (VIP → BOOST → дата), затем партнёрские. */
export function buildFeedSections(listings: ListingRow[]): {
  recommended: ListingRow[];
  main: ListingRow[];
} {
  const recommended = listings
    .filter((l) => isTopActive(l) && !isPartnerAd(l))
    .sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() -
        new Date(a.updated_at ?? a.created_at).getTime()
    );
  const topIds = new Set(recommended.map((l) => l.id));
  const rest = listings.filter((l) => !topIds.has(l.id));

  function tier(l: ListingRow): number {
    if (isVipActive(l)) return 2;
    if (isBoostActive(l)) return 1;
    return 0;
  }

  const main = [...rest].sort((a, b) => {
    const pa = isPartnerAd(a);
    const pb = isPartnerAd(b);
    if (pa !== pb) return pa ? 1 : -1;
    const ta = tier(a);
    const tb = tier(b);
    if (tb !== ta) return tb - ta;
    if (ta === 2) {
      const va = a.vip_until ? new Date(a.vip_until).getTime() : 0;
      const vb = b.vip_until ? new Date(b.vip_until).getTime() : 0;
      if (vb !== va) return vb - va;
    }
    if (ta === 1) {
      const ba = a.boosted_until ? new Date(a.boosted_until).getTime() : 0;
      const bb = b.boosted_until ? new Date(b.boosted_until).getTime() : 0;
      if (bb !== ba) return bb - ba;
    }
    const au = new Date(a.updated_at ?? a.created_at).getTime();
    const bu = new Date(b.updated_at ?? b.created_at).getTime();
    return bu - au;
  });

  return { recommended, main };
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function countListingsInCategoryWindow(
  userId: string,
  category: string,
  periodDays: number
): Promise<number> {
  const since = addDays(new Date(), -periodDays);
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("category", category)
    .gte("created_at", since.toISOString());
  if (error) return 0;
  return count ?? 0;
}

// ─── Тарифы BOOST / VIP ─────────────────────────────────────────────

export const BOOST_TARIFFS = [
  { id: "boost_3" as const, days: 3, priceRub: 149 },
  { id: "boost_7" as const, days: 7, priceRub: 349 },
] as const;

export const VIP_TARIFFS = [
  { id: "vip_3" as const, days: 3, priceRub: 149 },
  { id: "vip_7" as const, days: 7, priceRub: 349 },
  { id: "vip_30" as const, days: 30, priceRub: 999 },
] as const;

export type PromotionTariffKind = (typeof BOOST_TARIFFS)[number]["id"] | (typeof VIP_TARIFFS)[number]["id"];

export function parsePromotionTariffKind(s: string | undefined | null): PromotionTariffKind | null {
  const k = String(s ?? "").trim();
  if (
    k === "boost_3" ||
    k === "boost_7" ||
    k === "vip_3" ||
    k === "vip_7" ||
    k === "vip_30"
  ) {
    return k;
  }
  return null;
}

export function promotionTariffLabel(kind: PromotionTariffKind): string {
  switch (kind) {
    case "boost_3":
      return "BOOST 3 дня";
    case "boost_7":
      return "BOOST 7 дней";
    case "vip_3":
      return "VIP 3 дня";
    case "vip_7":
      return "VIP 7 дней";
    case "vip_30":
      return "VIP 30 дней";
    default:
      return kind;
  }
}

function nowIso() {
  return new Date().toISOString();
}

/** Mock-оплата: применить выбранный тариф BOOST/VIP. */
export async function applyPromotionTariff(
  listing: ListingRow,
  kind: PromotionTariffKind
): Promise<{ ok: true } | { ok: false; message: string }> {
  await new Promise((r) => setTimeout(r, 450));

  const id = listing.id;
  const now = new Date();

  if (kind === "boost_3" || kind === "boost_7") {
    const days = kind === "boost_3" ? 3 : 7;
    const nowDate = new Date();
    const nowMs = nowDate.getTime();

    const boostedUntilRaw = listing.boosted_until;
    const parsed =
      boostedUntilRaw && !isNaN(new Date(boostedUntilRaw).getTime())
        ? new Date(boostedUntilRaw)
        : nowDate;
    const current = parsed;

    const base = current.getTime() > nowMs ? current : nowDate;

    const newBoostedUntil = new Date(
      base.getTime() + days * 24 * 60 * 60 * 1000
    ).toISOString();
    const boostedAtIso = nowDate.toISOString();

    const { error: u1 } = await supabase
      .from("listings")
      .update({
        boosted_until: newBoostedUntil,
        boosted_at: boostedAtIso,
        updated_at: boostedAtIso,
      })
      .eq("id", id);
    if (u1) return { ok: false, message: u1.message };

    const { error: i1 } = await supabase.from("listing_boosts").insert({
      listing_id: id,
      type: "boost",
      expires_at: newBoostedUntil,
      created_at: boostedAtIso,
    });
    if (i1) return { ok: false, message: i1.message };
    return { ok: true };
  }

  const days = kind === "vip_3" ? 3 : kind === "vip_7" ? 7 : 30;
  let vipUntil: string;
  if (isVipActive(listing) && listing.vip_until) {
    vipUntil = addDays(new Date(listing.vip_until), days).toISOString();
  } else {
    vipUntil = addDays(now, days).toISOString();
  }
  const { error: u2 } = await supabase
    .from("listings")
    .update({ is_vip: true, vip_until: vipUntil, updated_at: nowIso() })
    .eq("id", id);
  if (u2) return { ok: false, message: u2.message };
  const { error: i2 } = await supabase.from("listing_boosts").insert({
    listing_id: id,
    type: "vip",
    expires_at: vipUntil,
  });
  if (i2) return { ok: false, message: i2.message };
  return { ok: true };
}

/** @deprecated Используйте parsePromotionTariffKind + applyPromotionTariff */
export type PromotionKind = "boost" | "vip" | "top3" | "top7";

export function parsePromotionKind(s: string | undefined | null): PromotionKind | null {
  if (s === "boost" || s === "vip" || s === "top3" || s === "top7") return s;
  return null;
}

/** Legacy TOP / старые виды boost без дней — оставлено для совместимости. */
export async function applyListingPromotionMock(
  listing: ListingRow,
  kind: PromotionKind
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (kind === "boost") {
    return applyPromotionTariff(listing, "boost_3");
  }
  if (kind === "vip") {
    return applyPromotionTariff(listing, "vip_7");
  }
  await new Promise((r) => setTimeout(r, 450));
  const id = listing.id;
  const now = new Date();
  const days = kind === "top3" ? 3 : 7;
  const currentUntil = listing.top_until && isTopActive(listing) ? new Date(listing.top_until) : now;
  const base = currentUntil > now ? currentUntil : now;
  const topUntil = addDays(base, days).toISOString();
  const { error: u3 } = await supabase
    .from("listings")
    .update({ is_top: true, top_until: topUntil, updated_at: nowIso() })
    .eq("id", id);
  if (u3) return { ok: false, message: u3.message };
  const { error: i3 } = await supabase.from("listing_boosts").insert({
    listing_id: id,
    type: "top",
    expires_at: topUntil,
  });
  if (i3) return { ok: false, message: i3.message };
  return { ok: true };
}
