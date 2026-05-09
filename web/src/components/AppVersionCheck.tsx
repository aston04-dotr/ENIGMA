"use client";

import { isAuthRecoveryActive } from "@/lib/authHardRecovery";
import { pokeServiceWorkerUpdate, scheduleDeployReload } from "@/lib/deployHotReload";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "enigma_app_build_v";

function isMobileWakeEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (window.matchMedia("(hover: none)").matches) return true;
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Пуллинг версии деплоя + подталкивание SW (`update`).
 * При смене `v` из `/api/app-version` — один soft reload в том же табе (сессия из cookies сохранится).
 */
export function AppVersionCheck() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const checkMs = isMobileWakeEnvironment() ? 55_000 : 110_000;

    const check = async () => {
      if (cancelled) return;
      pokeServiceWorkerUpdate();
      try {
        const res = await fetch("/api/app-version", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { v?: string };
        const next = data.v != null ? String(data.v) : "";
        if (!next) return;

        const prev =
          typeof window.sessionStorage?.getItem === "function"
            ? sessionStorage.getItem(STORAGE_KEY)
            : null;
        if (prev != null && prev !== "" && prev !== next) {
          try {
            sessionStorage.setItem(STORAGE_KEY, next);
          } catch {
            /* quota */
          }
          scheduleDeployReload("app-version-mismatch");
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

    const onFocusOrVisible = () => {
      if (document.visibilityState !== "visible") return;
      const mobile = isMobileWakeEnvironment();
      const delayMs = mobile
        ? isAuthRecoveryActive()
          ? 2_600
          : 1_100
        : isAuthRecoveryActive()
          ? 800
          : 0;
      window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        void check();
      }, delayMs);
    };

    void check();
    intervalRef.current = window.setInterval(() => void check(), checkMs);
    window.addEventListener("pageshow", onFocusOrVisible);
    window.addEventListener("focus", onFocusOrVisible);
    window.addEventListener("online", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("pageshow", onFocusOrVisible);
      window.removeEventListener("focus", onFocusOrVisible);
      window.removeEventListener("online", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, []);

  return null;
}
