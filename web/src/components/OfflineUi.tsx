"use client";

/** Полноэкранный офлайн. */
export function OfflineUi() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-main px-8">
      <p className="text-center text-lg font-semibold text-fg">Нет интернета. Проверь подключение.</p>
    </div>
  );
}
