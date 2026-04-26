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

      const fontStack =
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
      const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0B0B0B; margin:0; padding:24px; font-family:${fontStack};">
  <tr>
    <td align="center">
      <div style="max-width:480px; margin:0 auto; background-color:#111; border-radius:12px; padding:24px; text-align:left;">
        <h1 style="margin:0 0 8px 0; font-size:22px; font-weight:600; line-height:1.25; color:#ffffff; letter-spacing:-0.02em;">Вход в Enigma</h1>
        <p style="margin:0 0 24px 0; font-size:16px; line-height:1.5; color:#aaaaaa;">Нажмите кнопку ниже, чтобы войти в свой аккаунт</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td align="left">
              <a href="${actionLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background-color:#ffffff; color:#0B0B0B; font-size:16px; font-weight:600; line-height:1.2; text-decoration:none; padding:14px 24px; border-radius:12px;">Войти в Enigma</a>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0; font-size:13px; line-height:1.5; color:#aaaaaa;">Ссылка действует ограниченное время.</p>
        <p style="margin:20px 0 8px 0; font-size:13px; line-height:1.5; color:#aaaaaa;">Если кнопка не работает, откройте ссылку вручную:</p>
        <p style="margin:0; font-size:12px; line-height:1.5; color:#ffffff; word-break:break-all; overflow-wrap:anywhere;">${actionLink}</p>
        <p style="margin:24px 0 0 0; padding-top:20px; border-top:1px solid #1a1a1a; font-size:12px; line-height:1.4; color:#666666;">Enigma</p>
      </div>
    </td>
  </tr>
</table>
`.trim();

      const text = `Вход в Enigma

Нажмите кнопку ниже, чтобы войти в свой аккаунт.

Войти в Enigma (откройте в браузере):
${actionLink}

Ссылка действует ограниченное время.

Если кнопка не работает, откройте ссылку вручную:
${actionLink}
`.trim();

      const resend = new Resend(resendKey);
      const from = "Enigma <noreply@enigma-app.online>";
      let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
      try {
        result = await resend.emails.send({
          from,
          to: normalizedEmail,
          subject: "Вход в Enigma — подтвердите за 10 секунд",
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
