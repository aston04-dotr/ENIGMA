import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
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
        { status: 503 }
      );
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const redirectTo = `${getSiteOrigin()}/auth/callback`;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    const resendKey = process.env.RESEND_API_KEY?.trim() || "";

    const now = Date.now();
    const lastSent = lastSentMap.get(normalizedEmail);
    if (lastSent && now - lastSent < 10_000) {
      console.warn("THROTTLED BUT CONTINUE");
    }

    const sendWithSupabaseFallback = async () => {
      const authPromise = supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("magic_link_timeout")), 10_000),
      );
      const { error } = await Promise.race([authPromise, timeoutPromise]);
      if (error) throw error;
    };

    if (!resendKey || !serviceRoleKey) {
      console.warn("MAGIC LINK FALLBACK TRIGGERED");
      await sendWithSupabaseFallback();
      markRequestWindow(normalizedEmail);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    try {
      console.log("MAGIC LINK: USING CUSTOM EMAIL FLOW");
      const admin = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const generatePromise = admin.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("magic_link_timeout")), 10_000),
      );
      const { data, error } = await Promise.race([generatePromise, timeoutPromise]);
      if (error) {
        console.error("MAGIC LINK ERROR:", error);
        return NextResponse.json(
          { ok: false, error: "magic_link_generate_failed" },
          { status: 502 },
        );
      }
      const actionLink = String(
        (data as { properties?: { action_link?: string } })?.properties?.action_link ?? "",
      ).trim();
      console.log("ACTION LINK:", actionLink);
      if (!actionLink) {
        console.error("MAGIC LINK ERROR:", new Error("empty_action_link"));
        return NextResponse.json(
          { ok: false, error: "empty_action_link" },
          { status: 502 },
        );
      }

      const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #000;">
  <h2 style="margin-bottom: 10px;">Вход в Enigma</h2>

  <p style="font-size: 16px; margin: 0 0 12px 0;">
    Вас приветствует поддержка Enigma 👋
  </p>

  <p style="font-size: 16px; margin: 0 0 12px 0;">
    Мы всегда рядом и готовы помочь вам по любым вопросам — объявления, чат или работа платформы.
  </p>

  <p style="font-size: 16px; margin: 0 0 16px 0;">
    Напишите нам здесь, и мы быстро ответим.
  </p>

  <p style="font-size: 16px; margin: 0 0 16px 0;">
    Желаем вам удачных сделок! 🚀
  </p>

  <a href="${actionLink}" style="color:#2563eb;font-size:16px;font-weight:600;text-decoration:underline;">
    👉 Войти в Enigma
  </a>

  <p style="margin-top: 14px; font-size: 13px; color:#555;">
    Если ссылка не нажимается, скопируйте её и вставьте в браузер.
  </p>

  <p style="margin-top: 10px; font-size: 13px; color:#555; word-break: break-all;">
    ${actionLink}
  </p>

  <p style="margin-top: 14px; font-size: 13px; color:#555;">
    Ссылка действительна 10 минут.
  </p>

  <p style="margin-top: 10px; font-size: 13px; color:#555;">
    Если вы не запрашивали вход — просто проигнорируйте это письмо.
  </p>
</div>
`.trim();

      const text = `
Вход в Enigma

Вас приветствует поддержка Enigma 👋

Мы всегда рядом и готовы помочь вам по любым вопросам — объявления, чат или работа платформы.

Напишите нам здесь, и мы быстро ответим.

Желаем вам удачных сделок! 🚀

👉 Войти в Enigma:
${actionLink}

Если ссылка не нажимается, скопируйте её и вставьте в браузер.

Ссылка действует 10 минут.
`.trim();

      const resend = new Resend(resendKey);
      const from = process.env.RESEND_FROM ?? "Enigma <onboarding@resend.dev>";
      let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
      try {
        result = await resend.emails.send({
          from,
          to: normalizedEmail,
          subject: "Вход в Enigma",
          text,
          html,
        });
      } catch (resendThrow: unknown) {
        console.error("MAGIC LINK ERROR:", resendThrow);
        console.warn("MAGIC LINK FALLBACK TRIGGERED");
        await sendWithSupabaseFallback();
        markRequestWindow(normalizedEmail);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      const sendError = result.error ?? null;
      if (sendError) {
        console.error("MAGIC LINK ERROR:", sendError);
        console.warn("MAGIC LINK FALLBACK TRIGGERED");
        await sendWithSupabaseFallback();
        markRequestWindow(normalizedEmail);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      console.log("MAGIC LINK SENT SUCCESSFULLY");
      markRequestWindow(normalizedEmail);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "magic_link_timeout" || error.name === "AbortError")
      ) {
        console.error("MAGIC LINK ERROR:", error);
        return NextResponse.json(
          { ok: false, error: "magic_link_timeout" },
          { status: 504 },
        );
      }
      console.error("MAGIC LINK ERROR:", error);
      return NextResponse.json(
        { ok: false, error: "magic_link_unexpected" },
        { status: 500 },
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    console.error("[api/magic-link] exception", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
