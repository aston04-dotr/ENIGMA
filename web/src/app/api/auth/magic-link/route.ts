/**
 * PKCE magic link: только `signInWithOtp` → письмо шлёт Supabase со ссылкой `.../auth/confirm?code=...`.
 * Не использовать: generateLink, admin, action_link/token, кастомный SMTP-дубль отправки здесь.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSiteOrigin, getSupabasePublicConfig } from "@/lib/runtimeConfig";

type MagicLinkBody = {
  email?: string;
};

const lastSentMap = new Map<string, number>();

function markRequestWindow(normalizedEmail: string) {
  const t = Date.now();
  lastSentMap.set(normalizedEmail, t);
  setTimeout(() => {
    lastSentMap.delete(normalizedEmail);
  }, 60_000);
}

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

    const siteOrigin = getSiteOrigin().replace(/\/+$/, "");
    const emailRedirectTo = `${siteOrigin}/auth/confirm`;

    const now = Date.now();
    const lastSent = lastSentMap.get(normalizedEmail);
    if (lastSent && now - lastSent < 10_000) {
      console.warn("[api/magic-link] throttled", { email: normalizedEmail });
    }

    const authPromise = supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo,
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("magic_link_timeout")), 10_000),
    );

    const { error } = await Promise.race([authPromise, timeoutPromise]);
    if (error) {
      console.error("[api/magic-link] signInWithOtp", error.message);
      return NextResponse.json(
        { ok: false, error: error.message || "magic_link_failed" },
        { status: 502 },
      );
    }

    console.log("OTP SENT VIA SUPABASE");

    markRequestWindow(normalizedEmail);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    if (e instanceof Error && e.message === "magic_link_timeout") {
      console.error("[api/magic-link] timeout");
      return NextResponse.json({ ok: false, error: "magic_link_timeout" }, { status: 504 });
    }
    const msg = e instanceof Error ? e.message : "unexpected_error";
    console.error("[api/magic-link] exception", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
