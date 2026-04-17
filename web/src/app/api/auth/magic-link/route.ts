import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSiteOrigin, getSupabasePublicConfig } from "@/lib/runtimeConfig";

type MagicLinkBody = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MagicLinkBody;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Введите корректный email" }, { status: 400 });
    }

    const { url, anonKey, configured } = getSupabasePublicConfig();
    if (!configured) {
      return NextResponse.json(
        { ok: false, error: "Auth временно недоступен: Supabase не настроен" },
        { status: 503 }
      );
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const redirectTo = `${getSiteOrigin()}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

