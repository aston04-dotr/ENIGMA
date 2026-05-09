"use client";

import type { Session } from "@supabase/supabase-js";
import {
  closeAuthCircuit,
  isHardAuthResetInFlight,
  openAuthCircuit,
  recordAuthFaultAndIsRepeat,
  resetAuthFaultWindow,
  setHardAuthResetInFlight,
} from "@/lib/authCircuitState";
import {
  isInvalidLocalRefreshTokenError,
  peekAuthApiErrorParts,
} from "@/lib/authRefreshErrors";
import { purgeSupabaseAuthBrowserStorage } from "@/lib/purgeSupabaseBrowserAuth";
import { setRestAccessToken, supabase } from "@/lib/supabase";
import { bumpEnigmaCounter } from "@/lib/enigmaDebugCounters";
import { diagWarn, enigmaDiagEnabled } from "@/lib/enigmaDiag";

export { isInvalidLocalRefreshTokenError, peekAuthApiErrorParts } from "@/lib/authRefreshErrors";

/** Дедуп одновременных clear (вкладки / middleware client+server гонка). */
let lastInvalidRefreshClearAt = 0;
const INVALID_REFRESH_CLEAR_COOLDOWN_MS = 4_000;

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

/** Вложенные recoverSessionAfterTransientFault / будущие pipeline — глубина > 0 блокирует deploy reload. */
let authRecoveryDepth = 0;

export function isAuthRecoveryActive(): boolean {
  return authRecoveryDepth > 0;
}

export function dispatchAuthSessionRecoveryActive(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) {
    authRecoveryDepth += 1;
  } else {
    authRecoveryDepth = Math.max(0, authRecoveryDepth - 1);
  }
  const effective = authRecoveryDepth > 0;
  try {
    window.dispatchEvent(
      new CustomEvent("enigma-auth-session-recovery", {
        detail: { active: effective },
      }),
    );
  } catch {
    /* ignore */
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Удаляет только локальную сессию (cookies + storage), не трогая другие устройства.
 * Вызывать при refresh_token_not_found / Invalid Refresh Token.
 */
export async function clearClientAuthAfterInvalidRefresh(reason: string): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastInvalidRefreshClearAt < INVALID_REFRESH_CLEAR_COOLDOWN_MS) {
    console.warn("[AUTH_REFRESH]", {
      stage: "client_clear_skipped_cooldown",
      reason,
      dtMs: now - lastInvalidRefreshClearAt,
    });
    return;
  }
  lastInvalidRefreshClearAt = now;

  console.warn("[AUTH_REFRESH]", {
    stage: "client_invalid_refresh_clear_begin",
    reason,
    t: now,
  });

  openAuthCircuit();
  purgeSupabaseAuthBrowserStorage();
  setRestAccessToken(null);

  console.warn("[AUTH_REFRESH]", {
    stage: "client_sign_out_local",
    reason,
  });
  try {
    await supabase.auth.signOut({ scope: "local" });
    console.warn("[AUTH_REFRESH]", { stage: "client_sign_out_local_ok", reason });
  } catch (e) {
    console.warn("[AUTH_REFRESH]", {
      stage: "client_sign_out_local_exception",
      reason,
      ...peekAuthApiErrorParts(e),
    });
  } finally {
    closeAuthCircuit();
    resetAuthFaultWindow();
    setHardAuthResetInFlight(false);
    console.warn("[AUTH_REFRESH]", { stage: "client_invalid_refresh_clear_end", reason });
  }
}

/**
 * После сетевых/transient проблем wake — несколько попыток getSession/getUser без отдельного refreshSession().
 * getSession уже вызывает _callRefreshToken внутри GoTrue при просроченном access token.
 */
