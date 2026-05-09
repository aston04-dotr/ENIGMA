import { supabase } from "./supabase";
import { FREE_ACTIVE_LISTINGS_CAP } from "./listingSlotPacks";

export type QuotaProfile = {
  listing_extra_slot_capacity?: number | null;
};

/**
 * Активные = не в статусе expired (как в ленте и профиле).
 */
export async function countUserActiveListings(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or("status.is.null,status.not.eq.expired");

  if (error) {
    console.warn("countUserActiveListings", error.message);
    return 0;
  }
  return count ?? 0;
}

export function maxAllowedActiveListings(profile: QuotaProfile | null | undefined): number {
  const extra = Math.max(0, Math.floor(Number(profile?.listing_extra_slot_capacity ?? 0)));
  return FREE_ACTIVE_LISTINGS_CAP + extra;
}

export type ActiveListingQuotaDetail = {
  active: number;
  max: number;
  message: string;
};

/** null, если можно опубликовать ещё одно активное объявление. */
export async function getListingPublishQuotaDetail(
  userId: string,
  profile: QuotaProfile | null | undefined,
): Promise<ActiveListingQuotaDetail | null> {
  const active = await countUserActiveListings(userId);
  const max = maxAllowedActiveListings(profile);
  if (active < max) return null;

  const extraCap = Math.max(0, Math.floor(Number(profile?.listing_extra_slot_capacity ?? 0)));
  const message =
    extraCap <= 0
      ? `${FREE_ACTIVE_LISTINGS_CAP} активных объявлений у вас уже в ленте — это весь бесплатный объём. Если нужно больше одновременно, в профиле можно подключить пакет дополнительных слотов.`
      : "Сейчас заняты все ваши слоты по пакетам. Завершите или перенесите в архив активные объявления либо расширьте лимит в профиле.";
  return { active, max, message };
}

/**
 * Сообщение блокировки публикации или null.
 */
export async function getListingPublishQuotaMessage(
  userId: string,
  profile: QuotaProfile | null | undefined,
): Promise<string | null> {
  const detail = await getListingPublishQuotaDetail(userId, profile);
  return detail?.message ?? null;
}
