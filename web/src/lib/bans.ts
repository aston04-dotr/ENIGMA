import { supabase } from "./supabase";
import { isSchemaNotInCache } from "./postgrestErrors";

/**
 * Compatibility helper for legacy callers.
 * Current live DB exposes `check_access_blocked`, so use it with `p_device = null`.
 */
export async function checkIsBanned(email: string, phone: string | null) {
  const { data, error } = await supabase.rpc("check_access_blocked", {
    p_device: "",
    p_email: email || "",
    p_phone: phone || "",
  });

  if (error) {
    if (isSchemaNotInCache(error)) return false;
    console.warn("BAN CHECK ERROR", error);
    return false;
  }

  return data === true;
}

export async function checkBanned(email: string | null | undefined, phone: string | null | undefined): Promise<boolean> {
  return checkIsBanned(email?.trim() ?? "", phone?.trim() ?? null);
}

/**
 * Бан + tombstone удалённого аккаунта + device в banned_users. banned_users не изменяется.
 */
export async function checkAccessBlocked(
  email: string | null | undefined,
  phone: string | null | undefined,
  deviceId: string | null | undefined
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_access_blocked", {
      p_device: deviceId?.trim() || "",
      p_email: email?.trim() || "",
      p_phone: phone?.trim() || "",
    });

    if (error) {
      if (isSchemaNotInCache(error)) return false;
      // Silent fail - don't crash the app
      return false;
    }

    return data === true;
  } catch (e) {
    // Silent catch - RPC not available or 400/404 error
    return false;
  }
}
