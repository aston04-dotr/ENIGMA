"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

const CHAT_PATH = "/chat";

/** Последняя страховка от двойного verify при HMR/Fast Refresh; сбрасывается только full reload. */
let globalAuthConfirmLock = false;

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
  const authOnceRef = useRef(false);
  const successRef = useRef(false);

  const AUTH_START_DELAY_MS = 400;
  /** Время, за которое GoTrue успевает обработать URL при detectSessionInUrl: true (без второго verify). */
  const URL_AUTH_POLL_MS = 4_000;
  const URL_AUTH_POLL_STEP_MS = 200;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const loc = new URL(window.location.href);
    const tokenHash = loc.searchParams.get("token_hash");
    const type = loc.searchParams.get("type");
    const email = loc.searchParams.get("email");
    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG AUTH]", { tokenHash, type, email });
    }

    let active = true;
    let runDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let successTimer: ReturnType<typeof setTimeout> | null = null;

    const finishSuccess = () => {
      if (successRef.current) {
        return;
      }
      successRef.current = true;
      setPhase("success");
      successTimer = setTimeout(() => {
        router.replace(CHAT_PATH);
        router.refresh();
      }, 1000);
    };

    const finishError = () => {
      if (successRef.current) {
        return;
      }
      if (!active) {
        return;
      }
      setPhase("error");
    };

    const run = async () => {
      if (typeof window === "undefined") {
        return;
      }

      const readSession = async () => (await supabase.auth.getSession()).data.session;
      if ((await readSession())?.user?.id) {
        finishSuccess();
        return;
      }

      const href = window.location.href;
      const url = new URL(href);
      const code = url.searchParams.get("code");
      const token = url.searchParams.get("token");
      const emailFromQuery = url.searchParams.get("email");
      const tokenHash = url.searchParams.get("token_hash");
      const rawType = url.searchParams.get("type");
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      const idemKey = `enigma_auth_confirm:${code ?? ""}:${tokenHash ?? ""}:${token?.slice(0, 12) ?? ""}:${accessToken?.slice(0, 12) ?? ""}`;
      try {
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(idemKey) === "1") {
          finishSuccess();
          return;
        }
      } catch {
        /* ignore */
      }

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            const retry = await supabase.auth.getSession();
            if (!retry.data.session?.user) {
              console.error("[auth/confirm] exchangeCodeForSession", error);
              finishError();
              return;
            }
          }
        } else {
          const needsOtpInUrl = Boolean(
            (tokenHash && rawType) || token || (accessToken && refreshToken),
          );
          if (needsOtpInUrl) {
            const until = Date.now() + URL_AUTH_POLL_MS;
            while (Date.now() < until) {
              if ((await readSession())?.user?.id) {
                try {
                  if (typeof sessionStorage !== "undefined") {
                    sessionStorage.setItem(idemKey, "1");
                  }
                } catch {
                  /* ignore */
                }
                finishSuccess();
                return;
              }
              await new Promise((r) => setTimeout(r, URL_AUTH_POLL_STEP_MS));
            }
          }

        if (tokenHash && rawType && SUPABASE_EMAIL_OTP_TYPES.has(rawType as EmailOtpType)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: rawType as EmailOtpType,
          });
          if (error) {
            console.error("[auth/confirm] verifyOtp (token_hash)", error);
            finishError();
            return;
          }
        } else if (token) {
          const otpType: EmailOtpType =
            rawType && SUPABASE_EMAIL_OTP_TYPES.has(rawType as EmailOtpType)
              ? (rawType as EmailOtpType)
              : "email";

          let error: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>["error"] =
            null;

          if (emailFromQuery) {
            const res = await supabase.auth.verifyOtp({
              type: otpType,
              token,
              email: emailFromQuery,
            });
            error = res.error;
          } else {
            if (otpType === "email") {
              console.warn("[auth/confirm] type=email requires email in query");
              finishError();
              return;
            }
            const res = await supabase.auth.verifyOtp({
              type: otpType,
              token,
            } as Parameters<typeof supabase.auth.verifyOtp>[0]);
            error = res.error;
          }

          if (error) {
            console.error("[auth/confirm] verifyOtp (token)", error);
            finishError();
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error("[auth/confirm] setSession", error);
            finishError();
            return;
          }
        } else {
          console.warn("[auth/confirm] no code, token, or hash");
          finishError();
          return;
        }
        }

        let { data } = await supabase.auth.getSession();
        if (!data.session?.user?.id) {
          await new Promise((r) => setTimeout(r, 200));
          const second = await supabase.auth.getSession();
          data = second.data;
        }
        if (!data.session?.user?.id) {
          await new Promise((r) => setTimeout(r, 400));
          const third = await supabase.auth.getSession();
          data = third.data;
        }

        if (data.session?.user?.id) {
          try {
            if (typeof sessionStorage !== "undefined") sessionStorage.setItem(idemKey, "1");
          } catch {
            /* ignore */
          }
          finishSuccess();
          return;
        }
        finishError();
      } catch (e) {
        console.error("[auth/confirm]", e);
        finishError();
      }
    };

    runDelayTimer = setTimeout(() => {
      if (typeof window === "undefined") {
        return;
      }
      if (globalAuthConfirmLock) {
        return;
      }
      if (authOnceRef.current) {
        return;
      }
      authOnceRef.current = true;
      globalAuthConfirmLock = true;
      void run();
    }, AUTH_START_DELAY_MS);

    return () => {
      active = false;
      if (runDelayTimer) {
        clearTimeout(runDelayTimer);
        runDelayTimer = null;
      }
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
            <p className="mt-6 text-[15px] font-medium text-white/90">Входим в аккаунт…</p>
          </>
        ) : null}
        {phase === "success" ? (
          <p className="text-[17px] font-semibold tracking-tight text-white">Добро пожаловать в Enigma</p>
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
