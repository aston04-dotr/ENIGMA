"use client";

import { useEffect, useRef } from "react";
import { dispatchSyncBadgeChanged, reloadAppSafely } from "@/lib/deepSyncReset";

const STORAGE_KEY = "enigma_app_build_v";
const UPDATE_BADGE_KEY = "enigma:update-available";
const CHECK_MS = 120_000;

function isMobileRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua);
}

export function getStoredUpdateBadge(): number {
  if (typeof window === "undefined") return 0;
  try {
    return window.localStorage.getItem(UPDATE_BADGE_KEY) === "1" ? 1 : 0;
  } catch {
    return 0;
  }
}

export function clearStoredUpdateBadge(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(UPDATE_BADGE_KEY);
  } catch {
    // ignore
  }
  dispatchSyncBadgeChanged();
}

/**
 * После выката новой версии на сервере — один из открытых табов сделает reload.
 * Сравнение с last из sessionStorage (тот же деплой) или первый пинг — без лишнего F5.
 */
export function AppVersionCheck() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/app-version", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { v?: string };
        const next = data.v != null ? String(data.v) : "";
        if (!next) return;

        const prev = sessionStorage.getItem(STORAGE_KEY);
        if (prev != null && prev !== "" && prev !== next) {
          if (isMobileRuntime()) {
            clearStoredUpdateBadge();
            reloadAppSafely("app_version_mobile_auto");
            return;
          }
          try {
            localStorage.setItem(UPDATE_BADGE_KEY, "1");
          } catch {
            /* quota */
          }
          dispatchSyncBadgeChanged();
          try {
            sessionStorage.setItem(STORAGE_KEY, next);
          } catch {
            /* quota */
          }
          return;
        }
        try {
          sessionStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
      } catch (e) {
        console.error("[app-version] check failed", e);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    intervalRef.current = setInterval(() => void check(), CHECK_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
