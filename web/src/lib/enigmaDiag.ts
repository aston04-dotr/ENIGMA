import { bumpEnigmaCounter, type EnigmaDebugCounters } from "@/lib/enigmaDebugCounters";

export function enigmaDiagEnabled(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NEXT_PUBLIC_ENIGMA_DIAG === "1";
}

/** Теги: AUTH_FLOW | REALTIME_RECONNECT | CHAT_RENDER | SESSION_REFRESH | PROFILE_REFRESH | AUTO_SCROLL */
export function diagWarn(tag: string, payload?: Record<string, unknown>) {
  if (!enigmaDiagEnabled()) return;
  const detail = payload ? { ...payload, t: Date.now() } : { t: Date.now() };
  try {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[${tag}]`);
    // eslint-disable-next-line no-console
    console.warn("detail", detail);
    if (typeof window !== "undefined" && window.ENIGMA_DEBUG_COUNTERS) {
      // eslint-disable-next-line no-console
      console.warn("ENIGMA_DEBUG_COUNTERS", { ...window.ENIGMA_DEBUG_COUNTERS });
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[${tag}]`, detail);
  }
}

export function diagBump(
  tag: "AUTH_FLOW" | "REALTIME_RECONNECT" | "CHAT_RENDER" | "SESSION_REFRESH" | "PROFILE_REFRESH" | "AUTO_SCROLL",
  key: keyof EnigmaDebugCounters,
  payload?: Record<string, unknown>,
) {
  bumpEnigmaCounter(key, 1);
  diagWarn(tag, payload);
}
