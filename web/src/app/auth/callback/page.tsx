"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

const SUPABASE_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export default function CallbackPage() {
  const [message, setMessage] = useState("Вход...");

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const run = async () => {
      if (!active || inFlight) return;
      inFlight = true;

      const href = window.location.href;
      console.log("[callback] URL:", href);

      const url = new URL(href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const rawType = url.searchParams.get("type");
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[callback] exchangeCodeForSession failed", error);
            if (active) {
              window.location.replace("/login?auth_error=exchange_failed");
            }
            return;
          }
        } else if (tokenHash && rawType && SUPABASE_EMAIL_OTP_TYPES.has(rawType as EmailOtpType)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: rawType as EmailOtpType,
          });
          if (error) {
            console.error("[callback] verifyOtp failed", error);
            if (active) {
              window.location.replace("/login?auth_error=verify_failed");
            }
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error("[callback] setSession failed", error);
            if (active) {
              window.location.replace("/login?auth_error=session_failed");
            }
            return;
          }
        } else {
          console.warn("[callback] No code or hash tokens");
          if (active) {
            window.location.replace("/login?auth_error=invalid_link");
          }
          return;
        }

        // Даём клиенту чуть времени записать сессию в storage/cookies перед переходом.
        let tries = 0;
        let hasSession = false;
        while (tries < 8 && !hasSession) {
          const { data } = await supabase.auth.getSession();
          hasSession = Boolean(data.session?.user?.id);
          if (hasSession) break;
          tries += 1;
          await new Promise((resolve) => setTimeout(resolve, 120));
        }

        if (active && hasSession) {
          window.location.replace("/");
          return;
        }

        if (active) {
          window.location.replace("/login?auth_error=session_not_persisted");
        }
      } catch (error) {
        console.error("[callback] failed", error);
        if (active) {
          window.location.replace("/login?auth_error=callback_failed");
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-main">
      <div className="text-sm opacity-60">{message}</div>
    </div>
  );
}
