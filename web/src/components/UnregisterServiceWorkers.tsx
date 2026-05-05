"use client";

import { useEffect } from "react";

export function UnregisterServiceWorkers() {
  useEffect(() => {
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
        console.log("[sw] disabled: unregistered all service workers and caches");
      } catch (e) {
        console.warn("[sw] unregister failed", e);
      }
    })();
  }, []);

  return null;
}
