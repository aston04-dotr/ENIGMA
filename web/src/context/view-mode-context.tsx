"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ViewMode = "mobile" | "tablet" | "desktop";

type ViewModeContextValue = {
  mode: ViewMode;
};

function detectModeByWidth(width: number): ViewMode {
  if (width < 640) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("mobile");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyMode = () => {
      setMode(detectModeByWidth(window.innerWidth));
    };

    applyMode();
    window.addEventListener("resize", applyMode);
    return () => {
      window.removeEventListener("resize", applyMode);
    };
  }, []);

  const value = useMemo<ViewModeContextValue>(() => ({ mode }), [mode]);

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) {
    throw new Error("useViewMode must be used within ViewModeProvider");
  }
  return ctx;
}
