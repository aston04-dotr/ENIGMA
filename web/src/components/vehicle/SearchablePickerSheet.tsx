"use client";

import { useMemo, useRef, useEffect, useState } from "react";

export type SearchablePickerOption = {
  id: string;
  label: string;
  /** Строка второго уровня (EN / slug) */
  description?: string;
  /** Нижний регистр, для фильтра включая aliases извне */
  searchHaystack: string;
};

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  options: SearchablePickerOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Пока грузим список */
  loading?: boolean;
  emptyText?: string;
};

/**
 * Bottom sheet (mobile-first) + поиск сверху sticky. Стиль как у листов города/фильтров.
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
  emptyText = "Ничего не найдено — попробуйте другой запрос",
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
      className="fixed inset-0 z-[100] flex items-end justify-center bg-main/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="searchable-picker-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,640px)] w-full max-w-md flex-col rounded-card border border-line bg-elevated shadow-soft animate-enigma-sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line/80 px-4 pb-3 pt-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="searchable-picker-title" className="text-[17px] font-semibold leading-tight text-fg">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-[12.5px] leading-snug text-muted/90">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable shrink-0 rounded-full border border-line/80 bg-elev-2/50 px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-elev-2 hover:text-fg"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className="sticky top-0 z-10 border-b border-line/70 bg-elevated/96 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-elevated/88">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full min-h-[48px] rounded-card border border-line bg-elev-2/35 px-3.5 text-[15px] text-fg placeholder:text-muted/55 outline-none ring-offset-elevated transition-[box-shadow,border-color] duration-150 focus:border-accent/35 focus:ring-2 focus:ring-accent/28"
            />
          </div>
          <div className="px-2 pb-4 pt-1">
          {loading ? (
            <div className="flex flex-col gap-2 px-2 py-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={`sk-${i}`}
                  className="h-[52px] animate-pulse rounded-card bg-elev-2/60"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-[14px] leading-relaxed text-muted">{emptyText}</p>
          ) : (
            <ul className="pb-2">
              {filtered.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(opt.id);
                      onClose();
                    }}
                    className="pressable mb-1 flex min-h-[54px] w-full flex-col justify-center rounded-card px-3 py-2.5 text-left transition-colors duration-150 hover:bg-accent/8 active:scale-[0.99]"
                  >
                    <span className="text-[15px] font-semibold leading-snug tracking-tight text-fg">
                      {opt.label}
                    </span>
                    {opt.description ? (
                      <span className="mt-0.5 text-[12px] leading-snug text-muted/85">
                        {opt.description}
                      </span>
                    ) : null}
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
