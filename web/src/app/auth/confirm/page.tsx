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

export default function AuthConfirmPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const didRunRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code")?.trim();
      const otpTokenHash = url.searchParams.get("token_hash")?.trim();
      const otpToken = url.searchParams.get("token")?.trim();
      const otpType = url.searchParams.get("type")?.trim();
      const emailParam = url.searchParams.get("email")?.trim();

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setPhase("error");
          return;
        }
      } else if (otpTokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: otpTokenHash,
          type: otpType as EmailOtpType,
        } as Parameters<typeof supabase.auth.verifyOtp>[0]);

        if (error) {
          setPhase("error");
          return;
        }
      } else if (otpToken && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token: otpToken,
          type: otpType as EmailOtpType,
          ...(emailParam ? { email: emailParam } : {}),
        } as Parameters<typeof supabase.auth.verifyOtp>[0]);

        if (error) {
          setPhase("error");
          return;
        }
      } else {
        setPhase("error");
        return;
      }

      setPhase("success");
      await getSessionGuarded("auth-confirm-success", { allowRefresh: true });
      router.replace("/");
      router.refresh();
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
