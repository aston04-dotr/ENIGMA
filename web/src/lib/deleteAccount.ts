import { supabase } from "./supabase";
import { buildApiUrl } from "./runtimeConfig";

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
 * Удаление данных через RPC; удаление auth — только через POST /api/account/delete (service role).
 */
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  const { error: rpcError } = await supabase.rpc("delete_my_account");
  if (rpcError) {
    console.error("delete_my_account", rpcError);
    return { ok: false, error: rpcError.message };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    await supabase.auth.signOut();
    return { ok: true };
  }

  const res = await fetch(buildApiUrl("/api/account/delete"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    console.error("account/delete API", j);
    await supabase.auth.signOut();
    return { ok: false, error: j.error ?? "Не удалось завершить удаление сессии" };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
