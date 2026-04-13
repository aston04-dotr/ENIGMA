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

  useEffect(() => {
    let t: UiTheme = "dark";
    try {
      const s = localStorage.getItem(STORAGE_KEY) as UiTheme | null;
      if (s === "light" || s === "dark") t = s;
    } catch {
      /* ignore */
    }
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
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
