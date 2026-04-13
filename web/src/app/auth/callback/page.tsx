"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let attempts = 0;
    let active = true;
    let redirected = false;

    const checkSession = async () => {
      if (!active || redirected) return;

      const { data } = await supabase.auth.getSession();

      if (data.session) {
        redirected = true;
        router.replace("/");
        return;
      }

      attempts++;

      if (attempts < 10 && active) {
        setTimeout(checkSession, 100);
      } else if (active && !redirected) {
        redirected = true;
        router.replace("/login");
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-main">
      <div className="text-sm opacity-60">Вход...</div>
    </div>
  );
}
