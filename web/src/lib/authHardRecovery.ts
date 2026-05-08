"use client";

import {
  isHardAuthResetInFlight,
  openAuthCircuit,
  recordAuthFaultAndIsRepeat,
  setHardAuthResetInFlight,
} from "@/lib/authCircuitState";
import { purgeSupabaseAuthBrowserStorage } from "@/lib/purgeSupabaseBrowserAuth";
import { setRestAccessToken, supabase } from "@/lib/supabase";

export async function hardSignOutAndRedirectToLogin(reason: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isHardAuthResetInFlight()) return;
  setHardAuthResetInFlight(true);
  openAuthCircuit();

  purgeSupabaseAuthBrowserStorage();
  setRestAccessToken(null);

  console.error("[AUTH_HARD_RESET]", JSON.stringify({ reason }));

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* still navigate away */
  }

  try {
    window.location.replace(`${window.location.origin}/login`);
  } catch {
    window.location.href = "/login";
  }
}

export function isFatalAuthSingletonEvent(event: unknown, sess: unknown): boolean {
  const ev = String(event ?? "");
  if (ev === "TOKEN_REFRESH_REJECTED") return true;
  if (ev.includes("REFRESH_REJECTED")) return true;
  if (ev === "TOKEN_REFRESHED" && !sess) return true;
  return false;
}

export function handleRepeatedAuthListenerFault(reason: string): void {
  if (recordAuthFaultAndIsRepeat()) {
    void hardSignOutAndRedirectToLogin(reason);
  }
}
