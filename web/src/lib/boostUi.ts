import { isBoostActive, isVipActive } from "./monetization";
import type { ListingRow } from "./types";

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;
const MS_12H = 12 * MS_HOUR;

/** Оставшееся время активного BOOST (мс), иначе null. */
export function boostRemainingMs(boostedUntil: string | null | undefined): number | null {
  if (!boostedUntil) return null;
  const end = new Date(boostedUntil).getTime();
  if (isNaN(end)) return null;
  const diff = end - Date.now();
  return diff > 0 ? diff : null;
}

/** Например "2d 4h" (дни и часы до окончания). */
export function formatBoostEndsIn(remainingMs: number): string {
  const days = Math.floor(remainingMs / MS_DAY);
  const hours = Math.floor((remainingMs % MS_DAY) / MS_HOUR);
  return `${days}d ${hours}h`;
}

/** Человекочитаемо для UI: «осталось 2 дн. 4 ч». */
export function formatBoostRemainingRu(remainingMs: number): string {
  const days = Math.floor(remainingMs / MS_DAY);
  const hours = Math.floor((remainingMs % MS_DAY) / MS_HOUR);
  if (days > 0) return `осталось ${days} дн. ${hours} ч`;
  if (hours > 0) return `осталось ${hours} ч`;
  const mins = Math.max(1, Math.floor((remainingMs % MS_HOUR) / (60 * 1000)));
  return `осталось ${mins} мин`;
}

/** Активный BOOST и до конца меньше 24 ч. */
export function isBoostExpiringSoon(listing: Pick<ListingRow, "boosted_until">): boolean {
  const r = boostRemainingMs(listing.boosted_until);
  return r != null && r < MS_DAY;
}

/** Активный BOOST и до конца меньше 12 ч — срочный UI (FOMO), без спама раньше срока. */
export function isBoostLastHours(listing: Pick<ListingRow, "boosted_until">): boolean {
  const r = boostRemainingMs(listing.boosted_until);
  return r != null && r < MS_12H;
}

/** Срок boost вышел — показать «поднять снова». */
export function isBoostExpiredForUpsell(listing: Pick<ListingRow, "boosted_until">): boolean {
  if (isBoostActive(listing)) return false;
  if (!listing.boosted_until) return false;
  const end = new Date(listing.boosted_until).getTime();
  return Number.isFinite(end) && end <= Date.now();
}

/** Текст nudge рядом с `shouldShowBoostVisibilityNudge` (числовой акцент на потере охвата). */
export const boostVisibilityNudgeMessage =
  "Без продвижения объявление получает в 2–3 раза меньше просмотров";

/** Подсказка продаж: не VIP, не BOOST, с момента создания прошло больше 24 ч. */
export function shouldShowBoostVisibilityNudge(listing: ListingRow): boolean {
  if (isVipActive(listing) || isBoostActive(listing)) return false;
  const created = new Date(listing.created_at).getTime();
  if (isNaN(created)) return false;
  return Date.now() - created > MS_DAY;
}
