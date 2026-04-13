import { BOOST_TARIFFS, promotionTariffLabel, type PromotionTariffKind } from "@/lib/monetization";

export const ONE_CLICK_BOOST_KIND: PromotionTariffKind = "boost_3";
export const VIP_UPSELL_BASE_PRICE_RUB = 349;
export const VIP_UPSELL_DISCOUNT_PRICE_RUB = 249;
export const TOP_PRICE_RUB = 249;

export function defaultBoostTariffForCheckout() {
  const t = BOOST_TARIFFS.find((x) => x.id === ONE_CLICK_BOOST_KIND);
  if (!t) throw new Error("BOOST_TARIFFS: boost_3 missing");
  return t;
}

export function defaultBoostCtaPriceRub(): number {
  return defaultBoostTariffForCheckout().priceRub;
}

export function webBoostPaymentQuery(listingId: string, userId?: string | null): string {
  const t = defaultBoostTariffForCheckout();
  const q = new URLSearchParams({
    listingId,
    promoKind: t.id,
    amount: String(t.priceRub),
    title: promotionTariffLabel(t.id),
  });
  if (userId?.trim()) q.set("uid", userId.trim());
  return q.toString();
}

/** Upsell VIP после успешного Boost (спеццена в UI; тариф vip_7 в логике начисления). */
export function webVipUpsellPaymentQuery(listingId: string, userId?: string | null): string {
  const q = new URLSearchParams({
    listingId,
    promoKind: "vip_7",
    amount: String(VIP_UPSELL_DISCOUNT_PRICE_RUB),
    title: "VIP 7 дней",
  });
  if (userId?.trim()) q.set("uid", userId.trim());
  return q.toString();
}

/** Цена VIP для CTA на карточке. */
export function defaultVipCtaPriceRub(): number {
  return VIP_UPSELL_BASE_PRICE_RUB;
}

/** Параметры VIP оплаты для веба (прямой VIP без upsell). */
export function webVipPaymentQuery(listingId: string, userId?: string | null): string {
  const q = new URLSearchParams({
    listingId,
    promoKind: "vip_7",
    amount: String(VIP_UPSELL_BASE_PRICE_RUB),
    title: "VIP 7 дней",
  });
  if (userId?.trim()) q.set("uid", userId.trim());
  return q.toString();
}

/** Цена TOP для CTA на карточке. */
export function defaultTopCtaPriceRub(): number {
  return TOP_PRICE_RUB;
}

/** Параметры TOP оплаты для веба. */
export function webTopPaymentQuery(listingId: string, userId?: string | null): string {
  const q = new URLSearchParams({
    listingId,
    promoKind: "top_7",
    amount: String(TOP_PRICE_RUB),
    title: "TOP 7 дней",
  });
  if (userId?.trim()) q.set("uid", userId.trim());
  return q.toString();
}
