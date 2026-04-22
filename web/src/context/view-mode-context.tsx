"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ViewMode = "mobile" | "tablet" | "desktop";
type ViewModePreference = ViewMode | "auto";

type ViewModeContextValue = {
  mode: ViewMode;
  preference: ViewModePreference;
  setAutoMode: () => void;
  setUserMode: (mode: ViewMode) => void;
  isUserSelected: boolean;
};

const STORAGE_KEY = "enigma:view-mode";

function detectModeByWidth(width: number): ViewMode {
  if (width < 640) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("mobile");
  const [preference, setPreference] = useState<ViewModePreference>("auto");
  const isUserSelected = preference !== "auto";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initialMode = detectModeByWidth(window.innerWidth);

    if (stored === "mobile" || stored === "tablet" || stored === "desktop") {
      setPreference(stored);
      setMode(stored);
      return;
    }

    setPreference("auto");
    setMode(initialMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onResize = () => {
      if (preference !== "auto") return;
      setMode(detectModeByWidth(window.innerWidth));
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [preference]);

  const setAutoMode = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      setMode(detectModeByWidth(window.innerWidth));
    }
    setPreference("auto");
  }, []);

  const setUserMode = useCallback((nextMode: ViewMode) => {
    setPreference(nextMode);
    setMode(nextMode);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    }
  }, []);

  const value = useMemo<ViewModeContextValue>(
    () => ({
      mode,
      preference,
      setAutoMode,
      setUserMode,
      isUserSelected,
    }),
    [isUserSelected, mode, preference, setAutoMode, setUserMode],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) {
    throw new Error("useViewMode must be used within ViewModeProvider");
  }
  return ctx;
}
