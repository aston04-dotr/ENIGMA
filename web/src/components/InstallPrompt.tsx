"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { trackEvent } from "@/lib/analytics";
import {
  peekIosPwaInstallSnoozed,
  peekPwaInstallDeclinedForever,
  peekUserReadyForPwaInstall,
  setPwaInstallDeclinedForever,
  snoozeIosPwaInstallPrompt,
} from "@/lib/pwaInstallEligibility";
import { windowAppearsStandalonePwa } from "@/lib/pwaStandalone";
import { tryLightVibrate } from "@/lib/nativeHaptics";
import { usePathname, useRouter } from "next/navigation";

const DISMISS_KEY = "enigma:pwa:install-dismissed-at";
const INSTALLED_KEY = "enigma:pwa:installed-at";
const IOS_GUIDE_DONE_KEY = "enigma:pwa:ios-install-guide-done-v1";
const RESUME_ROUTE_KEY = "enigma:pwa:resume-route";
const RESUME_ROUTE_AT_KEY = "enigma:pwa:resume-route-at";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const IOS_SNOOZE_MS = 72 * 60 * 60 * 1000;
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

function isHardInstallSuppressed(): boolean {
  return windowAppearsStandalonePwa() || readStoredInstalled();
}

function installSoftBlocks(): boolean {
  if (typeof window === "undefined") return true;
  if (peekPwaInstallDeclinedForever()) return true;
  if (!peekUserReadyForPwaInstall()) return true;
  return false;
}

