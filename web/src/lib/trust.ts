import { supabase } from "./supabase";

const RAPID_LISTING_WINDOW_MS = 5 * 60 * 1000;
const rapidListingTimestampsByUser = new Map<string, number[]>();

/** Третье объявление за 5 минут → −15 доверия (один раз за «волну»). */
export function registerRapidListingCreated(userId: string): void {
  const now = Date.now();
  let arr = rapidListingTimestampsByUser.get(userId);
  if (!arr) {
    arr = [];
    rapidListingTimestampsByUser.set(userId, arr);
  }
  arr.push(now);
  while (arr.length && arr[0]! < now - RAPID_LISTING_WINDOW_MS) {
    arr.shift();
  }
  if (arr.length === 3) {
    void decreaseTrust(userId, 15);
  }
}

/** Lower own trust (spam, duplicates, device limits, etc.). Triggers auto-ban at 0. */
export async function decreaseTrust(userId: string, amount: number): Promise<{ error: string | null }> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const self = authData.user?.id;
  if (authErr || !self) {
    return { error: "Нет сессии" };
  }
  if (self !== userId) {
    return { error: "decreaseTrust: чужой профиль — используйте reportListingTrustPenalty" };
  }
  const { error } = await supabase.rpc("decrease_trust_score", { p_user: userId, p_amount: amount });
  return { error: error?.message ?? null };
}

/** +5 доверия не чаще раза в сутки (миграция 019). Ошибки игнорируются, если RPC ещё не развёрнут. */
export async function tryDailyTrustRecovery(): Promise<void> {
  const { error } = await supabase.rpc("try_daily_trust_recovery");
  if (error && process.env.NODE_ENV === "development") {
    console.warn("try_daily_trust_recovery", error.message);
  }
}

/** Жалоба на объявление: −20 владельцу, повтор с того же аккаунта не штрафует. */
export async function reportListingTrustPenalty(
  listingId: string,
  reason: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("report_listing_trust_penalty", {
    p_listing: listingId,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}
