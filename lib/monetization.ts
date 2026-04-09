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

/**
 * Баланс рекламы в ленте:
 * - если `organic.length < 10` → интервал 2
 * - иначе → интервал 5
 * Гарантии:
 * - минимум 1 обычное объявление между рекламами
 * - нет двух реклам подряд
 * - все партнёрские объявления вставляются в ленту (при наличии хотя бы одного organic)
 * - если `organic.length === 0` → fallback: возвращаем partner ads
 */
export function interleavePartnerFeedMain(sortedMain: ListingRow[]): ListingRow[] {
  const organic = sortedMain.filter((l) => !isPartnerAd(l));
  const partners = sortedMain.filter((l) => isPartnerAd(l));
  if (organic.length === 0) {
    const out = partners;
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[feed] organic:", organic.length, "partner:", partners.length, "final:", out.length);
    }
    return out;
  }
  if (partners.length === 0) {
    const out = organic;
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[feed] organic:", organic.length, "partner:", partners.length, "final:", out.length);
    }
    return out;
  }

  const interval = organic.length < 10 ? 2 : PARTNER_FEED_ORGANIC_BEFORE_AD;
  const out: ListingRow[] = [];
  let pi = 0;

  for (let oi = 0; oi < organic.length; oi++) {
    out.push(organic[oi]!);

    const remainingOrganicAfter = organic.length - oi - 1;
    const remainingPartners = partners.length - pi;
    if (remainingPartners <= 0) continue;

    // Сколько партнёрских ещё максимум можно вставить, сохраняя минимум 1 organic между рекламами:
    // мы вставляем рекламу только после organic → после оставшихся organic можно вставить ещё (remainingOrganicAfter + 1) реклам.
    const maxPlacements = remainingOrganicAfter + 1;

    // Если партнёрок много — начиная с этого места обязаны вставлять рекламу после каждого organic,
    // иначе не успеем показать все без двух подряд.
    const mustPlaceNow = remainingPartners >= maxPlacements;
    const intervalSlot = (oi + 1) % interval === 0;

    if (mustPlaceNow || intervalSlot) {
      out.push(partners[pi++]!);
    }
  }

  // Вставляем оставшиеся партнёрские после каждого organic в конце, пока возможно (без двух реклам подряд).
  // При нормальном соотношении (≈20%) `pi` уже будет равен `partners.length`.
  if (pi < partners.length) {
    for (let i = out.length - 1; i >= 0 && pi < partners.length; i--) {
      const cur = out[i]!;
      if (isPartnerAd(cur)) continue;
      // Вставка после organic безопасна: справа либо organic/конец, слева organic/partner — но мы вставляем ОДНУ.
      out.splice(i + 1, 0, partners[pi++]!);
    }
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[feed] organic:", organic.length, "partner:", partners.length, "final:", out.length);
  }

  return out;
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
