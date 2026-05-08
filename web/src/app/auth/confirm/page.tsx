"use client";

/**
 * Один вход: либо PKCE (?code=), либо email OTP (?token_hash|token + type). Без polling.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionGuarded } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

type Phase = "loading" | "success" | "error";
const AUTH_FINALIZE_TIMEOUT_MS = 12_000;

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

export default function AuthConfirmPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const didRunRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    const run = async () => {
      try {
        const startedAt = Date.now();
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code")?.trim();
        const otpTokenHash = url.searchParams.get("token_hash")?.trim();
        const otpToken = url.searchParams.get("token")?.trim();
        const otpType = url.searchParams.get("type")?.trim();
        const emailParam = url.searchParams.get("email")?.trim();

        if (code) {
          const { error } = await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            AUTH_FINALIZE_TIMEOUT_MS,
            "authConfirm:exchangeCodeForSession",
          );
          if (error) {
            setPhase("error");
            return;
          }
        } else if (otpTokenHash && otpType) {
          const { error } = await withTimeout(
            supabase.auth.verifyOtp({
              token_hash: otpTokenHash,
              type: otpType as EmailOtpType,
            } as Parameters<typeof supabase.auth.verifyOtp>[0]),
            AUTH_FINALIZE_TIMEOUT_MS,
            "authConfirm:verifyOtp:tokenHash",
          );

          if (error) {
            setPhase("error");
            return;
          }
        } else if (otpToken && otpType) {
          const { error } = await withTimeout(
            supabase.auth.verifyOtp({
              token: otpToken,
              type: otpType as EmailOtpType,
              ...(emailParam ? { email: emailParam } : {}),
            } as Parameters<typeof supabase.auth.verifyOtp>[0]),
            AUTH_FINALIZE_TIMEOUT_MS,
            "authConfirm:verifyOtp:token",
          );

          if (error) {
            setPhase("error");
            return;
          }
        } else {
          setPhase("error");
          return;
        }

        setPhase("success");
        const { session } = await withTimeout(
          getSessionGuarded("auth-confirm-success", { allowRefresh: true }),
          AUTH_FINALIZE_TIMEOUT_MS,
          "authConfirm:hydrateSession",
        );
        if (!session?.user) {
          setPhase("error");
          return;
        }
        console.debug("[auth-confirm] success", { elapsedMs: Date.now() - startedAt });
        router.replace("/");
        router.refresh();
      } catch (error) {
        console.error("[auth-confirm] finalize failed", error);
        setPhase("error");
      }
    };

    void run();
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
