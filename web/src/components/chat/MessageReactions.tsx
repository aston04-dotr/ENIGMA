"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageReactionListItem } from "@/lib/types";

const PICKER_EMOJIS = ["👍", "❤️", "🔥", "😂"] as const;

function groupForDisplay(
  rows: MessageReactionListItem[],
  me: string | null,
): { emoji: string; count: number; iReacted: boolean }[] {
  const map = new Map<string, { count: number; iReacted: boolean }>();
  for (const r of rows) {
    const cur = map.get(r.emoji) ?? { count: 0, iReacted: false };
    cur.count += 1;
    if (me && r.user_id === me) cur.iReacted = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({
    emoji,
    count: v.count,
    iReacted: v.iReacted,
  }));
}

type MessageReactionsProps = {
  messageId: string;
  me: string | null;
  rows: MessageReactionListItem[];
  onToggle: (messageId: string, emoji: string) => void;
  alignEnd?: boolean;
};

function MessageReactionsInner({
  messageId,
  me,
  rows,
  onToggle,
  alignEnd,
}: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => groupForDisplay(rows, me), [rows, me]);

  const clearLongPress = useCallback(() => {
    if (typeof window === "undefined") return;
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    clearLongPress();
    if (typeof window === "undefined") return;
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      setPickerOpen(true);
    }, 500);
  }, [clearLongPress]);

  const onPointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [pickerOpen]);

  return (
    <div
      ref={containerRef}
      className={`group/reactions relative mt-1 flex min-h-[22px] w-full max-w-full flex-wrap items-center gap-1 ${
        alignEnd ? "justify-end" : "justify-start"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1">
        {grouped.map(({ emoji, count, iReacted }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(messageId, emoji)}
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] leading-none transition-colors duration-150 hover:bg-line/60 dark:hover:bg-white/10 ${
              iReacted
                ? "bg-violet-500/15 text-fg ring-1 ring-violet-500/35 dark:bg-violet-500/20"
                : "bg-muted/80 text-fg dark:bg-zinc-800/90"
            }`}
            aria-label={`${emoji} ${count}`}
          >
            <span className="select-none">{emoji}</span>
            {count > 1 ? (
              <span className="text-[10px] text-muted tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        className="relative flex shrink-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          aria-label="Добавить реакцию"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          className="rounded-full px-1.5 py-0.5 text-[11px] text-muted opacity-60 transition-opacity duration-150 hover:bg-line/50 hover:text-fg sm:opacity-0 sm:group-hover/reactions:opacity-100"
          onClick={() => setPickerOpen((o) => !o)}
        >
          ＋
        </button>

        <div
          className={`absolute bottom-full right-0 z-30 mb-1.5 flex gap-1 rounded-2xl border border-line/80 bg-elevated/95 px-2 py-1.5 shadow-md backdrop-blur-sm transition-all duration-200 dark:bg-zinc-900/95 ${
            pickerOpen
              ? "visible translate-y-0 opacity-100"
              : "pointer-events-none invisible -translate-y-1.5 opacity-0 sm:group-hover/reactions:visible sm:group-hover/reactions:translate-y-0 sm:group-hover/reactions:opacity-100 sm:group-hover/reactions:pointer-events-auto"
          }`}
        >
          {PICKER_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform duration-100 hover:scale-110 active:scale-95"
              onClick={() => {
                onToggle(messageId, e);
                setPickerOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const MessageReactions = memo(
  MessageReactionsInner,
  (a, b) =>
    a.messageId === b.messageId &&
    a.me === b.me &&
    a.rows === b.rows &&
    a.alignEnd === b.alignEnd &&
    a.onToggle === b.onToggle,
);
