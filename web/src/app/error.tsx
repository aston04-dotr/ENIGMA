"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("APP ERROR", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-main px-6 py-12 text-fg">
      <h1 className="text-2xl font-bold tracking-tight">Что-то пошло не так</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">Попробуйте перезагрузить страницу.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="pressable mt-8 min-h-[52px] rounded-card bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-ui hover:bg-accent-hover"
      >
        Повторить
      </button>
    </div>
  );
}
