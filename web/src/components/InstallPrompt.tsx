"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { trackEvent } from "@/lib/analytics";
import { windowAppearsStandalonePwa } from "@/lib/pwaStandalone";
import { usePathname, useRouter } from "next/navigation";

const DISMISS_KEY = "enigma:pwa:install-dismissed-at";
const INSTALLED_KEY = "enigma:pwa:installed-at";
const IOS_GUIDE_DONE_KEY = "enigma:pwa:ios-install-guide-done-v1";
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

function readIosGuideDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(IOS_GUIDE_DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function persistIosGuideDone(): void {
  try {
    localStorage.setItem(IOS_GUIDE_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function persistInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function readStoredInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const installedAt = Number(localStorage.getItem(INSTALLED_KEY) ?? "0");
    return Number.isFinite(installedAt) && installedAt > 0;
  } catch {
    return false;
  }
}

function isInstallSuppressed(): boolean {
  return windowAppearsStandalonePwa() || readStoredInstalled();
}

/** PWA установка: Android — beforeinstallprompt + sheet; iOS Safari — один раз overlay с подсказкой Share → «На экран «Домой»». */
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

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (windowAppearsStandalonePwa()) {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      persistInstalled();
      return;
    }
    if (readStoredInstalled()) {
      setInstalled(true);
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStandaloneOrStorage = () => {
      if (!isInstallSuppressed()) return;
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      if (windowAppearsStandalonePwa()) persistInstalled();
    };

    let mqStandalone: MediaQueryList | null = null;
    let mqFs: MediaQueryList | null = null;
    try {
      mqStandalone = window.matchMedia("(display-mode: standalone)");
      mqFs = window.matchMedia("(display-mode: fullscreen)");
      mqStandalone.addEventListener("change", onStandaloneOrStorage);
      mqFs.addEventListener("change", onStandaloneOrStorage);
    } catch {
      /* ignore */
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === INSTALLED_KEY) onStandaloneOrStorage();
    };
    window.addEventListener("storage", onStorage);

    if (!ios && !android) {
      return () => {
        window.removeEventListener("storage", onStorage);
        try {
          mqStandalone?.removeEventListener("change", onStandaloneOrStorage);
          mqFs?.removeEventListener("change", onStandaloneOrStorage);
        } catch {
          /* ignore */
        }
      };
    }

    const onBip = (e: Event) => {
      if (isInstallSuppressed()) return;
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      if (!installAcceptedTrackedRef.current) {
        trackEvent("pwa_install_accepted", {
          platform: "android",
          surface: "appinstalled_event",
        });
        installAcceptedTrackedRef.current = true;
      }
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      persistInstalled();
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("storage", onStorage);
      try {
        mqStandalone?.removeEventListener("change", onStandaloneOrStorage);
        mqFs?.removeEventListener("change", onStandaloneOrStorage);
      } catch {
        /* ignore */
      }
    };
  }, [android, ios]);

  useEffect(() => {
    if (!authReady || typeof window === "undefined") return;
    const fullPath =
      window.location.pathname + window.location.search + window.location.hash;
    if (!fullPath || !fullPath.startsWith("/")) return;
    try {
      localStorage.setItem(LAST_ROUTE_KEY, fullPath);
    } catch {
      /* ignore */
    }
  }, [authReady, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isInstallSuppressed()) {
      setInstalled(true);
      setCanShowNow(false);
      setVisible(false);
      if (windowAppearsStandalonePwa()) persistInstalled();
      return;
    }

    if (!authReady) {
      setCanShowNow(false);
      setVisible(false);
      return;
    }

    if (ios && readIosGuideDone()) {
      setCanShowNow(false);
      setVisible(false);
      return;
    }

    try {
      if (!ios) {
        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
        if (Number.isFinite(dismissedAt) && dismissedAt > 0) {
          const cooldownActive = Date.now() - dismissedAt < DISMISS_TTL_MS;
          if (cooldownActive) {
            setCanShowNow(false);
            setVisible(false);
            return;
          }
        }
      }
    } catch {
      /* ignore */
    }

    const timer = window.setTimeout(() => {
      setCanShowNow(true);
    }, PROMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [authReady, ios]);

  useEffect(() => {
    if (typeof window !== "undefined" && isInstallSuppressed()) {
      setInstalled(true);
      setVisible(false);
      return;
    }

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
      trackEvent("pwa_prompt_shown", {
        platform: "android",
        surface: "install_sheet",
      });
      promptShownTrackedRef.current = true;
    }
  }, [android, deferred, ios, visible]);

  useEffect(() => {
    if (!authReady || !windowAppearsStandalonePwa() || typeof window === "undefined")
      return;
    if (window.location.pathname !== "/") return;
    try {
      const resumePath = String(
        localStorage.getItem(RESUME_ROUTE_KEY) ?? "",
      ).trim();
      const resumeAt = Number(localStorage.getItem(RESUME_ROUTE_AT_KEY) ?? "0");
      if (!resumePath.startsWith("/")) return;
      if (!Number.isFinite(resumeAt) || Date.now() - resumeAt > RESUME_ROUTE_TTL_MS)
        return;
      localStorage.removeItem(RESUME_ROUTE_KEY);
      localStorage.removeItem(RESUME_ROUTE_AT_KEY);
      if (resumePath !== "/") {
        router.replace(resumePath);
      }
    } catch {
      /* ignore */
    }
  }, [authReady, router]);

  const finalizeIosDismiss = useCallback(() => {
    persistIosGuideDone();
    setVisible(false);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (ios) {
      trackEvent("pwa_install_dismissed", {
        platform: "ios-safari",
        surface: "ios_hint",
      });
      finalizeIosDismiss();
      return;
    }
    if (android && deferred) {
      trackEvent("pwa_install_dismissed", {
        platform: "android",
        surface: "install_sheet",
      });
    }
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, [android, deferred, finalizeIosDismiss, ios]);

  const dismissAndroidBackdrop = useCallback(() => {
    dismiss();
  }, [dismiss]);

  const understoodIos = useCallback(() => {
    trackEvent("pwa_ios_hint_ack", { platform: "ios-safari" });
    finalizeIosDismiss();
  }, [finalizeIosDismiss]);

  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      const fullPath =
        window.location.pathname + window.location.search + window.location.hash;
      localStorage.setItem(RESUME_ROUTE_KEY, fullPath);
      localStorage.setItem(RESUME_ROUTE_AT_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setVisible(false);
    setDeferred(null);
    if (choice.outcome === "accepted") {
      if (!installAcceptedTrackedRef.current) {
        trackEvent("pwa_install_accepted", {
          platform: "android",
          surface: "install_sheet",
        });
        installAcceptedTrackedRef.current = true;
      }
      setInstalled(true);
      persistInstalled();
      return;
    }
    trackEvent("pwa_install_dismissed", {
      platform: "android",
      surface: "native_prompt",
    });
    dismiss();
  }, [deferred, dismiss]);

  if (installed || (!ios && !android)) return null;

  if (typeof window !== "undefined" && isInstallSuppressed()) return null;

  if (!visible) return null;

  if (ios) {
    return (
      <>
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            @keyframes enigma-ios-scrim {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes enigma-ios-sheet {
              from {
                opacity: 0;
                transform: translate3d(0, 28px, 0) scale(0.965);
                filter: blur(8px);
              }
              to {
                opacity: 1;
                transform: translate3d(0, 0, 0) scale(1);
                filter: blur(0);
              }
            }
            @keyframes enigma-ios-arrow {
              0%, 100% { transform: translate3d(0, 9px, 0); opacity: 0.72; }
              40% { transform: translate3d(0, 2px, 0); opacity: 0.95; }
              55% { transform: translate3d(0, 0, 0); opacity: 1; }
            }
            .enigma-ios-scrim {
              animation: enigma-ios-scrim 0.52s cubic-bezier(0.22, 1, 0.36, 1) forwards;
              opacity: 0;
            }
            .enigma-ios-glass {
              animation: enigma-ios-scrim 0.48s cubic-bezier(0.25, 0.1, 0.25, 1) 0.05s forwards;
              opacity: 0;
            }
            .enigma-ios-sheet {
              animation: enigma-ios-sheet 0.72s cubic-bezier(0.16, 1, 0.32, 1) 0.1s both;
              will-change: transform, opacity, filter;
            }
            .enigma-ios-arrow {
              animation: enigma-ios-arrow 2.6s cubic-bezier(0.42, 0, 0.58, 1) infinite;
              will-change: transform, opacity;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .enigma-ios-scrim,
            .enigma-ios-glass,
            .enigma-ios-sheet { opacity: 1; animation: none; transform: none; filter: none; }
            .enigma-ios-arrow { animation: none; opacity: 1; transform: none; }
          }
        `}</style>
        <div
          className="enigma-ios-scrim fixed inset-0 z-[110]"
          role="dialog"
          aria-modal="true"
          aria-label="Установка Enigma на iPhone"
        >
          <div
            className="enigma-ios-glass pointer-events-none absolute inset-0 bg-black/[0.52] backdrop-blur-xl backdrop-saturate-150"
            aria-hidden
          />
          <div
            className="relative flex min-h-[100dvh] flex-col"
            role="presentation"
            onClick={dismiss}
            onKeyDown={(e) => {
              if (e.key === "Escape") dismiss();
            }}
          >
            <div className="flex flex-1 flex-col items-center justify-end px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
              <span className="mb-2 text-[10px] font-semibold uppercase tracking-[0.38em] text-white/50">
                Панель Safari
              </span>
              <div className="enigma-ios-arrow" aria-hidden>
                <svg
                  width="48"
                  height="56"
                  viewBox="0 0 48 56"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
                >
                  <path
                    d="M24 52V12M24 12L12 24M24 12L36 24"
                    stroke="url(#enigma-ios-gw)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient
                      id="enigma-ios-gw"
                      x1="24"
                      y1="12"
                      x2="24"
                      y2="52"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#ddd6fe" />
                      <stop offset="1" stopColor="#67e8f9" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div
              className="enigma-ios-sheet mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] w-full max-w-[min(100%,384px)] rounded-[28px] border border-white/[0.12] bg-[linear-gradient(165deg,rgba(28,32,44,0.94),rgba(12,14,22,0.96))] p-5 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[18px] font-semibold leading-snug tracking-tight text-white/95">
                Добавьте Enigma как приложение
              </p>
              <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-white/78">
                <li>
                  Нажмите{" "}
                  <span className="inline-flex whitespace-nowrap rounded-lg bg-white/12 px-2 py-0.5 font-semibold text-white">
                    Поделиться
                  </span>{" "}
                  в нижней панели Safari
                </li>
                <li>
                  Выберите{" "}
                  <span className="inline-flex rounded-lg bg-white/12 px-2 py-0.5 font-semibold text-white">
                    На экран «Домой»
                  </span>
                </li>
                <li>
                  Подтвердите добавление{" "}
                  <span className="font-semibold text-white">Enigma</span>
                </li>
              </ol>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="pressable min-h-[48px] flex-1 rounded-2xl border border-white/16 bg-white/[0.07] text-[15px] font-medium text-white/86 transition-colors hover:bg-white/10"
                >
                  Позже
                </button>
                <button
                  type="button"
                  onClick={understoodIos}
                  className="pressable min-h-[48px] flex-1 rounded-2xl bg-white text-[15px] font-semibold text-neutral-950 shadow-lg shadow-black/20 transition-opacity hover:opacity-95"
                >
                  Понял
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes enigma-a2-backdrop-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes enigma-a2-sheet-in {
            from {
              opacity: 0;
              transform: translate3d(0, 100%, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
          .enigma-a2-backdrop {
            animation: enigma-a2-backdrop-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            opacity: 0;
          }
          .enigma-a2-sheet {
            animation: enigma-a2-sheet-in 0.5s cubic-bezier(0.22, 1, 0.28, 1) 0.04s both;
            will-change: transform, opacity;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .enigma-a2-backdrop,
          .enigma-a2-sheet { opacity: 1; animation: none; transform: none; }
        }
      `}</style>
      <div className="fixed inset-0 z-[100]" role="presentation">
        <button
          type="button"
          aria-label="Закрыть"
          className="enigma-a2-backdrop absolute inset-0 bg-black/50 backdrop-blur-md"
          onClick={dismissAndroidBackdrop}
        />
        <div className="absolute inset-x-0 bottom-0 flex justify-center pt-3">
          <div
            className="enigma-a2-sheet w-full max-w-lg rounded-t-[28px] border border-line border-b-0 bg-elevated shadow-[0_-12px_48px_rgba(0,0,0,0.38)]"
            role="dialog"
            aria-modal="true"
            aria-label="Установка Enigma"
          >
            <div className="flex justify-center pt-3 pb-1">
              <span className="h-1 w-10 rounded-full bg-fg/15" aria-hidden />
            </div>
            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
              <p className="text-lg font-semibold tracking-tight text-fg">Enigma</p>
              <p className="mt-1 text-[15px] leading-snug text-muted">
                Установите приложение — один тап, как в Google Play. Удобнее лента, чаты и
                уведомления.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void install()}
                  className="pressable min-h-[52px] w-full rounded-2xl bg-accent text-[16px] font-semibold text-white shadow-md"
                >
                  Установить Enigma
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="pressable min-h-[48px] w-full rounded-2xl border border-line bg-elev-2 text-[15px] font-medium text-fg"
                >
                  Не сейчас
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
