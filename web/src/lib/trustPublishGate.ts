import { supabase } from "./supabase";
import { getListingPublishQuotaDetail, type ActiveListingQuotaDetail } from "./listingPublishQuota";
import { getTrustLevel } from "./trustLevels";

type PublishProfile = {
  trust_score?: number | null;
  listing_extra_slot_capacity?: number | null;
};

export type ListingPublishGateResult =
  | { ok: true }
  | { ok: false; block: "active_listing_quota"; quota: ActiveListingQuotaDetail }
  | { ok: false; block: "other"; message: string };

/**
 * Полная проверка перед публикацией: доверие + лимит активных объявлений.
 */
export async function assessListingPublishGate(uid: string, profile: PublishProfile | null): Promise<ListingPublishGateResult> {
  const level = getTrustLevel(profile?.trust_score);
  if (level === "CRITICAL") {
    return { ok: false, block: "other", message: "Ваш аккаунт ограничен. Публикация недоступна." };
  }
  if (level === "LOW") {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid)
      .gte("created_at", hourAgo);
    if (!error && (count ?? 0) >= 1) {
      return {
        ok: false,
        block: "other",
        message: "Ограничение: при низком доверии не более одного объявления в час.",
      };
    }
  }

  const quota = await getListingPublishQuotaDetail(uid, profile);
  if (quota) {
    return { ok: false, block: "active_listing_quota", quota };
  }

  return { ok: true };
}

/** Сообщение для пользователя или null, если публиковать можно. */
export async function getListingPublishBlockMessage(uid: string, profile: PublishProfile | null): Promise<string | null> {
  const gate = await assessListingPublishGate(uid, profile);
  if (gate.ok) return null;
  if (gate.block === "active_listing_quota") return gate.quota.message;
  return gate.message;
}
