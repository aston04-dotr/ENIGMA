"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { windowAppearsStandalonePwa } from "@/lib/pwaStandalone";

/** Один раз при первом обнаружении standalone — без повтора install onboarding. */
const TOAST_ONCE_KEY = "enigma:pwa:standalone-installed-toast-v1";

/** Мини-тост после первого входа как установленного PWA. */
export function StandaloneInstalledToast() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!windowAppearsStandalonePwa()) return;
    try {
      if (window.localStorage.getItem(TOAST_ONCE_KEY) === "1") return;
      window.localStorage.setItem(TOAST_ONCE_KEY, "1");
    } catch {
      return;
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const tOut = window.setTimeout(() => setExiting(true), 2300);
    const tHide = window.setTimeout(() => setVisible(false), 2680);
    return () => {
      window.clearTimeout(tOut);
      window.clearTimeout(tHide);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none fixed bottom-[max(1rem,calc(72px+env(safe-area-inset-bottom)))] left-1/2 z-[120] max-w-[min(92vw,320px)] -translate-x-1/2 transition-opacity duration-[380ms] ease-out ${exiting ? "opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-line bg-elevated/95 px-5 py-3 text-center shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md supports-[backdrop-filter]:bg-elevated/88">
        <p className="text-[14px] font-semibold tracking-tight text-fg">Enigma установлена</p>
      </div>
    </div>
  );
}