export async function recoverSessionAfterTransientFault(context: string): Promise<Session | null> {
  const immediate = await supabase.auth.getSession();
  if (immediate.error && isInvalidLocalRefreshTokenError(immediate.error)) {
    console.warn("[AUTH_REFRESH]", {
      stage: "recover_immediate_fatal_refresh",
      context,
      ...peekAuthApiErrorParts(immediate.error),
    });
    await clearClientAuthAfterInvalidRefresh(`recover:immediate:${context}`);
    return null;
  }

  dispatchAuthSessionRecoveryActive(true);
  console.warn("[AUTH_MOBILE_WAKE]", { context, phase: "soft_recovery_start" });
  console.warn("[AUTH_REFRESH]", {
    stage: "soft_recovery_start",
    context,
    t: Date.now(),
  });
  const delays = [120, 280, 520, 900, 1600];
  try {
    for (let attempt = 0; attempt < delays.length; attempt++) {
      console.warn("[AUTH_REFRESH_RETRY]", { context, attempt });
      bumpEnigmaCounter("sessionDiagRefreshAttempts");
      if (enigmaDiagEnabled()) {
        diagWarn("SESSION_REFRESH", {
          phase: "soft_recovery_attempt",
          context,
          attempt,
        });
      }
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
      if (ge && isInvalidLocalRefreshTokenError(ge)) {
        console.warn("[AUTH_REFRESH]", {
          stage: "recover_loop_fatal_refresh_getSession",
          context,
          attempt,
          ...peekAuthApiErrorParts(ge),
        });
        await clearClientAuthAfterInvalidRefresh(`recover:getSession:${context}`);
        return null;
      }

      if (!ge && gs.session?.user) {
        console.warn("[AUTH_MOBILE_WAKE]", {
          context,
          phase: "recovered_via_getSession",
          attempt,
        });
        console.warn("[AUTH_REFRESH]", {
          stage: "soft_recovery_ok_getSession",
          context,
          attempt,
          uid: gs.session.user.id,
        });
        return gs.session;
      }

      const { data: gu, error: ue } = await supabase.auth.getUser();
      if (ue && isInvalidLocalRefreshTokenError(ue)) {
        console.warn("[AUTH_REFRESH]", {
          stage: "recover_loop_fatal_refresh_getUser",
          context,
          attempt,
          ...peekAuthApiErrorParts(ue),
        });
        await clearClientAuthAfterInvalidRefresh(`recover:getUser:${context}`);
        return null;
      }
      if (!ue && gu.user) {
        const { data: gs2 } = await supabase.auth.getSession();
        if (gs2.session?.user) {
          console.warn("[AUTH_MOBILE_WAKE]", {
            context,
            phase: "recovered_via_getUser",
            attempt,
          });
          console.warn("[AUTH_REFRESH]", {
            stage: "soft_recovery_ok_getUser",
            context,
            attempt,
            uid: gu.user.id,
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
    console.warn("[AUTH_REFRESH]", { stage: "soft_recovery_exhausted", context });
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

  const pre = await supabase.auth.getSession();
  if (pre.error && isInvalidLocalRefreshTokenError(pre.error)) {
    console.warn("[AUTH_HARD_LOGOUT_REASON]", {
      decision: "fatal_refresh_via_getSession_probe",
      event: evStr,
      ...peekAuthApiErrorParts(pre.error),
    });
    await clearClientAuthAfterInvalidRefresh(`maybeHardLogout:probe_getSession:${evStr}`);
    return;
  }

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

  const code = peekAuthApiErrorParts(error).code ?? "";
  if (error && isInvalidLocalRefreshTokenError(error)) {
    console.warn("[AUTH_HARD_LOGOUT_REASON]", {
      decision: "skip_fatal_refresh_already_handled_path",
      event: evStr,
      ...peekAuthApiErrorParts(error),
    });
    await clearClientAuthAfterInvalidRefresh(`maybeHardLogout:${evStr}:${code}`);
    return;
  }

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
 * После проблем TOKEN_REFRESH_REJECTED и т.п. — мягкое recoverSessionAfterTransientFault.
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
