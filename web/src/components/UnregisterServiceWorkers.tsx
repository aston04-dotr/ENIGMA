"use client";

import { useEffect } from "react";

const AGGRESSIVE_CLEAR = process.env.NEXT_PUBLIC_AGGRESSIVE_SW_CLEAR === "true";

/**
 * По умолчанию выключено: иначе ломается PWA (офлайн, установка на экран).
 * Включи `NEXT_PUBLIC_AGGRESSIVE_SW_CLEAR=true` один раз, если залип старый SW/кэш.
 */
export function UnregisterServiceWorkers() {
  useEffect(() => {
    if (!AGGRESSIVE_CLEAR) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        console.log("[sw] aggressive clear: unregistered SW + cleared caches");
      } catch (e) {
        console.warn("[sw] unregister failed", e);
      }
    })();
  }, []);

  return null;
}
