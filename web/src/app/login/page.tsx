"use client";

import { signInWithMagicLink } from "@/lib/auth";
import { isOptionalEmailValid } from "@/lib/validate";
import { useAuth } from "@/context/auth-context";
import { consumeAccessDeniedMessage } from "@/lib/deleteAccount";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { session, ready } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

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
      router.replace("/");
    }
  }, [ready, session, router]);

  async function send() {
    setErr("");
    const em = email.trim().toLowerCase();
    if (!em || !isOptionalEmailValid(em)) {
      setErr("Введите корректный email");
      return;
    }
    setLoading(true);
    const { error } = await signInWithMagicLink(em);
    setLoading(false);
    if (error) {
      const msg = error.message;
      if (msg.includes("security purposes")) {
        setErr("Письмо уже отправлено. Проверь почту 👌");
        return;
      }
      setErr(msg);
      return;
    }
    setSent(true);
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
        <p className="mt-6 text-sm font-medium text-accent">Проверьте почту и откройте ссылку.</p>
      ) : null}
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={loading}
        className="pressable mt-8 min-h-[52px] w-full rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "…" : "Отправить ссылку"}
      </button>
    </main>
  );
}
