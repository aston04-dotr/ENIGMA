"use client";

/**
 * Один вход: либо PKCE (?code=), либо email OTP (?token=&type=). Без повторных вызовов и без polling.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

type Phase = "loading" | "success" | "error";

export default function AuthConfirmPage() {
  const [phase, setPhase] = useState<Phase>("loading");

  const ranOnceRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranOnceRef.current) return;
    ranOnceRef.current = true;

    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const otpToken = url.searchParams.get("token");
      const otpType = url.searchParams.get("type");
      const emailParam = url.searchParams.get("email");

      if (code?.trim()) {
        const { error } = await supabase.auth.exchangeCodeForSession(code.trim());
        if (error) {
          setPhase("error");
          return;
        }
      } else if (otpToken?.trim() && otpType?.trim()) {
        const { error } = await supabase.auth.verifyOtp({
          token: otpToken.trim(),
          type: otpType.trim() as EmailOtpType,
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

      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    };

    void run();
  }, []);

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
