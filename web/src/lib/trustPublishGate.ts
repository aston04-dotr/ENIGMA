import { supabase } from "./supabase";
import { getTrustLevel } from "./trustLevels";

type PublishProfile = {
  trust_score?: number | null;
};

/** Сообщение для пользователя или null, если публиковать можно. */
export async function getListingPublishBlockMessage(uid: string, profile: PublishProfile | null): Promise<string | null> {
  const level = getTrustLevel(profile?.trust_score);
  if (level === "CRITICAL") {
    return "Ваш аккаунт ограничен. Публикация недоступна.";
  }
  if (level === "LOW") {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid)
      .gte("created_at", hourAgo);
    if (error) return null;
    if ((count ?? 0) >= 1) {
      return "Ограничение: при низком доверии не более одного объявления в час.";
    }
  }
  return null;
}
