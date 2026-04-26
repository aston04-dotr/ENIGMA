import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getSiteOrigin, getSupabasePublicConfig } from "@/lib/runtimeConfig";

type MagicLinkBody = {
  email?: string;
};

const lastSentMap = new Map<string, number>();

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
      console.warn(
        "MAGIC LINK THROTTLED:",
        normalizedEmail,
        "wait:",
        10 - Math.floor((now - lastSent) / 1000),
        "sec",
      );
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    lastSentMap.set(normalizedEmail, now);
    setTimeout(() => {
      lastSentMap.delete(normalizedEmail);
    }, 60_000);

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

    console.log("MAGIC LINK: custom email send started");
    console.log("MAGIC LINK EMAIL:", normalizedEmail);
    console.log("MAGIC LINK REDIRECT:", redirectTo);

    if (!resendKey || !serviceRoleKey) {
      console.warn("ENV NOT FOUND → fallback to Supabase");
      console.warn("MAGIC LINK FALLBACK USED:", normalizedEmail);
      await sendWithSupabaseFallback();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    try {
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
        throw error;
      }
      const actionLink = String((data as { properties?: { action_link?: string } })?.properties?.action_link ?? "").trim();
      if (!actionLink) {
        throw new Error("empty_action_link");
      }

      const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #000;">
  <h2 style="margin-bottom: 10px;">Вход в Enigma</h2>

  <p style="font-size: 16px;">
    Чтобы войти в свой аккаунт Enigma, нажмите на кнопку ниже 👇
  </p>

  <a href="${actionLink}"
     style="
       display:inline-block;
       margin-top:16px;
       padding:14px 22px;
       background:#007AFF;
       color:#ffffff;
       border-radius:10px;
       text-decoration:none;
       font-weight:600;
       font-size:16px;
     ">
     👉 Войти в Enigma
  </a>

  <p style="margin-top: 20px; font-size: 14px;">
    Или нажмите на ссылку:
  </p>

  <p style="word-break: break-all;">
    <a href="${actionLink}" style="color:#007AFF;">
      ${actionLink} 👈
    </a>
  </p>

  <p style="margin-top: 20px; font-size: 13px; color:#555;">
    Ссылка действительна 10 минут.
  </p>

  <p style="margin-top: 10px; font-size: 13px; color:#555;">
    Если вы не запрашивали вход — просто проигнорируйте это письмо.
  </p>
</div>
`.trim();

      const text = `
Вход в Enigma

Чтобы войти, перейдите по ссылке:
${actionLink}

Ссылка действует 10 минут.
`.trim();

      const resend = new Resend(resendKey);
      const from = process.env.RESEND_FROM ?? "Enigma <onboarding@resend.dev>";
      const { error: sendError } = await resend.emails.send({
        from,
        to: normalizedEmail,
        subject: "Вход в Enigma",
        text,
        html,
      });
      if (sendError) {
        throw sendError;
      }
      console.log("MAGIC LINK SENT SUCCESSFULLY:", normalizedEmail);
    } catch (error) {
      console.error("MAGIC LINK ERROR:", error);
      console.error("CUSTOM EMAIL FAILED → fallback", error);
      console.warn("MAGIC LINK FALLBACK USED:", normalizedEmail);
      await sendWithSupabaseFallback();
    }

    console.log("[api/magic-link] ok");
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected_error";
    console.error("[api/magic-link] exception", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

