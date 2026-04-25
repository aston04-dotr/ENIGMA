"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "enigma_app_build_v";
const CHECK_MS = 120_000;

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
          try {
            sessionStorage.setItem(STORAGE_KEY, next);
          } catch {
            /* quota */
          }
          window.location.reload();
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
