"use client";

import { useLayoutEffect } from "react";
import { windowAppearsStandalonePwa } from "@/lib/pwaStandalone";

/** Режим установленного приложения: минимальные глобальные отличия без шума (см. globals.css). */
export function EnigmaStandaloneRootAttrs() {
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (windowAppearsStandalonePwa()) {
      root.dataset.enigmaStandalone = "1";
      return;
    }
    delete root.dataset.enigmaStandalone;
  }, []);

  return null;
}