/** PWA: только после первого синка профиля; Android — событие install / sheet; iOS Safari — один раз после «Пропустить» или после snooze TTL. */
export function InstallPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading, authResolved, profileLoading, profile } = useAuth();
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

  const sessionReady =
    authResolved &&
    !loading &&
    !profileLoading &&
    Boolean(session?.user?.id);

  const installOfferReady =
    sessionReady &&
    profile != null &&
    (typeof window === "undefined" ? false : peekUserReadyForPwaInstall());

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
      if (!isHardInstallSuppressed()) return;
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
      if (isHardInstallSuppressed()) return;
      if (installSoftBlocks()) return;
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
      tryLightVibrate();
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
    if (!sessionReady || typeof window === "undefined") return;
    const fullPath =
      window.location.pathname + window.location.search + window.location.hash;
    if (!fullPath || !fullPath.startsWith("/")) return;
    try {
      localStorage.setItem("enigma:pwa:last-route", fullPath);
    } catch {
      /* ignore */
    }
  }, [sessionReady, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isHardInstallSuppressed()) {
      setInstalled(true);
      setCanShowNow(false);
      setVisible(false);
      if (windowAppearsStandalonePwa()) persistInstalled();
      return;
    }

    if (!installOfferReady || installSoftBlocks()) {
      setCanShowNow(false);
      setVisible(false);
      return;
    }

    if (ios && readIosGuideDone()) {
      setCanShowNow(false);
      setVisible(false);
      return;
    }

    if (ios && peekIosPwaInstallSnoozed()) {
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
  }, [installOfferReady, ios]);

  useEffect(() => {
    if (typeof window !== "undefined" && isHardInstallSuppressed()) {
      setInstalled(true);
      setVisible(false);
      return;
    }

    if (
      typeof window !== "undefined" &&
      (installSoftBlocks() || !installOfferReady)
    ) {
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
  }, [android, canShowNow, deferred, installOfferReady, installed, ios]);

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
    if (!sessionReady || !windowAppearsStandalonePwa() || typeof window === "undefined")
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
  }, [sessionReady, router]);

  const finalizeIosPermanent = useCallback(() => {
    persistIosGuideDone();
    setVisible(false);
  }, []);

  const iosLaterSnooze = useCallback(() => {
    trackEvent("pwa_install_dismissed", {
      platform: "ios-safari",
      surface: "ios_hint_later",
    });
    snoozeIosPwaInstallPrompt(Date.now() + IOS_SNOOZE_MS);
    setVisible(false);
  }, []);

  const iosSkipForeverCb = useCallback(() => {
    trackEvent("pwa_ios_hint_ack", { platform: "ios-safari", surface: "skip_forever" });
    finalizeIosPermanent();
  }, [finalizeIosPermanent]);

  const androidLater = useCallback(() => {
    setVisible(false);
    if (android && deferred) {
      trackEvent("pwa_install_dismissed", {
        platform: "android",
        surface: "install_sheet_later",
      });
    }
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, [android, deferred]);

  const androidSkipForever = useCallback(() => {
    trackEvent("pwa_install_dismissed", {
      platform: "android",
      surface: "install_sheet_skip_forever",
    });
    setPwaInstallDeclinedForever();
    setVisible(false);
    setDeferred(null);
  }, []);

  const dismissAndroidBackdrop = useCallback(() => {
    androidLater();
  }, [androidLater]);

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
      tryLightVibrate();
      return;
    }
    trackEvent("pwa_install_dismissed", {
      platform: "android",
      surface: "native_prompt",
    });
    androidLater();
  }, [androidLater, deferred]);

  if (installed || (!ios && !android)) return null;

  if (typeof window !== "undefined" && isHardInstallSuppressed()) return null;

  if (!visible) return null;

  if (ios) {
    return (
      <>
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            @keyframes enigma-ios-scrim-in {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes enigma-ios-sheet-in {
              from {
                opacity: 0;
                transform: translate3d(0, 38px, 0) scale(0.93);
                filter: blur(14px);
              }
              to {
                opacity: 1;
                transform: translate3d(0, 0, 0) scale(1);
                filter: blur(0);
              }
            }
            @keyframes enigma-ios-pointer {
              0%, 100% { transform: translate3d(0, -8px, 0); opacity: 0.55; }
              42% { transform: translate3d(0, 10px, 0); opacity: 1; }
              55% { transform: translate3d(0, 8px, 0); opacity: 0.95; }
            }
            @keyframes enigma-ios-share-pulse {
              0%, 100% {
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(147,197,253,0.42), 0 8px 32px rgba(0,0,0,0.28);
              }
              48% {
                transform: scale(1.065);
                box-shadow: 0 0 0 14px rgba(147,197,253,0.12), 0 12px 40px rgba(0,0,0,0.35);
              }
            }
            @keyframes enigma-ios-safari-in {
              from { opacity: 0; transform: translate3d(0, 12px, 0); }
              to { opacity: 1; transform: translate3d(0, 0, 0); }
            }
            @keyframes enigma-ios-icon-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-3px); }
            }
            .enigma-ios-scrim-v2 {
              animation: enigma-ios-scrim-in 0.62s cubic-bezier(0.2, 0.82, 0.28, 1) forwards;
              opacity: 0;
            }
            .enigma-ios-glass-v2 {
              animation: enigma-ios-scrim-in 0.5s cubic-bezier(0.25, 0.1, 0.28, 1) 0.06s forwards;
              opacity: 0;
            }
            .enigma-ios-sheet-v2 {
              animation: enigma-ios-sheet-in 0.88s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both;
              will-change: transform, opacity, filter;
            }
            .enigma-ios-pointer-down {
              animation: enigma-ios-pointer 2.85s cubic-bezier(0.45, 0.02, 0.55, 0.98) infinite;
              will-change: transform, opacity;
            }
            .enigma-ios-share-slot {
              animation: enigma-ios-share-pulse 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            }
            .enigma-ios-safari-reveal-v2 {
              animation: enigma-ios-safari-in 0.72s cubic-bezier(0.2, 0.85, 0.34, 1) 0.28s both;
              opacity: 0;
            }
            .enigma-ios-step-float {
              animation: enigma-ios-icon-float 3.2s ease-in-out infinite;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .enigma-ios-scrim-v2,
            .enigma-ios-glass-v2,
            .enigma-ios-sheet-v2,
            .enigma-ios-safari-reveal-v2 { opacity: 1; animation: none; transform: none; filter: none; }
            .enigma-ios-pointer-down,
            .enigma-ios-share-slot,
            .enigma-ios-step-float { animation: none; }
          }
        `}</style>
        <div
          className="enigma-ios-scrim-v2 fixed inset-0 z-[110]"
          role="dialog"
          aria-modal="true"
          aria-label="Добавить на экран «Домой»"
        >
          <div
            className="enigma-ios-glass-v2 pointer-events-none absolute inset-0 bg-black/[0.56] backdrop-blur-2xl backdrop-saturate-[1.65]"
            aria-hidden
          />
          <div
            className="relative flex min-h-[100dvh] flex-col"
            role="presentation"
            onClick={iosLaterSnooze}
            onKeyDown={(e) => {
              if (e.key === "Escape") iosLaterSnooze();
            }}
          >
            <div className="flex flex-1 flex-col justify-end px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div
                className="enigma-ios-sheet-v2 mx-auto mb-4 w-full max-w-[372px] rounded-[30px] border border-white/[0.11] bg-[linear-gradient(168deg,rgba(32,36,50,0.97),rgba(14,17,26,0.98))] p-6 text-white shadow-[0_-24px_64px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.05]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center px-2">
                  <div className="mt-2 flex items-center gap-12">
                    <div className="enigma-ios-step-float flex flex-col items-center gap-2">
                      <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[14px] border border-white/15 bg-white/95 shadow-xl">
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden
                        >
                          <path
                            fill="#007AFF"
                            fillRule="evenodd"
                            d="M13 16.5v-11l3.293 3.293a1 1 0 101.414-1.414l-5-5a1 1 0 00-1.414 0l-5 5a1 1 0 101.414 1.414L11 5.586v11a1 1 0 102 0z"
                            clipRule="evenodd"
                          />
                          <path
                            fill="#007AFF"
                            d="M6 21a1 1 0 100 2h12a1 1 0 100-2H6z"
                          />
                          <path
                            fill="#007AFF"
                            fillOpacity=".35"
                            d="M9 21h6v3H9v-3z"
                          />
                        </svg>
                      </div>
                    </div>
                    <span className="text-[26px] font-light text-white/35" aria-hidden>
                      ›
                    </span>
                    <div className="enigma-ios-step-float flex flex-col items-center gap-2">
                      <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[14px] border border-emerald-300/35 bg-gradient-to-br from-emerald-300/95 to-teal-500/92 shadow-xl">
                        <svg
                          width="30"
                          height="30"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden
                        >
                          <path d="M4 21h16v2H4z" fill="rgba(255,255,255,0.94)" />
                          <path
                            fill="rgba(255,255,255,0.94)"
                            d="M4 21V10l8-7 8 7v11H4zm8-13.764L6 13.236V19h12v-5.764L12 7.236z"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <p className="mt-7 text-[15px] font-medium leading-snug text-white/[0.92]">
                    На экран «Домой»
                  </p>
                  <div className="mt-7 grid w-full grid-cols-2 gap-2 border-t border-white/[0.08] pt-5">
                    <button
                      type="button"
                      onClick={iosLaterSnooze}
                      className="pressable min-h-[48px] rounded-2xl border border-white/16 bg-white/[0.06] text-[15px] font-medium text-white/88 transition-colors hover:bg-white/10"
                    >
                      Позже
                    </button>
                    <button
                      type="button"
                      onClick={iosSkipForeverCb}
                      className="pressable min-h-[48px] rounded-2xl bg-white text-[15px] font-semibold text-neutral-950 shadow-lg shadow-black/18 transition-opacity hover:opacity-95"
                    >
                      Пропустить
                    </button>
                  </div>
                </div>
              </div>

              <div className="enigma-ios-pointer-down mb-4 flex justify-center" aria-hidden>
                <svg
                  width="40"
                  height="44"
                  viewBox="0 0 40 44"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)]"
                >
                  <path
                    d="M20 6v26M13 31l7 8 7-8"
                    stroke="url(#enigma-ios-ptr)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="enigma-ios-ptr" x1="20" y1="6" x2="20" y2="44" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#dbeafe" />
                      <stop offset="1" stopColor="#67e8f9" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div
                className="enigma-ios-safari-reveal-v2 mx-auto flex h-[54px] w-full max-w-[352px] items-center justify-between rounded-[22px] border border-white/[0.12] bg-black/55 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
              >
                <span className="h-9 w-9 rounded-xl bg-white/10" aria-hidden />
                <div className="enigma-ios-share-slot flex items-center justify-center rounded-[13px] border border-black/25 bg-[#fefefe] px-4 py-2.5 shadow-md">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill="#007AFF"
                      fillRule="evenodd"
                      d="M12 13.086l2.793-2.793a1 1 0 111.414 1.414L12 16.914l-4.207-4.207a1 1 0 111.414-1.414L12 13.086z"
                      clipRule="evenodd"
                    />
                    <path
                      fill="#007AFF"
                      d="M12 4v9a1 1 0 11-2 0V4h2zm-8 17a1 1 0 100 2h16a1 1 0 100-2H4z"
                    />
                  </svg>
                  <span className="sr-only">Поделиться</span>
                </div>
                <span className="h-9 w-9 rounded-xl bg-white/10" aria-hidden />
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
            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <p className="text-center text-[17px] font-semibold tracking-tight text-fg">
                Установить Enigma
              </p>
              <p className="mt-2 text-center text-[14px] leading-snug text-muted">
                Работает как приложение
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
                  onClick={androidLater}
                  className="pressable min-h-[48px] w-full rounded-2xl border border-line bg-elev-2 text-[15px] font-medium text-fg"
                >
                  Позже
                </button>
                <button
                  type="button"
                  onClick={androidSkipForever}
                  className="pressable min-h-[44px] w-full rounded-2xl text-[14px] font-medium text-muted transition-colors hover:text-fg"
                >
                  Пропустить навсегда
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
