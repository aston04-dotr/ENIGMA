"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type ListingMenuAction = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  actions: ListingMenuAction[];
  onClose: () => void;
  theme: "light" | "dark";
};

const MENU_MIN_W = 212;
const ROW_H = 44;
const PAD = 8;

function MenuGlyph({
  actionId,
  destructive,
  theme,
}: {
  actionId: string;
  destructive?: boolean;
  theme: "light" | "dark";
}) {
  const stroke =
    destructive === true
      ? "#FF3B30"
      : theme === "light"
        ? "#0f172a"
        : "#ffffff";
  const cn = "h-[18px] w-[18px] shrink-0";

  switch (actionId) {
    case "share":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <circle cx="18" cy="5" r="2" stroke={stroke} strokeWidth={1.55} />
          <circle cx="6" cy="12" r="2" stroke={stroke} strokeWidth={1.55} />
          <circle cx="18" cy="19" r="2" stroke={stroke} strokeWidth={1.55} />
          <path
            stroke={stroke}
            strokeWidth={1.55}
            strokeLinecap="round"
            d="M8 11 14 7m4 6-6 4"
          />
        </svg>
      );
    case "report":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 19V6l5-2 5 2 5-2v13l-5 2-5-2-5 2Z"
          />
          <path stroke={stroke} strokeWidth={1.55} strokeLinecap="round" d="M10 9h4M10 13h4" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 21h6l11.5-11.5a2 2 0 000-2.83l-2.67-2.67a2 2 0 00-2.83 0L5 15v6ZM13 6l5 5"
          />
        </svg>
      );
    case "delete":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <path
            stroke={stroke}
            strokeWidth={1.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
          <circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth={1.55} />
        </svg>
      );
  }
}

export function ListingActionsMenu({
  open,
  anchorRef,
  actions,
  onClose,
  theme,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const r = anchor.getBoundingClientRect();
    let left = r.right - MENU_MIN_W;
    left = Math.max(PAD, Math.min(left, window.innerWidth - MENU_MIN_W - PAD));

    const estH = actions.length * ROW_H + PAD * 2;
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - PAD) {
      top = Math.max(PAD, r.top - estH - 6);
    }
    setCoords({ top, left });
  }, [open, anchorRef, actions.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | PointerEvent) => {
      const node = e.target as Node;
      if (anchorRef.current?.contains(node)) return;
      if (menuRef.current?.contains(node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const shell =
    theme === "light"
      ? "border border-neutral-200 bg-white text-neutral-900 shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
      : "border border-white/12 bg-black text-white shadow-[0_16px_48px_rgba(0,0,0,0.55)]";

  const portal = (
    <>
      <div className="fixed inset-0 z-[118]" aria-hidden style={{ pointerEvents: "none" }} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Действия с объявлением"
        className={`fixed z-[120] min-w-[212px] overflow-hidden rounded-xl py-1 ${shell}`}
        style={{ top: coords.top, left: coords.left }}
      >
        {actions.map((a) => {
          const danger = a.destructive === true;
          const rowTone =
            theme === "light"
              ? danger
                ? "text-[#FF3B30] hover:bg-red-500/[0.08]"
                : "text-neutral-900 hover:bg-neutral-100"
              : danger
                ? "text-[#FF3B30] hover:bg-white/[0.06]"
                : "text-white hover:bg-white/[0.08]";

          return (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={async () => {
                if (a.disabled) return;
                try {
                  await Promise.resolve(a.onSelect());
                } catch (err) {
                  console.warn("ListingActionsMenu action error:", err);
                } finally {
                  onClose();
                }
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${rowTone}`}
            >
              <MenuGlyph actionId={a.id} destructive={danger} theme={theme} />
              <span className="min-w-0 flex-1 leading-snug">{a.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  return createPortal(portal, document.body);
}
