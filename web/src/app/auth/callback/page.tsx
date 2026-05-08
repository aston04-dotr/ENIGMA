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
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (!code) {
        window.location.replace("/login?auth_error=invalid_link");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[callback] exchangeCodeForSession", error.message);
        window.location.replace("/login?auth_error=exchange_failed");
        return;
      }

      await getSessionGuarded("auth-callback-success", { allowRefresh: true });
      router.replace("/");
      router.refresh();
    };

    void run();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-main">
      <div className="text-sm opacity-60">{message}</div>
    </div>
  );
}
