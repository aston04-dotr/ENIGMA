import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSiteOrigin, getSupabasePublicConfig } from "@/lib/runtimeConfig";

type MagicLinkBody = {
  email?: string;
};

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MagicLinkBody;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Введите корректный email" }, { status: 400 });
    }

    console.log("[api/magic-link] request", { email: maskEmail(email) });

    const { url, anonKey, configured } = getSupabasePublicConfig();
    if (!configured) {
      console.error("[api/magic-link] supabase_not_configured");
      return NextResponse.json(
        { ok: false, error: "Auth временно недоступен: Supabase не настроен" },
        { status: 503 }
      );
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const redirectTo = `${getSiteOrigin()}/auth/callback`;
    const authPromise = supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("magic_link_timeout")), 10_000)
    );

    const { error } = await Promise.race([authPromise, timeoutPromise]);

    if (error) {
      console.error("[api/magic-link] signInWithOtp_error", { email: maskEmail(email), message: error.message });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    console.log("[api/magic-link] ok", { email: maskEmail(email) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    console.error("[api/magic-link] exception", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

