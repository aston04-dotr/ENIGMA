"use client";

export {
  backoffIntervalWithJitter,
  devPushLog,
  invalidateSupabaseHealthCache,
  isBackoffSkipped,
  sleep,
  withPostgrestBackoff,
  type BackoffSkipReason,
  type PostgrestCallResult,
  type WithPostgrestBackoffOutcome,
  POSTGREST_OP_TIMEOUT_MS,
} from "../../../lib/supabaseHealth";

import { isSupabaseReachable as isAuthHealthForUrl } from "../../../lib/supabaseHealth";
import { getSupabasePublicConfig } from "./runtimeConfig";

/**
 * Проверка /auth/v1/health (только apikey) для текущего Next.js конфига.
 */
export async function isSupabaseReachable(): Promise<boolean> {
  const { url, anonKey, configured } = getSupabasePublicConfig();
  if (!configured) return false;
  return isAuthHealthForUrl(url, anonKey);
}
