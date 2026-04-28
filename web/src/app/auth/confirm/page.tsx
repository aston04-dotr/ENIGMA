"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

const HOME_PATH = "/";

const SUPABASE_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

type Phase = "loading" | "success" | "error";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");

  const calledRef = useRef(false);
  /** Пока идёт async verify — второй вход в verify() недопустим. */
  const runningRef = useRef(false);

  const successRef = useRef(false);

  const SESSION_POLL_MS = 3_500;
  const SESSION_POLL_STEP_MS = 250;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (calledRef.current) {
      return;
    }
    calledRef.current = true;

    let successTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function trySetIdem(key: string) {
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(key, "1");
        }
      } catch {
        /* ignore */
      }
    }

    async function settleSessionThenFinish(
      idemKey: string,
      onOk: () => void,
      onFail: () => void,
    ) {
      let { data } = await supabase.auth.getSession();
      if (!data.session?.user?.id) {
        await new Promise((r) => setTimeout(r, 250));
        data = (await supabase.auth.getSession()).data;
      }
      if (!data.session?.user?.id) {
        await new Promise((r) => setTimeout(r, 450));
        data = (await supabase.auth.getSession()).data;
      }

      if (data.session?.user?.id) {
        trySetIdem(idemKey);
        onOk();
        return;
      }
      onFail();
    }

    function scheduleRedirectHome() {
      successTimer = setTimeout(() => {
        router.replace(HOME_PATH);
        router.refresh();
      }, 1000);
    }

    function finishSuccess() {
      if (successRef.current || cancelled) return;
      successRef.current = true;
      setPhase("success");
      scheduleRedirectHome();
    }

    function finishError() {
      if (successRef.current || cancelled) return;
      setPhase("error");
      runningRef.current = false;
    }

    async function verify() {
      if (runningRef.current) return;
      runningRef.current = true;

      const readSession = async () =>
        (await supabase.auth.getSession()).data.session ?? null;

      try {
        if ((await readSession())?.user?.id) {
          finishSuccess();
          return;
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const token = url.searchParams.get("token");
        const typeParam = url.searchParams.get("type");
        const emailParam = url.searchParams.get("email");
        const tokenHashParam = url.searchParams.get("token_hash");

        const hx = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
        const hashParams = new URLSearchParams(hx);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        const idemKey = `enigma_auth_confirm:${code ?? ""}:${tokenHashParam ?? ""}:${token?.slice(0, 12) ?? ""}:${accessToken?.slice(0, 12) ?? ""}`;

        try {
          if (
            typeof sessionStorage !== "undefined" &&
            sessionStorage.getItem(idemKey) === "1"
          ) {
            finishSuccess();
            return;
          }
        } catch {
          /* ignore */
        }

        if (code?.trim()) {
          console.log("VERIFY START", {
            branch: "code",
            token: null,
            type: null,
            email: null,
          });

          const { error } = await supabase.auth.exchangeCodeForSession(code.trim());
          if (error && !(await readSession())?.user) {
            console.error("[auth/confirm] exchangeCodeForSession", error);
            finishError();
            return;
          }

          await settleSessionThenFinish(idemKey, finishSuccess, finishError);
          return;
        }

        /* Ниже — только magic-link / OTP: без PKCE code (взаимоисключение). */
        const until = Date.now() + SESSION_POLL_MS;
        while (Date.now() < until) {
          if ((await readSession())?.user?.id) {
            trySetIdem(idemKey);
            finishSuccess();
            return;
          }
          await new Promise((r) => setTimeout(r, SESSION_POLL_STEP_MS));
        }

        console.log("VERIFY START", {
          token: token ?? null,
          type: typeParam ?? null,
          email: emailParam ?? null,
        });

        if (
          tokenHashParam &&
          typeParam &&
          SUPABASE_EMAIL_OTP_TYPES.has(typeParam as EmailOtpType)
        ) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHashParam,
            type: typeParam as EmailOtpType,
          });
          if (error) {
            console.error("[auth/confirm] verifyOtp (token_hash)", error);
            finishError();
            return;
          }

          await settleSessionThenFinish(idemKey, finishSuccess, finishError);
          return;
        }

        if (token?.trim()) {
          const otpType: EmailOtpType =
            typeParam && SUPABASE_EMAIL_OTP_TYPES.has(typeParam as EmailOtpType)
              ? (typeParam as EmailOtpType)
              : "email";

          if (emailParam) {
            const { error } = await supabase.auth.verifyOtp({
              type: otpType,
              token: token.trim(),
              email: emailParam,
            });
            if (error) {
              console.error("[auth/confirm] verifyOtp", error);
              finishError();
              return;
            }
          } else if (otpType === "email") {
            finishError();
            console.warn("[auth/confirm] type=email needs email query param");
            return;
          } else {
            const { error } = await supabase.auth.verifyOtp({
              type: otpType,
              token: token.trim(),
            } as Parameters<typeof supabase.auth.verifyOtp>[0]);
            if (error) {
              console.error("[auth/confirm] verifyOtp", error);
              finishError();
              return;
            }
          }

          await settleSessionThenFinish(idemKey, finishSuccess, finishError);
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error("[auth/confirm] setSession", error);
            finishError();
            return;
          }
          await settleSessionThenFinish(idemKey, finishSuccess, finishError);
          return;
        }

        console.warn("[auth/confirm] no valid auth params in URL");
        finishError();
      } catch (e) {
        console.error("[auth/confirm]", e);
        finishError();
      } finally {
        runningRef.current = false;
      }
    }

    void verify();

    return () => {
      cancelled = true;
      if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
      }
    };
  }, [router]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: "#0B0B0B" }}
    >
      <div className="w-full max-w-sm text-center">
        {phase === "loading" ? (
          <>
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full"
              style={{
                border: "2px solid rgba(255,255,255,0.15)",
                borderTopColor: "rgba(255,255,255,0.9)",
              }}
              aria-hidden
            />
            <p className="mt-6 text-[15px] font-medium text-white/90">
              Входим в аккаунт…
            </p>
          </>
        ) : null}
        {phase === "success" ? (
          <p className="text-[17px] font-semibold tracking-tight text-white">
            Добро пожаловать в Enigma
          </p>
        ) : null}
        {phase === "error" ? (
          <p className="text-[15px] leading-relaxed text-white/50">
            Ссылка устарела или недействительна
          </p>
        ) : null}
      </div>
    </div>
  );
}
