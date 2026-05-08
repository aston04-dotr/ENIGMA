import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRedirectSiteOrigin, getSupabasePublicConfig } from "@/lib/runtimeConfig";

type MagicLinkBody = {
  email?: string;
  emailRedirectTo?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MagicLinkBody;
    if (!body?.email || typeof body.email !== "string") {
      return new Response("Invalid email", { status: 400 });
    }
    const normalizedEmail = body.email.toLowerCase().trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return new Response("Invalid email", { status: 400 });
    }

    const requestedRedirect = String(body.emailRedirectTo ?? "").trim();
    const emailRedirectTo = requestedRedirect || `${getRedirectSiteOrigin()}/auth/confirm`;

    const { url, anonKey, configured } = getSupabasePublicConfig();
    if (!configured) {
      console.error("[api/magic-link] supabase_not_configured");
      return NextResponse.json(
        { ok: false, error: "Auth временно недоступен: Supabase не настроен" },
        { status: 503 },
      );
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo,
      },
    });

    if (error) {
      const status = Number((error as { status?: unknown; code?: unknown }).status ?? 0);
      console.error("[api/magic-link] signInWithOtp:error", {
        message: error.message,
        status,
        emailRedirectTo,
      });
      return NextResponse.json(
        { ok: false, error: error.message || "magic_link_failed" },
        { status: 502 },
      );
    }

    console.log("[api/magic-link] signInWithOtp:ok", {
      emailRedirectTo,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    console.error("[api/magic-link] exception", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
