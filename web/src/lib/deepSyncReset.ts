/**
 * Глубокая синхронизация: очистка локальных кешей ленты + полная перезагрузка страницы.
 * Бейдж «Обновить» = непрочитанные чаты + эвристика «давно не был в приложении» (localStorage).
 */

import { resetListingClientCaches } from "@/lib/listings";

export const SYNC_BADGE_EXTRA_KEY = "enigma:sync-badge-extra";
export const SYNC_LAST_DEEP_SYNC_AT_KEY = "enigma:last-deep-sync-at";
export const SYNC_BADGE_CHANGED_EVENT = "enigma-sync-badge-changed";

/** После «Обновить» AuthProvider даёт сессии до 2 с на восстановление (mobile). JSON: `{ "is_syncing": true }`. */
export const AUTH_SYNC_STATE_LS_KEY = "enigma_auth_sync_state";

export function markAuthSyncGracePending(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_SYNC_STATE_LS_KEY, JSON.stringify({ is_syncing: true }));
  } catch {
    /* ignore */
  }
}

export function clearAuthSyncGracePending(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_SYNC_STATE_LS_KEY);
  } catch {
    /* ignore */
  }
}

export function isAuthSyncGracePending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTH_SYNC_STATE_LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { is_syncing?: unknown };
    return parsed?.is_syncing === true;
  } catch {
    return false;
  }
}

const FEED_LOCALSTORAGE_KEYS = ["cached_listings", "cached_listings_wanted", "feed_category"] as const;

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

export function runDeepApplicationSync(): void {
  if (typeof window === "undefined") return;

  markAuthSyncGracePending();

  try {
    for (const k of FEED_LOCALSTORAGE_KEYS) {
      localStorage.removeItem(k);
    }
    sessionStorage.removeItem("feed_state");
  } catch {
    /* ignore */
  }

  resetListingClientCaches();

  try {
    localStorage.setItem(SYNC_LAST_DEEP_SYNC_AT_KEY, String(Date.now()));
    setSyncBadgeExtra(0);
  } catch {
    /* ignore */
  }

  window.location.reload();
}
