"use client";

import { useMemo, useRef, useEffect, useState, type ReactNode } from "react";

export type SearchablePickerOption = {
  id: string;
  /** Одна строка в списке (RU или флаг уже в leading для стран). */
  label: string;
  /** Нижний регистр: RU/EN + aliases — только для поиска, не показывается. */
  searchHaystack: string;
  /** Слева: флаг страны или иконка. */
  leading?: ReactNode;
};

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  options: SearchablePickerOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  loading?: boolean;
  emptyText?: string;
};

/**
 * Bottom sheet (mobile-first) + поиск сверху. Одна строка на пункт — минимализм.
 */
export function SearchablePickerSheet({
  open,
  title,
  subtitle,
  searchPlaceholder = "Поиск…",
  options,
  onSelect,
  onClose,
  loading = false,
  emptyText = "Ничего не найдено",
}: Props) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 230);
    return () => window.clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchHaystack.includes(q));
  }, [options, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 backdrop-blur-md sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="searchable-picker-title"
      onClick={onClose}
    >
      <div
        className="animate-enigma-sheet-panel flex max-h-[min(88vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-[22px] border border-line/80 bg-elevated shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line/60 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2
                id="searchable-picker-title"
                className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-fg"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-[13px] leading-snug text-muted/80">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable shrink-0 rounded-full px-3 py-2 text-[15px] font-medium text-accent"
            >
              Готово
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className="sticky top-0 z-10 border-b border-line/50 bg-elevated/95 px-5 py-3 backdrop-blur-md">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full min-h-[48px] rounded-[12px] border border-line/70 bg-main/35 px-3.5 text-[17px] leading-snug text-fg placeholder:text-muted/45 outline-none transition-colors focus:border-accent/35 focus:bg-elevated"
            />
          </div>
          <div className="px-3 py-3 pb-6">
            {loading ? (
              <div className="flex flex-col gap-2 px-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={`sk-${i}`}
                    className="h-[52px] animate-pulse rounded-[12px] bg-elev-2/50"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-12 text-center text-[15px] text-muted">{emptyText}</p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((opt) => (
                  <li key={opt.id} className="px-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(opt.id);
                        onClose();
                      }}
                      className="pressable flex min-h-[52px] w-full items-center gap-3.5 rounded-[12px] px-3 text-left transition-colors active:bg-accent/10 active:scale-[0.992] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    >
                      {opt.leading != null ? (
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center text-[26px] leading-none">
                          {opt.leading}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 break-words text-[17px] font-normal leading-snug tracking-[-0.024em] text-fg">
                        {opt.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
