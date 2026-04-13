import { BOOST_TARIFFS, promotionTariffLabel, type PromotionTariffKind } from "./monetization";

/** Тариф по умолчанию для «в один клик» с карточки ленты. */
export const ONE_CLICK_BOOST_KIND: PromotionTariffKind = "boost_3";
export const VIP_UPSELL_BASE_PRICE_RUB = 349;
export const VIP_UPSELL_DISCOUNT_PRICE_RUB = 249;

export function defaultBoostTariffForCheckout() {
  const t = BOOST_TARIFFS.find((x) => x.id === ONE_CLICK_BOOST_KIND);
  if (!t) throw new Error("BOOST_TARIFFS: boost_3 missing");
  return t;
}

/** Цена дефолтного буста для CTA «за N ₽». */
export function defaultBoostCtaPriceRub(): number {
  return defaultBoostTariffForCheckout().priceRub;
}

/** Параметры экрана оплаты Expo Router. */
export function expoBoostPaymentParams(listingId: string, userId?: string | null) {
  const t = defaultBoostTariffForCheckout();
  const base = {
    listingId,
    promoKind: t.id,
    amount: String(t.priceRub),
    title: promotionTariffLabel(t.id),
  } as Record<string, string>;
  if (userId?.trim()) base.uid = userId.trim();
  return base;
}

export function expoVipUpsellAfterBoostParams(listingId: string, userId?: string | null) {
  const base: Record<string, string> = {
    listingId,
    promoKind: "vip_7",
    amount: String(VIP_UPSELL_DISCOUNT_PRICE_RUB),
    title: "VIP 7 дней",
  };
  if (userId?.trim()) base.uid = userId.trim();
  return base;
}

/** Цена VIP для CTA. */
export function defaultVipCtaPriceRub(): number {
  return VIP_UPSELL_BASE_PRICE_RUB;
}

/** Параметры VIP экрана оплаты для веба. */
export function webVipPaymentQuery(listingId: string, userId?: string | null): string {
  const params = new URLSearchParams();
  params.set("listingId", listingId);
  params.set("promoKind", "vip_7");
  params.set("amount", String(VIP_UPSELL_BASE_PRICE_RUB));
  params.set("title", "VIP 7 дней");
  if (userId?.trim()) params.set("uid", userId.trim());
  return params.toString();
}
