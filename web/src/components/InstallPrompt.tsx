"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "enigma_install_prompt_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIos = /iPad|iPhone|iPod/.test(ua);
    setIos(isIos);
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true);
    if (standalone) return;
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(STORAGE_KEY)
    )
      return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    if (isIos) setVisible(true);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
    dismiss();
  }, [deferred, dismiss]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] left-1/2 z-[60] w-full -translate-x-1/2 view-mode-nav rounded-card border border-line bg-elevated p-4 shadow-soft safe-pb"
      role="dialog"
      aria-label="Установка веб-приложения"
    >
      <p className="text-sm font-semibold leading-snug text-fg">
        Веб-версия Enigma — можно открывать в браузере или добавить на экран,
        как приложение.
      </p>
      {ios ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Safari: Поделиться → «На экран «Домой»»
        </p>
      ) : deferred ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Chrome / Edge: кнопка «Установить» — ярлык на рабочий стол или в меню
          «Пуск».
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {deferred ? (
          <button
            type="button"
            onClick={() => void install()}
            className="pressable min-h-[48px] flex-1 rounded-card bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors duration-ui hover:bg-accent-hover"
          >
            Установить
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="pressable min-h-[48px] flex-1 rounded-card border border-line bg-elev-2 px-4 py-3 text-sm font-medium text-fg"
        >
          Остаться в браузере
        </button>
      </div>
    </div>
  );
}
