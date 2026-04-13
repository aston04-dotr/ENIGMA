"use client";

/** После AUTH TIMEOUT без сессии - не оставляем пользователя без действия. */
export function LoginFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-main px-8">
      <p className="text-center text-lg font-semibold tracking-tight text-fg">
        Не удалось подключиться к серверу.
      </p>
      <p className="mt-3 max-w-[280px] text-center text-sm leading-relaxed text-muted">
        Проверь интернет или попробуй снова.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="pressable mt-10 min-h-[52px] rounded-card bg-accent px-8 py-3 text-sm font-semibold text-white transition-colors duration-ui hover:bg-accent-hover"
      >
        Повторить подключение
      </button>
    </div>
  );
}
