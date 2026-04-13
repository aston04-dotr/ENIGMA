"use client";

import { useTheme } from "@/context/theme-context";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="pressable flex w-full min-h-[52px] items-center justify-between rounded-card border border-line bg-elevated px-4 py-3 text-left transition-colors duration-ui hover:bg-elev-2"
    >
      <span className="text-sm font-medium text-fg">Тема</span>
      <span className="text-sm text-muted">{theme === "dark" ? "Тёмная" : "Светлая"}</span>
    </button>
  );
}
