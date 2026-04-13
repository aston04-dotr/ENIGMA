import { supabase } from "./supabase";
import { isSchemaNotInCache } from "./postgrestErrors";

/**
 * SECURITY DEFINER RPC `check_banned` — только таблица banned_users (совместимость).
 */
export async function checkIsBanned(email: string, phone: string | null) {
  const { data, error } = await supabase.rpc("check_banned", {
    p_email: email || null,
    p_phone: phone,
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
  const { data, error } = await supabase.rpc("check_access_blocked", {
    p_email: email?.trim() || null,
    p_phone: phone?.trim() || null,
    p_device: deviceId?.trim() || null,
  });

  if (error) {
    if (isSchemaNotInCache(error)) {
      return checkBanned(email, phone);
    }
    console.warn("check_access_blocked", error.message);
    return false;
  }

  return data === true;
}
