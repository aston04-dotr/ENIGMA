"use client";

import { useEffect } from "react";

/**
 * В production: ловим unhandledrejection / error, чтобы в консоли не оставались «тихие» сбои.
 */
export function GlobalErrorHandlers() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error("UNHANDLED PROMISE", e.reason, e);
    };
    const onError = (e: ErrorEvent) => {
      console.error("GLOBAL ERROR", e.error ?? e.message, e);
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
