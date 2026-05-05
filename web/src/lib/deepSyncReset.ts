/**
 * Глубокая синхронизация: очистка локальных кешей ленты + полная перезагрузка страницы.
 * Бейдж «Обновить» = непрочитанные чаты + эвристика «давно не был в приложении» (localStorage).
 */

import { resetListingClientCaches } from "@/lib/listings";

export const SYNC_BADGE_EXTRA_KEY = "enigma:sync-badge-extra";
export const SYNC_LAST_DEEP_SYNC_AT_KEY = "enigma:last-deep-sync-at";
export const SYNC_BADGE_CHANGED_EVENT = "enigma-sync-badge-changed";
const RELOAD_GUARD_KEY = "enigma:reload-in-flight";

const FEED_LOCALSTORAGE_KEYS = [
  "cached_listings",
  "cached_listings_wanted",
  "feed_category",
  "enigma:chat-sync",
] as const;
const FEED_SESSIONSTORAGE_KEYS = ["feed_state"] as const;

export function getSyncBadgeStoredExtra(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(localStorage.getItem(SYNC_BADGE_EXTRA_KEY));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(99, Math.floor(n));
  } catch {
    return 0;
  }
}

export function setSyncBadgeExtra(next: number): void {
  if (typeof window === "undefined") return;
  try {
    const v = Math.max(0, Math.min(99, Math.floor(next)));
    localStorage.setItem(SYNC_BADGE_EXTRA_KEY, String(v));
    window.dispatchEvent(new CustomEvent(SYNC_BADGE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** После долгого время в фоне — слегка поднимаем «очередь обновления» (нет отдельного API уведомлений). */
export function bumpSyncBadgeExtraAfterStaleAway(hiddenMs: number, minHiddenMs = 30 * 60 * 1000): void {
  if (typeof window === "undefined") return;
  if (hiddenMs < minHiddenMs) return;
  const cur = getSyncBadgeStoredExtra();
  setSyncBadgeExtra(Math.min(99, cur + 1));
}

export function dispatchSyncBadgeChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_BADGE_CHANGED_EVENT));
}

/**
 * Единая безопасная перезагрузка для mobile/PWA:
 * - ставит auth-grace флаг, чтобы AuthProvider дождался восстановления сессии;
 * - блокирует повторный reload-шторм в коротком окне.
 */
export function reloadAppSafely(reason: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ at: Date.now(), reason }));
  } catch {
    /* ignore */
  }
  const bustUrl = new URL(window.location.href);
  bustUrl.searchParams.set("r", String(Date.now()));
  window.location.replace(bustUrl.toString());
}

async function clearBrowserHttpCachesAndWorkers(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => undefined)));
    }
  } catch {
    /* ignore */
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
}

export function runDeepApplicationSync(forceHardReload = false): void {
  if (typeof window === "undefined") return;

  resetListingClientCaches();
  for (const key of FEED_LOCALSTORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  for (const key of FEED_SESSIONSTORAGE_KEYS) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SYNC_LAST_DEEP_SYNC_AT_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }

  if (forceHardReload) {
    void clearBrowserHttpCachesAndWorkers().finally(() => {
      reloadAppSafely("deep_sync_force");
    });
    return;
  }

  reloadAppSafely("deep_sync");
}
