"use client";

import { useEffect, useRef } from "react";

const ENABLE_SW = process.env.NEXT_PUBLIC_ENABLE_SW === "true";
const UPDATE_INTERVAL_MS = 5 * 60_000;

/** SW только в production и при NEXT_PUBLIC_ENABLE_SW=true; skipWaiting/clients в sw.js + reload на controllerchange. */
export function ServiceWorkerRegister() {
  const regCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !ENABLE_SW) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const onControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onReg = (reg: ServiceWorkerRegistration) => {
      if (cancelled) return;
      const ping = () => {
        void reg.update().catch((e) => {
          console.error("[sw] update", e);
        });
      };
      const interval = window.setInterval(ping, UPDATE_INTERVAL_MS);
      const onVis = () => {
        if (document.visibilityState === "visible") ping();
      };
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("focus", onVis);
      regCleanupRef.current = () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("focus", onVis);
        regCleanupRef.current = null;
      };
    };

    const runRegister = () => {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg) onReg(reg);
        })
        .catch((e) => {
          console.error("SW REGISTER ERROR", e);
        });
    };

    if (document.readyState === "complete") {
      runRegister();
    } else {
      window.addEventListener("load", runRegister);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", runRegister);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      regCleanupRef.current?.();
    };
  }, []);

  return null;
}
