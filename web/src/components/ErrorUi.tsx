"use client";

/** Единый текст для ошибок загрузки (сеть / Supabase). */
export const FETCH_ERROR_MESSAGE = "Ошибка загрузки. Проверь интернет.";

export const LISTINGS_FEED_ERROR_MESSAGE =
  "Не удалось загрузить объявления. Проверь интернет или попробуй позже.";

export function ErrorUi({ className, text }: { className?: string; text?: string }) {
  return (
    <p className={`text-sm font-medium text-danger ${className ?? ""}`.trim()}>{text ?? FETCH_ERROR_MESSAGE}</p>
  );
}
