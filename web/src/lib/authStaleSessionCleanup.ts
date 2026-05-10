import type { SupabaseClient } from "@supabase/supabase-js";
import { isInvalidLocalRefreshTokenError, peekAuthApiErrorParts } from "@/lib/authRefreshErrors";
import { stripLegacySupabaseAuthCookiesNextHeaders } from "@/lib/legacySupabaseCookies";

export { isInvalidLocalRefreshTokenError, peekAuthApiErrorParts };

/**
 * Очистка cookies/storage на сервере (middleware / RSC) после фатального refresh.
 * scope: "local" — не отзывает сессии на других устройствах.
 */
export async function serverSignOutLocalStaleSession(
  supabase: SupabaseClient,
  where: string,
): Promise<void> {
  console.warn("[AUTH_REFRESH]", {
    stage: "server_sign_out_local_begin",
    where,
    t: Date.now(),
  });
  try {
    await supabase.auth.signOut({ scope: "local" });
    console.warn("[AUTH_REFRESH]", {
      stage: "server_sign_out_local_ok",
      where,
      t: Date.now(),
    });
  } catch (e) {
    console.warn("[AUTH_REFRESH]", {
      stage: "server_sign_out_local_error",
      where,
      t: Date.now(),
      ...peekAuthApiErrorParts(e),
    });
  }
  await stripLegacySupabaseAuthCookiesNextHeaders();
}
