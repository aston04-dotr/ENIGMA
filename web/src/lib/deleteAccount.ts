import { supabase } from "./supabase";

const ACCESS_DENIED_KEY = "enigma_access_denied";

export function markAccessDeniedForLogin() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(ACCESS_DENIED_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function consumeAccessDeniedMessage(): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    const v = sessionStorage.getItem(ACCESS_DENIED_KEY);
    if (v) {
      sessionStorage.removeItem(ACCESS_DENIED_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Удаление аккаунта через RPC функцию public.delete_my_account().
 */
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn("no user, skip rpc delete_my_account");
    return { ok: false, error: "Нет сессии" };
  }
  const { error: rpcError } = await supabase.rpc("delete_my_account");
  if (rpcError) {
    console.error("delete_my_account RPC error", rpcError);
    return { ok: false, error: rpcError.message };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
