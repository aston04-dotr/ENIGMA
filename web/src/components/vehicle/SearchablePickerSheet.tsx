"use client";

import { useMemo, useRef, useEffect, useState, type ReactNode } from "react";

export type SearchablePickerOption = {
  id: string;
  label: string;
  /** Строка второго уровня (EN / slug) */
  description?: string;
  /** Нижний регистр, для фильтра включая aliases извне */
  searchHaystack: string;
  /** Компактный элемент слева (иконка, глиф бренда) */
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
      className="fixed inset-0 z-[100] flex items-end justify-center bg-main/[0.52] p-3 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="searchable-picker-title"
      onClick={onClose}
    >
      <div
        className="animate-enigma-sheet-panel flex max-h-[min(91vh,680px)] w-full max-w-md flex-col rounded-[26px] border border-line/[0.88] bg-gradient-to-b from-elevated via-elevated to-elev-2/[0.38] shadow-[0_22px_64px_-32px_rgba(0,0,0,.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line/70 bg-gradient-to-b from-elev-2/[0.12] via-transparent px-4 pb-3.5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="searchable-picker-title" className="text-[17.5px] font-semibold leading-tight tracking-[-0.01em] text-fg">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 max-w-[290px] text-[13px] leading-snug text-muted/[0.95]">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable shrink-0 rounded-full border border-line/85 bg-gradient-to-br from-elev-2/70 to-transparent px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted transition-[transform,color,background] duration-ui hover:bg-elev-2 hover:text-fg active:scale-[0.985]"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className="sticky top-0 z-10 border-b border-line/[0.72] bg-elevated/92 px-4 py-3 backdrop-blur-lg supports-[backdrop-filter]:bg-elevated/[0.82]">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full min-h-[52px] rounded-[16px] border border-line/[0.85] bg-gradient-to-br from-elev-2/45 to-transparent px-4 py-3 text-[15.5px] text-fg placeholder:text-muted/[0.5] outline-none ring-offset-elevated transition-[box-shadow,border-color,background] duration-200 focus:border-accent/40 focus:bg-elevated/92 focus:ring-2 focus:ring-accent/28"
            />
          </div>
          <div className="px-3 pb-5 pt-2">
          {loading ? (
            <div className="flex flex-col gap-2.5 px-1 py-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={`sk-${i}`}
                  className="h-[61px] animate-pulse rounded-[18px] border border-transparent bg-gradient-to-br from-elev-2/75 to-transparent"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-[14px] leading-relaxed text-muted">{emptyText}</p>
          ) : (
            <ul className="space-y-1.5 pb-2">
              {filtered.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(opt.id);
                      onClose();
                    }}
                    className="pressable group flex min-h-[60px] w-full gap-3.5 rounded-[18px] border border-transparent bg-gradient-to-r from-transparent to-transparent px-3.5 py-3 text-left outline-none ring-accent/35 transition-[transform,background,border-color,box-shadow] duration-200 hover:border-accent/[0.16] hover:from-accent/[0.065] hover:via-accent/[0.03] hover:to-transparent hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:scale-[0.987] focus-visible:ring-[3px]"
                  >
                    {opt.leading != null ? (
                      <span className="relative flex shrink-0 items-center after:pointer-events-none after:absolute after:inset-[-7px] after:rounded-2xl after:bg-gradient-to-b after:from-white/[0.05] after:to-transparent after:opacity-0 after:transition-opacity group-hover:after:opacity-100">
                        {opt.leading}
                      </span>
                    ) : null}
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                      <span className="text-[15.5px] font-semibold leading-snug tracking-[-0.014em] text-fg">{opt.label}</span>
                      {opt.description ? (
                        <span className="mt-px text-[12.35px] leading-snug text-muted/[0.9]">{opt.description}</span>
                      ) : null}
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
