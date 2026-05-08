"use client";

import { useEffect } from "react";

const HYDRATION_RECOVERY_FLAG = "enigma:hydration-recovery-required";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

function extractStack(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }
  if (
    value &&
    typeof value === "object" &&
    "stack" in value &&
    typeof (value as { stack?: unknown }).stack === "string"
  ) {
    return (value as { stack: string }).stack;
  }
  return String(value ?? "");
}

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
      console.error(
        "UNHANDLED PROMISE",
        {
          reason: e.reason,
          reasonJson: safeStringify(e.reason),
          stack: extractStack(e.reason),
        },
        e,
      );
      markHydrationRecoveryNeeded(e.reason);
    };
    const onError = (e: ErrorEvent) => {
      const err = e.error ?? e.message;
      console.error(
        "GLOBAL ERROR",
        {
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          reasonJson: safeStringify(err),
          stack: extractStack(err),
        },
        e,
      );
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
