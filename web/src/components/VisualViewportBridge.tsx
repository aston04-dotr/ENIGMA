"use client";

import { useEffect } from "react";

/**
 * iOS Safari / PWA: дистанция от нижнего края layout viewport до нижнего края visual viewport
 * (= перекрытие клавиатурой и т.п.) в CSS-пикселях → --enigma-vv-inset-bottom
 */
export function VisualViewportBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;

    const apply = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop),
      );
      root.style.setProperty("--enigma-vv-inset-bottom", `${inset}px`);
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);

    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--enigma-vv-inset-bottom");
    };
  }, []);

  return null;
}
