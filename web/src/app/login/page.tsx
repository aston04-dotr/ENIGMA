"use client";

import { signInWithMagicLink } from "@/lib/auth";
import { isOptionalEmailValid } from "@/lib/validate";
import { useAuth } from "@/context/auth-context";
import { consumeAccessDeniedMessage } from "@/lib/deleteAccount";
import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";

const RESEND_COOLDOWN_MS = 60_000;

function humanizeMagicLinkError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("security purposes") || t.includes("rate limit") || t.includes("too many")) {
    return "Слишком частые запросы. Подождите минуту и нажмите «Отправить снова».";
  }
  if (t.includes("invalid") && t.includes("email")) {
    return "Проверьте адрес почты и попробуйте снова.";
  }
  if (raw === "magic_link_timeout" || t.includes("timeout") || t.includes("network")) {
    return "Не дождались ответа сервера. Проверьте интернет и повторите.";
  }
  return raw.length > 200 ? "Не удалось отправить письмо. Попробуйте ещё раз." : raw;
}

export default function LoginPage() {
  const { session, ready } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, bumpCooldownUi] = useReducer((n: number) => n + 1, 0);

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

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => bumpCooldownUi(), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  // Редирект если уже вошёл
  useEffect(() => {
    if (ready && session?.user) {
      router.replace("/");
    }
  }, [ready, session, router]);

  const cooldownLeftSec = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const canSendNow = cooldownLeftSec === 0;

  async function send() {
    setErr("");
    const em = email.trim().toLowerCase();
    if (!em || !isOptionalEmailValid(em)) {
      setErr("Введите корректный email");
      return;
    }
    if (!canSendNow) return;
    setLoading(true);
    const { error } = await signInWithMagicLink(em);
    setLoading(false);
    if (error) {
      const raw = error.message;
      const rateLimited =
        raw.toLowerCase().includes("security purposes") ||
        raw.toLowerCase().includes("rate limit") ||
        raw.toLowerCase().includes("too many");
      if (rateLimited) {
        setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
        setErr("Письмо уже отправляли недавно. Проверьте почту или подождите минуту.");
        return;
      }
      setErr(humanizeMagicLinkError(raw));
      return;
    }
    setSent(true);
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
  }

  function onPrimaryClick() {
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
        Отправим ссылку на почту. Перейдите по ней - войдёте автоматически.
      </p>
      <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-muted">
        Открывайте ссылку в том же браузере и на том же устройстве, где запрашивали вход.
      </p>
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
        <p className="mt-6 text-sm font-medium text-accent">
          Проверьте почту и откройте ссылку в этом браузере. Обычно письмо приходит за 5–30 секунд.
        </p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Отправляем письмо… Поле email можно исправить до следующей попытки.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={loading || !canSendNow}
        className="pressable mt-8 min-h-[52px] w-full rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Отправка…" : sent ? "Отправить снова" : "Отправить ссылку"}
      </button>
      {(sent || err) && !loading ? (
        <p className="mt-3 text-center text-xs text-muted">
          {canSendNow
            ? "Можно запросить письмо ещё раз."
            : `Повторная отправка через ${cooldownLeftSec} с (защита от спама).`}
        </p>
      ) : null}
    </main>
  );
}
