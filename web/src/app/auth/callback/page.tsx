"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [message, setMessage] = useState("Вход…");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      console.log("CALLBACK SESSION:", data.session);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const stamp = (label: string) => {
      const ms = t0 ? Math.round(performance.now() - t0) : 0;
      console.log(`[callback] ${label}`, { ms });
    };

    const run = async () => {
      stamp("start");

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const rawType = url.searchParams.get("type");
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      const idemKey = `enigma_auth_cb:${code ?? ""}:${tokenHash ?? ""}:${accessToken?.slice(0, 20) ?? ""}`;
      try {
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(idemKey) === "1") {
          stamp("dedupe:already_done");
          if (active) {
            router.replace("/");
            router.refresh();
          }
          return;
        }
      } catch {
        /* ignore */
      }

      try {
        const { data: preAuth } = await supabase.auth.getSession();
        if (preAuth.session?.user?.id) {
          stamp("session:already (detectSessionInUrl or repeat visit)");
        }

        if (code) {
          if (preAuth.session?.user) {
            stamp("exchange:skip (session already from URL)");
          } else {
            stamp("exchange:start");
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            stamp("exchange:end");
            if (error) {
              const retry = await supabase.auth.getSession();
              if (retry.data.session?.user) {
                stamp("exchange:recovered (session from detectSessionInUrl or parallel)");
              } else {
                console.error("[callback] exchangeCodeForSession failed", error);
                if (active) window.location.replace("/login?auth_error=exchange_failed");
                return;
              }
            }
          }
        } else if (tokenHash && rawType && SUPABASE_EMAIL_OTP_TYPES.has(rawType as EmailOtpType)) {
          stamp("verifyOtp:start");
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: rawType as EmailOtpType,
          });
          stamp("verifyOtp:end");
          if (error) {
            console.error("[callback] verifyOtp failed", error);
            if (active) window.location.replace("/login?auth_error=verify_failed");
            return;
          }
        } else if (accessToken && refreshToken) {
          stamp("setSession:start");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          stamp("setSession:end");
          if (error) {
            console.error("[callback] setSession failed", error);
            if (active) window.location.replace("/login?auth_error=session_failed");
            return;
          }
        } else {
          console.warn("[callback] No code or hash tokens");
          if (active) window.location.replace("/login?auth_error=invalid_link");
          return;
        }

        stamp("getSession:start");
        let { data } = await supabase.auth.getSession();
        stamp("getSession:end");
        let hasSession = Boolean(data.session?.user?.id);

        if (!hasSession) {
          await new Promise((r) => setTimeout(r, 200));
          const second = await supabase.auth.getSession();
          data = second.data;
          hasSession = Boolean(data.session?.user?.id);
          stamp("getSession:retry200ms");
        }

        if (!hasSession) {
          await new Promise((r) => setTimeout(r, 500));
          const third = await supabase.auth.getSession();
          data = third.data;
          hasSession = Boolean(data.session?.user?.id);
          stamp("getSession:retry500ms");
        }

        if (active && hasSession) {
          setMessage("Готово");
          try {
            if (typeof sessionStorage !== "undefined") sessionStorage.setItem(idemKey, "1");
          } catch {
            /* ignore */
          }
          stamp("redirect:start");
          router.replace("/");
          router.refresh();
          stamp("redirect:end");
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
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-main">
      <div className="text-sm opacity-60">{message}</div>
    </div>
  );
}
