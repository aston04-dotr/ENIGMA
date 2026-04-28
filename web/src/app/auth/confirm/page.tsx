"use client";

/**
 * Только PKCE: `?code=` → exchangeCodeForSession. Без verifyOtp/token/token_hash/hash tokens.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

      if (!code) {
        setPhase("error");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
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
