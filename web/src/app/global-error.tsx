"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("GLOBAL ERROR BOUNDARY", error);

  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased bg-main text-fg">
        <div className="min-h-screen px-6 py-12">
          <h1 className="text-2xl font-bold tracking-tight text-fg">Что-то пошло не так</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">Попробуйте перезагрузить страницу.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-8 min-h-[52px] rounded-card bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Повторить
          </button>
        </div>
      </body>
    </html>
  );
}
