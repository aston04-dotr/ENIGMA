"use client";

import { scheduleDeployReload } from "@/lib/deployHotReload";
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let hasControllerRefresh = false;
    let updateInterval: number | null = null;

    const onControllerChange = () => {
      if (hasControllerRefresh) return;
      hasControllerRefresh = true;
      scheduleDeployReload("service-worker-controllerchange");
    };

    let controllerListenerAttached = false;

    const activateWaitingWorker = (reg: ServiceWorkerRegistration | null) => {
      const waiting = reg?.waiting;
      if (!waiting) return;
      if (!controllerListenerAttached) {
        controllerListenerAttached = true;
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
      waiting.postMessage({ type: "SKIP_WAITING" });
    };

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (cancelled) return;

        // Если обновление уже "ждёт", применяем policy сразу.
        if (registration.waiting) {
          activateWaitingWorker(registration);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            if (!navigator.serviceWorker.controller) return;
            activateWaitingWorker(registration);
          });
        });

        // Регулярный чек обновлений SW.
        updateInterval = window.setInterval(() => {
          void registration.update().catch(() => undefined);
        }, 120_000);
      } catch (e) {
        console.warn("[sw] register failed", e);
      }
    })();

    return () => {
      cancelled = true;
      if (updateInterval) {
        window.clearInterval(updateInterval);
      }
      if (controllerListenerAttached) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange,
        );
        controllerListenerAttached = false;
      }
    };
  }, []);

  return null;
}
