"use client";

import { useViewMode, type ViewMode } from "@/context/view-mode-context";

type ModeOption = {
  mode: ViewMode;
  icon: string;
  label: string;
};

const OPTIONS: readonly ModeOption[] = [
  { mode: "mobile", icon: "📱", label: "Mobile" },
  { mode: "tablet", icon: "📟", label: "Tablet" },
  { mode: "desktop", icon: "💻", label: "Desktop" },
] as const;

export function ViewModeSwitcher() {
  const { mode, isUserSelected, setUserMode, setAutoMode } = useViewMode();

  return (
    <div className="view-mode-switcher-wrap pointer-events-none fixed bottom-[calc(140px+env(safe-area-inset-bottom))] left-1/2 z-[70] w-full -translate-x-1/2 px-3">
      <div
        className="pointer-events-auto ml-auto flex w-fit items-center gap-1 rounded-full border border-line bg-elevated/90 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
        role="group"
        aria-label="Переключатель режима отображения"
      >
        {OPTIONS.map((option) => {
          const active = option.mode === mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => setUserMode(option.mode)}
              className={`pressable flex h-9 w-9 items-center justify-center rounded-full text-base transition-colors duration-ui ${
                active ? "bg-accent text-white" : "text-fg hover:bg-elev-2"
              }`}
              aria-label={`Режим ${option.label}`}
              aria-pressed={active}
              title={option.label}
            >
              <span aria-hidden>{option.icon}</span>
            </button>
          );
        })}

        {isUserSelected ? (
          <button
            type="button"
            onClick={setAutoMode}
            className="pressable ml-1 rounded-full border border-line px-2 py-1 text-[11px] font-medium text-muted transition-colors duration-ui hover:text-fg"
            aria-label="Вернуться к автоматическому режиму"
            title="Auto"
          >
            Auto
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ViewModeSwitcher;
