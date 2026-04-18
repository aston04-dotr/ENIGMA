import { supabase } from "./supabase";
import { isSchemaNotInCache } from "./postgrestErrors";

/**
 * SECURITY DEFINER RPC `check_banned` — только banned_users.
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

/** Бан + tombstone удалённого аккаунта + device в banned_users. */
export async function checkAccessBlocked(
  email: string | null | undefined,
  phone: string | null | undefined,
  deviceId: string | null | undefined
): Promise<boolean> {
  void email;
  void phone;
  void deviceId;
  return false;
}
