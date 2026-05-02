"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "enigma-ui-theme";

export type UiTheme = "dark" | "light";

type Ctx = {
  theme: UiTheme;
  mounted: boolean;
  setTheme: (t: UiTheme) => void;
  toggleTheme: () => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>("dark");
  const [mounted, setMounted] = useState(false);
  const [followSystem, setFollowSystem] = useState(false);

  useEffect(() => {
    let t: UiTheme = "dark";
    let hasStoredTheme = false;
    try {
      const s = localStorage.getItem(STORAGE_KEY) as UiTheme | null;
      if (s === "light" || s === "dark") {
        t = s;
        hasStoredTheme = true;
      }
    } catch {
      /* ignore */
    }
    if (!hasStoredTheme && typeof window !== "undefined") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      setFollowSystem(true);
    }
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !followSystem || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      const next: UiTheme = e.matches ? "dark" : "light";
      setThemeState(next);
      document.documentElement.dataset.theme = next;
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [mounted, followSystem]);

  const setTheme = useCallback((next: UiTheme) => {
    setFollowSystem(false);
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setFollowSystem(false);
    setThemeState((prev) => {
      const next: UiTheme = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, mounted, setTheme, toggleTheme }),
    [theme, mounted, setTheme, toggleTheme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
