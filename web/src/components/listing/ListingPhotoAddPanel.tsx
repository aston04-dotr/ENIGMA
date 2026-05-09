"use client";

import { preferListingPhotoChooserSheet } from "@/lib/listingPhotoClient";
import type { DragEventHandler } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Фильтр перед тем как родитель обрежет лимит слотов */
function filterImageFiles(incoming: File[], cap: number): File[] {
  if (cap <= 0) return [];
  const images = incoming.filter((f) =>
    String(f?.type ?? "").toLowerCase().startsWith("image/"),
  );
  return images.slice(0, cap);
}

export function listingPhotoDesktopDropHandlers(
  remainingSlots: number,
  disabled: boolean,
  prefersTouchChooser: boolean,
  onAddFiles: (files: File[]) => void,
): {
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
} {
  if (prefersTouchChooser || disabled || remainingSlots <= 0) {
    return {};
  }

  return {
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave: (e) => {
      e.preventDefault();
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const list = e.dataTransfer?.files;
      if (!list || list.length === 0) return;
      const next = filterImageFiles(Array.from(list), remainingSlots);
      if (next.length > 0) onAddFiles(next);
    },
  };
}

type ListingPhotoAddPanelProps = {
  disabled?: boolean;
  remainingSlots: number;
  currentCount: number;
  maxPhotos: number;
  onAddFiles: (files: File[]) => void;
  dropZoneClassName?: string;
  addButtonClassName?: string;
};

/**
 * Галерея: multiple без capture.
 * Камера: только environment, без multiple (совместимо с Safari PWA / Android).
 * Desktop: один клик — обычный picker; без capture на основном инпуте.
 */
export function ListingPhotoAddPanel({
  disabled = false,
  remainingSlots,
  currentCount,
  maxPhotos,
  onAddFiles,
  dropZoneClassName = "",
  addButtonClassName = "",
}: ListingPhotoAddPanelProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preferSheet, setPreferSheet] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setPreferSheet(preferListingPhotoChooserSheet());
  }, []);

  const mergeIntoParent = useCallback(
    (raw: FileList | null) => {
      if (!raw || raw.length === 0 || disabled || remainingSlots <= 0) return;
      const next = filterImageFiles(Array.from(raw), remainingSlots);
      if (next.length > 0) onAddFiles(next);
    },
    [disabled, onAddFiles, remainingSlots],
  );

  const clearAndOpenGallery = () => {
    const el = galleryRef.current;
    if (el) el.value = "";
    queueMicrotask(() => el?.click());
  };

  const clearAndOpenCamera = () => {
    const el = cameraRef.current;
    if (el) el.value = "";
    queueMicrotask(() => el?.click());
  };

  const handlePrimaryAdd = () => {
    if (disabled || remainingSlots <= 0) return;
    if (preferSheet) {
      setSheetOpen(true);
      return;
    }
    clearAndOpenGallery();
  };

  const dnd = listingPhotoDesktopDropHandlers(
    remainingSlots,
    Boolean(disabled),
    preferSheet,
    onAddFiles,
  );

  const desktopDropOutline =
    Boolean(!preferSheet && !disabled && remainingSlots > 0 && dnd.onDrop);

  const primaryDisabled =
    Boolean(disabled) || remainingSlots <= 0 || currentCount >= maxPhotos;

  return (
    <>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={(e) => {
          mergeIntoParent(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={(e) => {
          mergeIntoParent(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        {...dnd}
        className={`mt-2 flex flex-wrap items-center gap-3 ${
          desktopDropOutline ? `rounded-xl border border-dashed border-line/65 bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.03] ${dropZoneClassName}` : ""
        }`}
      >
        <button
          type="button"
          onClick={handlePrimaryAdd}
          disabled={primaryDisabled}
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-elevated text-2xl font-light text-fg transition-all duration-200 hover:bg-elev-2 disabled:cursor-not-allowed disabled:opacity-50 ${addButtonClassName}`}
          aria-label="Добавить фото"
        >
          +
        </button>
        <div className="min-w-0 flex-1 text-xs text-muted">
          <span className="font-medium text-fg/90">{currentCount}</span>
          <span>/{maxPhotos} фото</span>
          {desktopDropOutline ? (
            <span className="mt-1 block text-[11px] text-muted/90">
              На компьютере можно перетащить файлы сюда
            </span>
          ) : preferSheet ? (
            <span className="mt-1 block text-[11px] text-muted/90">
              Камера или галерея
            </span>
          ) : null}
        </div>
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="listing-photo-sheet-title"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[20px] border border-line bg-elevated p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-soft"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2
              id="listing-photo-sheet-title"
              className="text-center text-[15px] font-semibold text-fg"
            >
              Добавить фото
            </h2>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={remainingSlots <= 0}
                onClick={() => {
                  setSheetOpen(false);
                  clearAndOpenCamera();
                }}
                className="flex min-h-[50px] w-full items-center justify-center rounded-card border border-line bg-accent/10 px-4 text-[15px] font-semibold text-accent transition-colors active:scale-[0.99] disabled:opacity-45"
              >
                Сделать фото
              </button>
              <button
                type="button"
                disabled={remainingSlots <= 0}
                onClick={() => {
                  setSheetOpen(false);
                  clearAndOpenGallery();
                }}
                className="flex min-h-[50px] w-full items-center justify-center rounded-card border border-line bg-elev-2 px-4 text-[15px] font-semibold text-fg transition-colors active:scale-[0.99] disabled:opacity-45"
              >
                Выбрать из галереи
              </button>
              <button
                type="button"
                className="mt-2 min-h-[46px] w-full rounded-card py-3 text-[14px] font-medium text-muted"
                onClick={() => setSheetOpen(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
