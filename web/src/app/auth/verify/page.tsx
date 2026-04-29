"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signInWithMagicLink } from "@/lib/auth";

const RESEND_SECONDS = 60;

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedEmail = localStorage.getItem("auth_email")?.trim().toLowerCase() ?? "";
    if (!savedEmail) {
      router.replace("/login");
      return;
    }
    setEmail(savedEmail);
    setReady(true);
  }, [router]);

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
    setLoading(true);
    setError("");

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    setLoading(false);
    if (verifyError) {
      setError("Неверный или устаревший код");
      return;
    }

    localStorage.removeItem("auth_email");
    window.location.href = "/";
  };

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

  return (
    <main className="flex min-h-screen flex-col bg-main px-6 pb-12 pt-[max(2rem,env(safe-area-inset-top))]">
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
        className="mt-2 w-full min-h-[52px] rounded-card border border-line bg-elevated px-4 text-base tracking-[0.2em] text-fg placeholder:text-muted/70 transition-colors duration-ui focus:outline-none focus:ring-2 focus:ring-accent/35"
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
        {loading ? "Входим…" : "Войти"}
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
