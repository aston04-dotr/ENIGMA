"use client";

import { useEffect } from "react";

const HYDRATION_RECOVERY_FLAG = "enigma:hydration-recovery-required";

/**
 * В production: ловим unhandledrejection / error, чтобы в консоли не оставались «тихие» сбои.
 */
export function GlobalErrorHandlers() {
  useEffect(() => {
    const markHydrationRecoveryNeeded = (value: unknown) => {
      const text = String(value ?? "");
      const isHydrationIssue =
        text.includes("Hydration") ||
        text.includes("did not match") ||
        text.includes("Minified React error #310");
      if (!isHydrationIssue) return;
      try {
        window.localStorage.setItem(HYDRATION_RECOVERY_FLAG, "1");
      } catch {
        // noop
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      console.error("UNHANDLED PROMISE", e.reason, e);
      markHydrationRecoveryNeeded(e.reason);
    };
    const onError = (e: ErrorEvent) => {
      console.error("GLOBAL ERROR", e.error ?? e.message, e);
      markHydrationRecoveryNeeded(e.error ?? e.message);
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
