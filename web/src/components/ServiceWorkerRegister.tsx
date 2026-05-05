"use client";

import { useEffect } from "react";
import {
  clearStoredUpdateBadge,
  getStoredUpdateBadge,
} from "@/components/AppVersionCheck";
import { dispatchSyncBadgeChanged, reloadAppSafely } from "@/lib/deepSyncReset";

function isMobileRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua);
}

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
      clearStoredUpdateBadge();
      reloadAppSafely("sw_controller_change");
    };

    const markDesktopUpdate = () => {
      if (isMobileRuntime()) return;
      try {
        window.localStorage.setItem("enigma:update-available", "1");
      } catch {
        // ignore
      }
      dispatchSyncBadgeChanged();
    };

    const activateWaitingWorker = (reg: ServiceWorkerRegistration | null) => {
      const waiting = reg?.waiting;
      if (!waiting) return;
      if (isMobileRuntime()) {
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        markDesktopUpdate();
      }
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

        // Чистим десктопный бейдж, если пользователь уже на новой версии.
        if (getStoredUpdateBadge() > 0 && isMobileRuntime()) {
          clearStoredUpdateBadge();
        }
      } catch (e) {
        console.warn("[sw] register failed", e);
      }
    })();

    return () => {
      cancelled = true;
      if (updateInterval) {
        window.clearInterval(updateInterval);
      }
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
