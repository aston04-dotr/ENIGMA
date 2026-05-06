"use client";

import { useAuth } from "@/context/auth-context";
import {
  dismissSaveEnigmaPrompt,
  markSaveEnigmaPromptShown,
  registerActiveUsageTick,
  registerVisitForSaveFlow,
  rememberSaveEnigmaContinuationRoute,
  shouldShowSaveEnigmaPrompt,
} from "@/lib/saveEnigmaFlow";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function isPromptAllowedPath(pathname: string): boolean {
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/auth/")) return false;
  if (pathname.startsWith("/payment")) return false;
  return true;
}

export function SaveEnigmaPrompt() {
  const { session, loading, authResolved } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const enabled = useMemo(() => {
    if (loading || !authResolved) return false;
    if (session?.user) return false;
    return isPromptAllowedPath(pathname);
  }, [authResolved, loading, pathname, session?.user]);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    registerVisitForSaveFlow();
    if (shouldShowSaveEnigmaPrompt()) {
      setVisible(true);
      markSaveEnigmaPromptShown();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      registerActiveUsageTick();
      if (!visible && shouldShowSaveEnigmaPrompt()) {
        setVisible(true);
        markSaveEnigmaPromptShown();
      }
    }, 90_000);
    return () => window.clearInterval(interval);
  }, [enabled, visible]);

  if (!visible || !enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[70] px-4">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-line bg-elevated/95 p-4 shadow-soft backdrop-blur-md">
        <p className="text-sm font-semibold text-fg">Сохранить мой Enigma</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Закрепите ваши чаты, непрочитанные, избранное и активность, чтобы всё осталось с вами.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              dismissSaveEnigmaPrompt();
              setVisible(false);
            }}
            className="pressable min-h-[42px] flex-1 rounded-xl border border-line bg-elev-2 px-3 text-sm font-medium text-fg"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={() => {
              rememberSaveEnigmaContinuationRoute();
              dismissSaveEnigmaPrompt(12 * 60 * 60 * 1000);
              setVisible(false);
              router.push("/login?reason=save_enigma&source=delayed_prompt");
            }}
            className="pressable min-h-[42px] flex-1 rounded-xl bg-accent px-3 text-sm font-semibold text-white"
          >
            Сохранить мой Enigma
          </button>
        </div>
      </div>
    </div>
  );
}
