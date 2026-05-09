"use client";

/**
 * SINGLETON SUPABASE AUTH BROADCAST — trigger map (web shell)
 *
 * - supabase.auth.onAuthStateChange: exactly ONE subscription process-wide (guard:
 *   globalThis.__ENIGMA_AUTH_LISTENER__ via module G).
 *
 * Runtime tracing: каждое сырое событие от Supabase логируется как `[AUTH_SINGLETON_EVENT]`
 * (monotonic counter, stack fingerprint). Это разделяет «новые auth events» от
 * симптоматического повторного React render (подписчики не добавляются к этому логу).
 *
 * Consumers (subscribeEnigmaAuthSingleton):
 *   • AuthProvider — session / setRestAccessToken.
 *   • AuthDebugTracker (dev).
 *   • ChatUnreadProvider — auth uid mirror / duplicate SIGNED_IN noop (freeze); list work is keyed by deps + realtime SUBSCRIBED gate.
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { bumpEnigmaCounter } from "@/lib/enigmaDebugCounters";
import { isAuthCircuitOpen } from "@/lib/authCircuitState";
import {
  isTransientSingletonAuthFault,
  maybeHardLogoutAfterSoftRecovery,
  recoverSessionAfterTransientFault,
} from "@/lib/authHardRecovery";
import { reportEnigmaIllegalState } from "@/lib/enigmaIllegalState";
import { supabase } from "@/lib/supabase";

export type EnigmaAuthListener = (event: AuthChangeEvent, session: Session | null) => void;

const G = globalThis as typeof globalThis & {
  __ENIGMA_AUTH_LISTENER__?: boolean;
  __ENIGMA_AUTH_SUBSCRIBERS__?: Set<EnigmaAuthListener>;
};

let authSingletonDeliveries = 0;
let lastIngressFingerprint = "";
let lastIngressWallMs = 0;

function subscriberSet(): Set<EnigmaAuthListener> {
  if (!G.__ENIGMA_AUTH_SUBSCRIBERS__) {
    G.__ENIGMA_AUTH_SUBSCRIBERS__ = new Set();
  }
  return G.__ENIGMA_AUTH_SUBSCRIBERS__;
}

function logAuthSingletonIngress(event: AuthChangeEvent, session: Session | null) {
  const uid = session?.user?.id ?? "(anon)";
  const tail = session?.access_token?.slice(-16) ?? "(none)";
  const normalizedTail = tail === "(none)" ? tail : `…${tail}`;
  const fps = `${event}|${normalizedTail}|${uid}`;
  const wall = Date.now();
  if (fps === lastIngressFingerprint && wall - lastIngressWallMs < 300) {
    reportEnigmaIllegalState("auth-singleton-duplicate-fingerprint", {
      event,
      userId: uid,
      tokenTail: normalizedTail,
      deltaMs: wall - lastIngressWallMs,
    });
  }
  lastIngressFingerprint = fps;
  lastIngressWallMs = wall;

  authSingletonDeliveries += 1;
  bumpEnigmaCounter("authSingletonIngressCount");
  const stackFp =
    new Error("auth-singleton-stack-fp").stack?.split("\n").slice(0, 4).join(" \u2192 ") ??
    "";

  console.warn("[AUTH_SINGLETON_EVENT]", {
    n: authSingletonDeliveries,
    event,
    userId: uid,
    tokenTail: normalizedTail,
    ts: typeof performance !== "undefined" ? performance.now() : Date.now(),
    tWall: Date.now(),
    stackFp,
  });
}

function emit(event: AuthChangeEvent, session: Session | null) {
  const set = G.__ENIGMA_AUTH_SUBSCRIBERS__;
  if (!set?.size) return;
  for (const fn of set) {
    try {
      fn(event, session);
    } catch {
      /* subscriber must not break others */
    }
  }
}

/**
 * Exactly one supabase.auth.onAuthStateChange for the whole app shell.
 * Provider remounts only add/remove subscribers; the Supabase subscription is never duplicated.
 */
function ensureGlobalAuthListener() {
  if (typeof window === "undefined") return;
  if (G.__ENIGMA_AUTH_LISTENER__) return;
  G.__ENIGMA_AUTH_LISTENER__ = true;

  supabase.auth.onAuthStateChange((event, session) => {
    const evStr = String(event);

    if (isTransientSingletonAuthFault(event, session)) {
      console.warn("[AUTH_NULL_SESSION_SOFT]", {
        event: evStr,
        singleton: true,
      });
      void recoverSessionAfterTransientFault(`singleton:${evStr}`).then(async (recovered) => {
        if (recovered) {
          emit("TOKEN_REFRESHED", recovered);
          return;
        }
        await maybeHardLogoutAfterSoftRecovery(evStr);
      });
      return;
    }

    if (isAuthCircuitOpen() && event !== "SIGNED_OUT") {
      return;
    }

    logAuthSingletonIngress(event, session);
    emit(event, session);
  });
}

export function subscribeEnigmaAuthSingleton(listener: EnigmaAuthListener): () => void {
  ensureGlobalAuthListener();
  const set = subscriberSet();
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}
