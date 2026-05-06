"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { trackEvent } from "@/lib/analytics";
import { usePathname, useRouter } from "next/navigation";

const DISMISS_KEY = "enigma:pwa:install-dismissed-at";
const INSTALLED_KEY = "enigma:pwa:installed-at";
const LAST_ROUTE_KEY = "enigma:pwa:last-route";
const RESUME_ROUTE_KEY = "enigma:pwa:resume-route";
const RESUME_ROUTE_AT_KEY = "enigma:pwa:resume-route-at";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const RESUME_ROUTE_TTL_MS = 30 * 60 * 1000;
const PROMPT_DELAY_MS = 900;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return ios && safari;
}

function isAndroidMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading, authResolved, profileLoading } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [canShowNow, setCanShowNow] = useState(false);
  const [installed, setInstalled] = useState(false);
  const ios = useMemo(() => isIosSafari(), []);
  const android = useMemo(() => isAndroidMobile(), []);
  const iosHintTrackedRef = useRef(false);
  const promptShownTrackedRef = useRef(false);
  const installAcceptedTrackedRef = useRef(false);

  const authReady =
    authResolved &&
    !loading &&
    !profileLoading &&
    Boolean(session?.user?.id);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ios && !android) return;
    if (isStandaloneMode()) {
      setInstalled(true);
      try {
        localStorage.setItem(INSTALLED_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      return;
    }
    try {
      const installedAt = Number(localStorage.getItem(INSTALLED_KEY) ?? "0");
      if (Number.isFinite(installedAt) && installedAt > 0) {
        setInstalled(true);
        return;
      }
    } catch {
      // ignore
    }

    const onBip = (e: Event) => {
      if (isStandaloneMode()) return;
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      if (!installAcceptedTrackedRef.current) {
        trackEvent("pwa_install_accepted", { platform: "android", surface: "appinstalled_event" });
        installAcceptedTrackedRef.current = true;
      }
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      try {
        localStorage.setItem(INSTALLED_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [android, ios]);

  useEffect(() => {
    if (!authReady || typeof window === "undefined") return;
    const fullPath = window.location.pathname + window.location.search + window.location.hash;
    if (!fullPath || !fullPath.startsWith("/")) return;
    try {
      localStorage.setItem(LAST_ROUTE_KEY, fullPath);
    } catch {
      // ignore
    }
  }, [authReady, pathname]);

  useEffect(() => {
    if (!authReady || installed || typeof window === "undefined") {
      setCanShowNow(false);
      setVisible(false);
      return;
    }
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
      if (Number.isFinite(dismissedAt) && dismissedAt > 0) {
        const cooldownActive = Date.now() - dismissedAt < DISMISS_TTL_MS;
        if (cooldownActive) {
          setCanShowNow(false);
          setVisible(false);
          return;
        }
      }
    } catch {
      // ignore
    }
    const timer = window.setTimeout(() => {
      setCanShowNow(true);
    }, PROMPT_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [authReady, installed]);

  useEffect(() => {
    if (!canShowNow || installed) {
      setVisible(false);
      return;
    }
    if (ios) {
      setVisible(true);
      return;
    }
    if (android && deferred) {
      setVisible(true);
      return;
    }
    setVisible(false);
  }, [android, canShowNow, deferred, installed, ios]);

  useEffect(() => {
    if (!visible) {
      promptShownTrackedRef.current = false;
      return;
    }
    if (ios && !iosHintTrackedRef.current) {
      trackEvent("pwa_ios_hint_shown", { platform: "ios-safari" });
      iosHintTrackedRef.current = true;
      return;
    }
    if (android && deferred && !promptShownTrackedRef.current) {
      trackEvent("pwa_prompt_shown", { platform: "android", surface: "install_sheet" });
      promptShownTrackedRef.current = true;
    }
  }, [android, deferred, ios, visible]);

  useEffect(() => {
    if (!authReady || !isStandaloneMode() || typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    try {
      const resumePath = String(localStorage.getItem(RESUME_ROUTE_KEY) ?? "").trim();
      const resumeAt = Number(localStorage.getItem(RESUME_ROUTE_AT_KEY) ?? "0");
      if (!resumePath.startsWith("/")) return;
      if (!Number.isFinite(resumeAt) || Date.now() - resumeAt > RESUME_ROUTE_TTL_MS) return;
      localStorage.removeItem(RESUME_ROUTE_KEY);
      localStorage.removeItem(RESUME_ROUTE_AT_KEY);
      if (resumePath !== "/") {
        router.replace(resumePath);
      }
    } catch {
      // ignore
    }
  }, [authReady, router]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (ios) {
      trackEvent("pwa_install_dismissed", { platform: "ios-safari", surface: "ios_hint" });
    } else if (android && deferred) {
      trackEvent("pwa_install_dismissed", { platform: "android", surface: "install_sheet" });
    }
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, [android, deferred, ios]);

  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      const fullPath = window.location.pathname + window.location.search + window.location.hash;
      localStorage.setItem(RESUME_ROUTE_KEY, fullPath);
      localStorage.setItem(RESUME_ROUTE_AT_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setVisible(false);
    setDeferred(null);
    if (choice.outcome === "accepted") {
      if (!installAcceptedTrackedRef.current) {
        trackEvent("pwa_install_accepted", { platform: "android", surface: "install_sheet" });
        installAcceptedTrackedRef.current = true;
      }
      setInstalled(true);
      try {
        localStorage.setItem(INSTALLED_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      return;
    }
    trackEvent("pwa_install_dismissed", { platform: "android", surface: "native_prompt" });
    dismiss();
  }, [deferred, dismiss]);

  if (!visible || installed || (!ios && !android)) return null;

  if (ios) {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label="Установка приложения на iPhone"
      >
        <div className="w-full max-w-sm rounded-[28px] border border-white/15 bg-[linear-gradient(135deg,rgba(18,24,33,0.92),rgba(10,12,16,0.92))] p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <p className="text-[19px] font-semibold tracking-tight">
            Добавь Enigma на экран iPhone
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Нажми{" "}
            <span className="inline-flex rounded-md bg-white/10 px-1.5 py-0.5 text-white">
              Поделиться
            </span>{" "}
            в Safari и выбери{" "}
            <span className="inline-flex rounded-md bg-white/10 px-1.5 py-0.5 text-white">
              На экран Домой
            </span>
            .
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-white/70">
            Это сохранит Enigma как приложение и поможет быстрее возвращаться после регистрации/логина.
          </div>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="pressable min-h-[46px] flex-1 rounded-xl border border-white/20 bg-white/5 px-3 text-sm font-medium text-white/85"
            >
              Позже
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="pressable min-h-[46px] flex-1 rounded-xl bg-white text-sm font-semibold text-[#111]"
            >
              Понял
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-[80] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Установка приложения Enigma"
    >
      <div className="mx-auto w-full max-w-md rounded-[24px] border border-line bg-elevated/95 p-4 shadow-soft backdrop-blur-md">
        <p className="text-base font-semibold text-fg">Добавить Enigma на экран?</p>
        <p className="mt-1.5 text-sm text-muted">
          Откроется как приложение и будет всегда под рукой.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="pressable min-h-[46px] flex-1 rounded-xl border border-line bg-elev-2 text-sm font-medium text-fg"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={() => void install()}
            className="pressable min-h-[46px] flex-1 rounded-xl bg-accent text-sm font-semibold text-white"
          >
            Установить
          </button>
        </div>
      </div>
    </div>
  );
}
