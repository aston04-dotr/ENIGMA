"use client";

import { signInWithMagicLink } from "@/lib/auth";
import { isOptionalEmailValid } from "@/lib/validate";
import { useAuth } from "@/context/auth-context";
import { consumeAccessDeniedMessage } from "@/lib/deleteAccount";
import { trackEvent } from "@/lib/analytics";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function humanizeMagicLinkError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("security purposes") || t.includes("rate limit") || t.includes("too many")) {
    return "Слишком частые запросы. Подождите минуту и попробуйте снова.";
  }
  if (t.includes("invalid") && t.includes("email")) {
    return "Проверьте адрес почты и попробуйте снова.";
  }
  if (t.includes("timeout") || t.includes("network")) {
    return "Не дождались ответа сервера. Проверьте интернет и повторите.";
  }
  return raw.length > 200 ? "Не удалось отправить код. Попробуйте ещё раз." : raw;
}

export default function LoginPage() {
  const { session, ready } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const loginSuccessTrackedRef = useRef(false);

  useEffect(() => {
    if (consumeAccessDeniedMessage()) {
      setBanner("Доступ ограничен. Обратитесь в поддержку.");
      return;
    }
    if (typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const authError = search.get("auth_error");
    if (authError) {
      setBanner(`Ошибка авторизации: ${authError}`);
      return;
    }
    if (search.get("deleted") === "1") {
      setBanner("Аккаунт удалён");
      return;
    }
    if (search.get("signed_out") === "1") {
      setBanner("Вы вышли из аккаунта");
    }
  }, []);

  // Редирект если уже вошёл
  useEffect(() => {
    if (ready && session?.user) {
      if (!loginSuccessTrackedRef.current) {
        loginSuccessTrackedRef.current = true;
        trackEvent("login_success", { user_id: session.user.id });
      }
      router.replace("/");
    }
  }, [ready, session, router]);

  async function send() {
    setErr("");
    if (!acceptedTerms) {
      setErr("Подтвердите согласие с пользовательским соглашением");
      return;
    }
    const em = email.trim().toLowerCase();
    if (!em || !isOptionalEmailValid(em)) {
      setErr("Введите корректный email");
      return;
    }
    setLoading(true);
    const { error } = await signInWithMagicLink(em);
    setLoading(false);
    if (error) {
      setErr(humanizeMagicLinkError(error.message));
      return;
    }
    setSent(true);
    localStorage.setItem("auth_email", em);
    router.push("/auth/verify");
  }

  function onPrimaryClick() {
    trackEvent("login_click", { has_terms: acceptedTerms });
    void send();
  }

  return (
    <main className="flex min-h-screen flex-col bg-main px-6 pb-12 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-accent/80">ENIGMA</p>
      <Link href="/" className="mb-10 text-sm font-medium text-accent transition-colors duration-ui hover:text-accent-hover">
        ← Лента
      </Link>
      {banner ? (
        <p className="mb-6 rounded-card border border-line bg-elevated px-4 py-3 text-sm text-fg">{banner}</p>
      ) : null}
      <h1 className="text-[28px] font-bold tracking-tight text-fg">Вход</h1>
      <p className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-muted">
        Отправим 8-значный код на почту. Введите его на следующем шаге.
      </p>
      <label className="mt-6 flex items-start gap-2.5 text-sm leading-relaxed text-muted">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => {
            setAcceptedTerms(e.target.checked);
            if (err) setErr("");
          }}
          className="mt-0.5 h-4 w-4 rounded border-line bg-elevated text-accent focus:ring-accent/40"
        />
        <span>
          Нажимая «Получить код», вы соглашаетесь с{" "}
          <Link
            href="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            пользовательским соглашением
          </Link>
          .
        </span>
      </label>
      <label className="mt-10 block text-[11px] font-semibold uppercase tracking-wider text-muted">Email</label>
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (err) setErr("");
        }}
        className="mt-2 w-full min-h-[52px] rounded-card border border-line bg-elevated px-4 text-base text-fg placeholder:text-muted/70 transition-colors duration-ui focus:outline-none focus:ring-2 focus:ring-accent/35"
        placeholder="you@example.com"
      />
      {err ? <p className="mt-3 text-sm font-medium text-danger">{err}</p> : null}
      {sent ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm font-semibold text-fg">Код отправлен</p>
        </div>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Отправляем код…
        </p>
      ) : null}
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={loading || !acceptedTerms}
        className="pressable mt-8 min-h-[52px] w-full rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Отправка…" : "Получить код"}
      </button>
      {(sent || err) && !loading ? (
        <p className="mt-3 text-center text-xs text-muted">Можно запросить код ещё раз.</p>
      ) : null}
    </main>
  );
}
