"use client";

/** Слишком много ручных попыток переподключения. */
export function AuthHardError({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-main px-8">
      <p className="text-center text-lg font-semibold text-fg">Не удалось восстановить подключение</p>
      <p className="mt-3 max-w-[280px] text-center text-sm text-muted">
        Слишком много попыток. Обновите страницу позже.
      </p>
      <button
        type="button"
        onClick={onReload}
        className="pressable mt-10 min-h-[52px] rounded-card bg-accent px-8 py-3 text-sm font-semibold text-white transition-colors duration-ui hover:bg-accent-hover"
      >
        Обновить страницу
      </button>
    </div>
  );
}
