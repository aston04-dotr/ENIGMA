"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionGuarded } from "@/lib/supabase";

/**
 * Совместимость со старыми redirect URL вида /auth/callback.
 * Новый вход — только PKCE (?code=), как на /auth/confirm.
 */
export default function CallbackPage() {
  const router = useRouter();
  const [message] = useState("Вход…");
  const ranOnceRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranOnceRef.current) return;
    ranOnceRef.current = true;

    const run = async () => {
      const withTimeout = async <T,>(
        promise: Promise<T>,
        timeoutMs: number,
        label: string,
      ): Promise<T> => {
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
      };

      try {
        const startedAt = Date.now();
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (!code) {
          window.location.replace("/login?auth_error=invalid_link");
          return;
        }

        const { error } = await withTimeout(
          supabase.auth.exchangeCodeForSession(code),
          12_000,
          "authCallback:exchangeCodeForSession",
        );
        if (error) {
          console.error("[callback] exchangeCodeForSession", error.message);
          window.location.replace("/login?auth_error=exchange_failed");
          return;
        }

        const { session } = await withTimeout(
          getSessionGuarded("auth-callback-success", { allowRefresh: true }),
          12_000,
          "authCallback:hydrateSession",
        );
        if (!session?.user) {
          window.location.replace("/login?auth_error=session_not_ready");
          return;
        }
        console.debug("[auth-callback] success", { elapsedMs: Date.now() - startedAt });
        router.replace("/");
        router.refresh();
      } catch (error) {
        console.error("[auth-callback] finalize failed", error);
        window.location.replace("/login?auth_error=callback_timeout");
      }
    };

    void run();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-main">
      <div className="text-sm opacity-60">{message}</div>
    </div>
  );
}
