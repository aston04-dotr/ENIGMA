/**
 * Mutable runtime counters mounted on window for device / logcat sanity checks.
 */

export type EnigmaDebugCounters = {
  authSingletonIngressCount: number;
  realtimeConnectAttemptCount: number;
  realtimeSubscribedCount: number;
  refreshChatsStartCount: number;
  refreshChatsSkipNoTokenCount: number;
  reconcileStartCount: number;
  reconnectSuppressedSubscribedCount: number;
  strictModeDuplicateCount: number;
};

const zeroCounters = (): EnigmaDebugCounters => ({
  authSingletonIngressCount: 0,
  realtimeConnectAttemptCount: 0,
  realtimeSubscribedCount: 0,
  refreshChatsStartCount: 0,
  refreshChatsSkipNoTokenCount: 0,
  reconcileStartCount: 0,
  reconnectSuppressedSubscribedCount: 0,
  strictModeDuplicateCount: 0,
});

declare global {
  interface Window {
    ENIGMA_DEBUG_COUNTERS?: EnigmaDebugCounters;
  }
}

const FALLBACK_KEY = "__ENIGMA_DEBUG_COUNTERS_SSR_FALLBACK__" as const;

function fallbackStore(): EnigmaDebugCounters {
  const g = globalThis as typeof globalThis & {
    [FALLBACK_KEY]?: EnigmaDebugCounters;
  };
  if (!g[FALLBACK_KEY]) {
    g[FALLBACK_KEY] = zeroCounters();
  }
  return g[FALLBACK_KEY];
}

/** Singleton map of counters (`window.ENIGMA_DEBUG_COUNTERS` in browser). */
export function getEnigmaDebugCounters(): EnigmaDebugCounters {
  if (typeof window !== "undefined") {
    if (!window.ENIGMA_DEBUG_COUNTERS) {
      window.ENIGMA_DEBUG_COUNTERS = zeroCounters();
    }
    return window.ENIGMA_DEBUG_COUNTERS;
  }
  return fallbackStore();
}

export function bumpEnigmaCounter(
  key: keyof EnigmaDebugCounters,
  delta: number = 1,
): void {
  const c = getEnigmaDebugCounters();
  c[key] += delta;
}
