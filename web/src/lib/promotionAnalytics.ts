/**
 * Phase 4 — лёгкая телеметрия промо (заготовка под uplift / CTR).
 * Сейчас маршрутизируется в существующий `trackEvent`; позже можно заменить транспорт
 * на backend ingestion / warehouse без смены сигнатур вызовов.
 *
 * События:
 * - `promotion_impression_feed` — ListingCard (`usePromotionImpressionRef`, dedupe: вкладка × surface × listingId × tier)
 * - `promotion_impression_listing` — блок hero на странице объявления
 * - связка с `listing_open` / просмотрами для comparative uplift (BOOST vs TOP vs VIP)
 */

import { trackEvent } from "@/lib/analytics";
import { isBoostActive, isTopActive, isVipActive } from "@/lib/monetization";
import type { ListingRow } from "@/lib/types";

export type PromotionAnalyticsTier = "vip" | "top" | "boost" | "none";

export function promotionTierForAnalytics(r: ListingRow): PromotionAnalyticsTier {
  if (isVipActive(r)) return "vip";
  if (isTopActive(r)) return "top";
  if (isBoostActive(r)) return "boost";
  return "none";
}

export type PromotionAnalyticsEvent =
  | "promotion_impression_feed"
  | "promotion_impression_listing"
  | "promotion_checkout_open"
  | "promotion_return_landing";

export function trackPromotionAnalytics(
  event: PromotionAnalyticsEvent,
  payload: {
    tier?: PromotionAnalyticsTier;
    listingId?: string | null;
    [key: string]: string | number | boolean | null | undefined;
  },
): void {
  trackEvent(event, {
    domain: "promotion",
    ...payload,
  });
}
