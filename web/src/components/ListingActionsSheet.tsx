"use client";

import { useEffect } from "react";

export type ListingSheetAction = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Градиентная строка (например «Поделиться»). */
  variant?: "default" | "cta";
  onSelect: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  title?: string;
  actions: ListingSheetAction[];
  onClose: () => void;
};

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ActionGlyph({
  actionId,
  className,
  tone,
}: {
  actionId: string;
  className?: string;
  tone: "default" | "danger" | "onGradient";
}) {
  const stroke =
    tone === "danger" ? "#FF3B30" : tone === "onGradient" ? "#ffffff" : "rgba(255,255,255,0.9)";
  const cn = className ?? "h-[22px] w-[22px] shrink-0";

  switch (actionId) {
    case "share":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <circle cx="18" cy="5" r="2.25" stroke={stroke} strokeWidth={1.65} />
          <circle cx="6" cy="12" r="2.25" stroke={stroke} strokeWidth={1.65} />
          <circle cx="18" cy="19" r="2.25" stroke={stroke} strokeWidth={1.65} />
          <path
            stroke={stroke}
            strokeWidth={1.65}
            strokeLinecap="round"
            d="M7.9 11.1 14 7m4 5.9L14 17"
          />
        </svg>
      );
    case "report":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 19V6l5-2 5 2 5-2v13l-5 2-5-2-5 2Z"
          />
          <path stroke={stroke} strokeWidth={1.65} strokeLinecap="round" d="M10 9h4M10 13h4" />
        </svg>
      );
    case "hide":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8m3.9-4L21 12l-2 3m-7 7H8m12-10 4 4-12 12"
          />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 21h6l11.5-11.5a2 2 0 000-2.83l-2.67-2.67a2 2 0 00-2.83 0L5 15v6ZM13 6l5 5"
          />
        </svg>
      );
    case "archive":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 8h16M10 12h4M8 21h8a2 2 0 002-2V10M8 3v3m8-3v3"
          />
        </svg>
      );
    case "delete":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <circle cx="12" cy="12" r="8.25" stroke={stroke} strokeWidth={1.65} />
          <path stroke={stroke} strokeWidth={1.65} strokeLinecap="round" d="M12 10v5M12 8h.01" />
        </svg>
      );
  }
}

export function ListingActionsSheet({ open, title = "Действия", actions, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]" role="presentation">
      <button
        type="button"
        aria-label="Закрыть"
        className="animate-listingBackdropIn absolute inset-0 z-[121] bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-actions-sheet-title"
        className="animate-listingSheetUp pointer-events-auto absolute bottom-0 left-1/2 z-[122] w-full max-w-lg -translate-x-1/2 rounded-t-[22px] border border-white/[0.12] border-b-0 bg-[#09090b]"
        style={{
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1.5" aria-hidden>
          <span className="h-[4px] w-11 rounded-full bg-white/22" />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-0.5">
          <h2
            id="listing-actions-sheet-title"
            className="min-w-0 flex-1 text-left text-[18px] font-bold leading-none tracking-tight text-white"
            style={{ fontFeatureSettings: '"kern"' }}
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.09] active:bg-white/[0.14]"
          >
            <CloseIcon className="h-[22px] w-[22px]" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 pb-2" aria-label="Действия с объявлением">
          {actions.map((a) => {
            const isCta = a.variant === "cta";
            const danger = a.destructive === true;
            const glyphTone = isCta ? "onGradient" : danger ? "danger" : "default";

            return (
              <button
                key={a.id}
                type="button"
                disabled={a.disabled}
                onClick={async () => {
                  if (a.disabled) return;
                  try {
                    await Promise.resolve(a.onSelect());
                  } catch (err) {
                    console.warn("ListingActionsSheet action error:", err);
                  } finally {
                    onClose();
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-[filter,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                  isCta
                    ? "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-[0_8px_28px_rgba(123,79,232,0.42)] hover:brightness-[1.06] active:brightness-[0.96]"
                    : danger
                      ? "text-[#FF3B30] hover:bg-[#FF3B30]/[0.09] active:bg-[#FF3B30]/[0.14]"
                      : "text-white/[0.94] hover:bg-white/[0.06] active:bg-white/[0.1]"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    isCta ? "bg-white/18" : danger ? "bg-[#FF3B30]/12" : "bg-white/[0.07]"
                  }`}
                >
                  <ActionGlyph actionId={a.id} tone={glyphTone} />
                </span>
                <span className={`text-[17px] leading-snug ${isCta ? "font-semibold tracking-tight" : "font-medium"}`}>
                  {a.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
