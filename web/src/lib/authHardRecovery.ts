"use client";

import type { Session } from "@supabase/supabase-js";
import {
  isHardAuthResetInFlight,
  openAuthCircuit,
  recordAuthFaultAndIsRepeat,
  setHardAuthResetInFlight,
} from "@/lib/authCircuitState";
import { purgeSupabaseAuthBrowserStorage } from "@/lib/purgeSupabaseBrowserAuth";
import { setRestAccessToken, supabase } from "@/lib/supabase";

/** Touch / standalone PWA — не делаем hard logout из транзиторных ошибок refresh. */
export function preferMobileSoftAuthPath(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (window.matchMedia("(hover: none)").matches) return true;
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    const nav = navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function dispatchAuthSessionRecoveryActive(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("enigma-auth-session-recovery", { detail: { active } }),
    );
  } catch {
    /* ignore */
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * После TOKEN_REFRESH_REJECTED / странного TOKEN_REFRESH — ждём storage/cookies и несколько попыток.
 * Не редиректит; вызывает hard logout только через maybeHardLogoutAfterSoftRecovery (и то осторожно).
 */
export async function recoverSessionAfterTransientFault(context: string): Promise<Session | null> {
  dispatchAuthSessionRecoveryActive(true);
  console.warn("[AUTH_MOBILE_WAKE]", { context, phase: "soft_recovery_start" });
  const delays = [120, 280, 520, 900, 1600];
  try {
    for (let attempt = 0; attempt < delays.length; attempt++) {
      console.warn("[AUTH_REFRESH_RETRY]", { context, attempt });
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline) {
        console.warn("[AUTH_NULL_SESSION_SOFT]", {
          context,
          phase: "offline_pause",
          attempt,
        });
        await sleepMs(delays[attempt] ?? 600);
        continue;
      }

      await sleepMs(delays[attempt] ?? 400);

      const { data: gs, error: ge } = await supabase.auth.getSession();
      if (!ge && gs.session?.user) {
        console.warn("[AUTH_MOBILE_WAKE]", {
          context,
          phase: "recovered_via_getSession",
          attempt,
        });
        return gs.session;
      }

      if (attempt === 2) {
        const { data: ref, error: re } = await supabase.auth.refreshSession();
        if (!re && ref.session?.user) {
          console.warn("[AUTH_MOBILE_WAKE]", {
            context,
            phase: "recovered_via_refreshSession",
            attempt,
          });
          return ref.session;
        }
      }

      const { data: gu, error: ue } = await supabase.auth.getUser();
      if (!ue && gu.user) {
        const { data: gs2 } = await supabase.auth.getSession();
        if (gs2.session?.user) {
          console.warn("[AUTH_MOBILE_WAKE]", {
            context,
            phase: "recovered_via_getUser",
            attempt,
          });
          return gs2.session;
        }
      }

      console.warn("[AUTH_NULL_SESSION_SOFT]", {
        context,
        attempt,
        getSessionErr: ge?.message,
        getUserErr: ue?.message,
      });
    }
    console.warn("[AUTH_MOBILE_WAKE]", { context, phase: "soft_recovery_exhausted" });
    return null;
  } finally {
    dispatchAuthSessionRecoveryActive(false);
  }
}

export async function maybeHardLogoutAfterSoftRecovery(evStr: string): Promise<void> {
  console.warn("[AUTH_HARD_LOGOUT_REASON]", {
    phase: "eval_after_soft_recovery",
    event: evStr,
  });
  if (preferMobileSoftAuthPath()) {
    console.warn("[AUTH_HARD_LOGOUT_REASON]", {
      decision: "skip_mobile_pwa_soft_path",
      event: evStr,
    });
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.warn("[AUTH_HARD_LOGOUT_REASON]", { decision: "skip_offline", event: evStr });
    return;
  }

  const { data, error } = await supabase.auth.getUser();
  if (data.user) {
    console.warn("[AUTH_HARD_LOGOUT_REASON]", {
      decision: "skip_getUser_still_has_user",
      event: evStr,
    });
    return;
  }

  const msg = String(error?.message ?? "").toLowerCase();
  const looksInvalid =
    msg.includes("invalid") ||
    msg.includes("jwt") ||
    msg.includes("refresh") ||
    msg.includes("session") ||
    msg.includes("expired");
  if (!looksInvalid) {
    console.warn("[AUTH_HARD_LOGOUT_REASON]", {
      decision: "skip_ambiguous_error",
      event: evStr,
      error: error?.message,
    });
    return;
  }

  console.error("[AUTH_HARD_LOGOUT_REASON]", {
    decision: "execute_hard_redirect",
    event: evStr,
    error: error?.message,
  });
  await hardSignOutAndRedirectToLogin(`soft-recovery-failed:${evStr}`);
}

export async function hardSignOutAndRedirectToLogin(reason: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (isHardAuthResetInFlight()) return;
  setHardAuthResetInFlight(true);
  openAuthCircuit();

  purgeSupabaseAuthBrowserStorage();
  setRestAccessToken(null);

  console.error("[AUTH_HARD_LOGOUT_REASON]", { execute: true, reason });
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

/**
 * Раньше вело к немедленному hard logout на singleton; после wake на iOS это часто false positive.
 * Теперь — только триггер мягкого recoverSessionAfterTransientFault.
 */
export function isTransientSingletonAuthFault(event: unknown, sess: unknown): boolean {
  const ev = String(event ?? "");
  if (ev === "TOKEN_REFRESH_REJECTED") return true;
  if (ev.includes("REFRESH_REJECTED")) return true;
  if (ev === "TOKEN_REFRESHED" && !sess) return true;
  return false;
}

/** Алиас для обратной совместимости/поиска в коде. */
export function isFatalAuthSingletonEvent(event: unknown, sess: unknown): boolean {
  return isTransientSingletonAuthFault(event, sess);
}

export function handleRepeatedAuthListenerFault(reason: string): void {
  if (recordAuthFaultAndIsRepeat()) {
    console.error("[AUTH_HARD_LOGOUT_REASON]", {
      execute: true,
      source: "repeated_listener_fault",
      reason,
    });
    void hardSignOutAndRedirectToLogin(reason);
  }
}
