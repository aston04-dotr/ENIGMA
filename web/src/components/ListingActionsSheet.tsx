"use client";

import { useEffect } from "react";

export type ListingSheetAction = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  title?: string;
  actions: ListingSheetAction[];
  onClose: () => void;
};

export function ListingActionsSheet({ open, title = "Действия", actions, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-actions-sheet-title"
        className="relative z-10 mx-auto w-full max-w-lg animate-listingSheetUp rounded-t-[16px] border border-line/80 bg-elevated/98 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_48px_rgba(0,0,0,0.35)]"
      >
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-muted/35" aria-hidden />
        <h2 id="listing-actions-sheet-title" className="px-2 pb-2 text-center text-[13px] font-semibold text-muted">
          {title}
        </h2>
        <div className="overflow-hidden rounded-xl border border-line/60 bg-elev-2/40">
          {actions.map((a, idx) => (
            <button
              key={a.id}
              type="button"
              disabled={a.disabled}
              onClick={() => {
                if (a.disabled) return;
                a.onSelect();
                onClose();
              }}
              className={`flex w-full min-h-[50px] items-center px-4 text-left text-[17px] font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                a.destructive
                  ? "text-[#FF3B30] hover:bg-[#FF3B30]/[0.08] active:bg-[#FF3B30]/[0.12]"
                  : "text-fg hover:bg-white/[0.06] active:bg-white/[0.1]"
              } ${idx > 0 ? "border-t border-line/50" : ""}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex w-full min-h-[50px] items-center justify-center rounded-xl border border-line/60 bg-elev-2/50 text-[17px] font-semibold text-accent transition-colors hover:bg-elev-2"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
