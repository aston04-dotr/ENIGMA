"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signInWithMagicLink } from "@/lib/auth";
import { tryLightVibrate } from "@/lib/nativeHaptics";

const RESEND_SECONDS = 60;
const VERIFY_TIMEOUT_MS = 15_000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label}:timeout:${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
  }
}

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  /** Короткая «пауза победы» перед редиректом в профиль. */
  const [phase, setPhase] = useState<"otp" | "success">("otp");
  const isSubmittingRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const queryEmail = searchParams.get("email")?.trim().toLowerCase() ?? "";
    const queryCode = (searchParams.get("code") ?? "")
      .replace(/\D/g, "")
      .slice(0, 8);

    const savedEmail = localStorage.getItem("auth_email")?.trim().toLowerCase() ?? "";
    const resolvedEmail = savedEmail || queryEmail;
    if (!resolvedEmail) {
      router.replace("/login");
      return;
    }

    if (queryCode) {
      setCode(queryCode);
    }
    setEmail(resolvedEmail);
    setReady(true);
  }, [router, searchParams]);

  useEffect(() => {
    if (!ready || secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, secondsLeft]);

  const onCodeChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 8);
    setCode(digitsOnly);
    if (error) setError("");
  };

  const onSubmit = async () => {
    if (code.length !== 8 || !email) return;
    if (isSubmittingRef.current) {
      console.warn("[auth-verify] submit skipped: already in-flight");
      return;
    }
    isSubmittingRef.current = true;
    setLoading(true);
    setError("");
    const startedAt = Date.now();

    try {
      console.debug("[auth-verify] otp verify:start", { email, codeLen: code.length });
      const { data: verifyData, error: verifyError } = await withTimeout(
        supabase.auth.verifyOtp({
          email,
          token: code,
          type: "email",
        }),
        VERIFY_TIMEOUT_MS,
        "verifyOtp",
      );
      console.debug("[auth-verify] otp verify:resolved", {
        hasSessionFromVerify: Boolean(verifyData?.session?.user),
      });
      if (verifyError) {
        console.error("[auth-verify] otp verify:error", verifyError);
        setError(verifyError.message || "Неверный или устаревший код");
        return;
      }
      console.debug("[auth-verify] otp verify:success");
      localStorage.removeItem("auth_email");
      console.debug("[auth-verify] otp verify:success", {
        elapsedMs: Date.now() - startedAt,
      });
      if (hasNavigatedRef.current) {
        console.warn("[auth-verify] navigation skipped: already navigated");
        return;
      }
      hasNavigatedRef.current = true;
      tryLightVibrate();
      setPhase("success");
    } catch (error) {
      console.error("[auth-verify] otp verify:failed", error);
      setError("Не удалось завершить вход. Проверьте интернет и попробуйте снова.");
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const [welcomeFadingOut, setWelcomeFadingOut] = useState(false);

  useEffect(() => {
    if (phase !== "success") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delayMs = reduce ? 380 : Math.round(700 + Math.random() * 499);
    const fadeBeforeMs = reduce ? Math.max(delayMs - 120, 0) : Math.max(delayMs - 340, 0);
    const tFade = window.setTimeout(() => setWelcomeFadingOut(true), fadeBeforeMs);
    const tNav = window.setTimeout(() => {
      router.replace("/profile");
      router.refresh();
    }, delayMs);
    return () => {
      window.clearTimeout(tFade);
      window.clearTimeout(tNav);
    };
  }, [phase, router]);

  const onResend = async () => {
    if (!email || resendLoading || secondsLeft > 0) return;
    setResendLoading(true);
    setError("");

    const { error: resendError } = await signInWithMagicLink(email);

    setResendLoading(false);
    if (resendError) {
      setError(resendError.message || "Не удалось отправить код снова");
      return;
    }

    setSecondsLeft(RESEND_SECONDS);
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-main px-6">
        <p className="text-sm text-muted">Проверяем данные для входа…</p>
      </main>
    );
  }

  if (phase === "success") {
    return (
      <main
        className={`flex min-h-[100dvh] flex-col items-center justify-center bg-main px-8 transition-[opacity,transform] duration-[340ms] ease-out ${welcomeFadingOut ? "pointer-events-none scale-[0.98] opacity-0" : "scale-100 opacity-100"}`}
      >
        <style>{`
          @keyframes verify-success-ring {
            from { opacity: 0; transform: scale(0.88); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes verify-success-mark {
            from { opacity: 0; transform: scale(0.5) rotate(-12deg); }
            65% { transform: scale(1.06) rotate(4deg); }
            to { opacity: 1; transform: scale(1) rotate(0deg); }
          }
          .verify-success-glow {
            animation: verify-success-ring 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          .verify-success-check {
            animation: verify-success-mark 0.55s cubic-bezier(0.22, 1, 0.28, 1) 90ms forwards;
            opacity: 0;
          }
          @media (prefers-reduced-motion: reduce) {
            .verify-success-glow, .verify-success-check { animation: none; opacity: 1; transform: none; }
          }
        `}</style>
        <div className="verify-success-glow relative flex flex-col items-center">
          <div className="absolute inset-0 -m-16 rounded-full bg-[radial-gradient(circle,rgba(14,174,254,0.22)_0%,rgba(139,95,255,0.14)_42%,transparent_68%)] blur-2xl" aria-hidden />
          <div
            className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[28px] border border-accent/25 bg-accent/12 shadow-[0_0_48px_-8px_rgba(14,174,254,0.35)] backdrop-blur-sm"
            aria-hidden
          >
            <svg
              className="verify-success-check h-11 w-11 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 7L10 17l-5-5" />
            </svg>
          </div>
        </div>
        <p className="mt-10 max-w-[280px] text-center text-xl font-semibold tracking-tight text-fg md:text-[22px]" aria-live="polite">
          Добро пожаловать в Enigma
        </p>
        <p className="mt-3 text-center text-sm text-muted opacity-85">Подготовим профиль…</p>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen flex-col bg-main px-6 pt-[max(2rem,env(safe-area-inset-top))]"
      style={{
        paddingBottom: `calc(max(3rem, env(safe-area-inset-bottom, 0px)) + var(--enigma-vv-inset-bottom, 0px))`,
      }}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-accent/80">ENIGMA</p>
      <Link href="/login" className="mb-10 text-sm font-medium text-accent transition-colors duration-ui hover:text-accent-hover">
        ← Назад
      </Link>

      <h1 className="text-[28px] font-bold tracking-tight text-fg">Введите код</h1>
      <p className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-muted">
        Отправили 8-значный код на {email}.
      </p>

      <label className="mt-10 block text-[11px] font-semibold uppercase tracking-wider text-muted">Код</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoFocus
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        maxLength={8}
        className="mt-2 w-full min-h-[52px] rounded-card border border-line bg-elevated px-4 text-base tracking-[0.2em] text-fg placeholder:text-muted/70 transition-colors duration-ui focus:outline-none focus:ring-2 focus:ring-accent/35 enigma-keyboard-scroll-target"
        placeholder="00000000"
      />

      {error ? <p className="mt-3 text-sm font-medium text-danger">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Проверяем код…
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={loading || resendLoading || code.length !== 8}
        className="pressable mt-8 min-h-[52px] w-full rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Сохраняем…" : "Продолжить"}
      </button>

      <button
        type="button"
        onClick={() => void onResend()}
        disabled={loading || resendLoading || secondsLeft > 0}
        className="mt-4 min-h-[44px] w-full rounded-card border border-line bg-elevated px-4 text-sm font-medium text-fg transition-colors duration-ui hover:bg-main disabled:opacity-50"
      >
        {resendLoading
          ? "Отправляем…"
          : secondsLeft > 0
            ? `Отправить код снова через ${secondsLeft}с`
            : "Отправить код снова"}
      </button>
    </main>
  );
}
