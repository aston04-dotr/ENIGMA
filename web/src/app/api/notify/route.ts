import { Resend } from "resend";
import { NextResponse } from "next/server";

const DEFAULT_SUPPORT_EMAIL = "gt500@internet.ru";
const DEFAULT_SUBJECT = "Support request";
const DEFAULT_TEXT = "Empty message";

/**
 * Асинхронные email-уведомления (Resend).
 * Вызов из Edge Function / cron / после события в БД — не блокирует UI.
 *
 * Body: { subject: string, text?: string, html?: string }
 */
export async function POST(req: Request) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 501 });
    }

    let body: { to?: string; subject?: string; text?: string; html?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    console.log("[NOTIFY BODY]", body);

    const to =
      String(body.to ?? "").trim() ||
      String(process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim() ||
      DEFAULT_SUPPORT_EMAIL;
    const subject = String(body.subject ?? "").trim() || DEFAULT_SUBJECT;
    const textBody = String(body.text ?? "").trim() || DEFAULT_TEXT;
    const htmlBody = String(body.html ?? "").trim();

    if (!to || !subject) {
      return NextResponse.json({ ok: false, error: "to and subject required" }, { status: 400 });
    }

    const from = process.env.RESEND_FROM ?? "Enigma <onboarding@resend.dev>";
    const resend = new Resend(key);

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      ...(htmlBody ? { html: htmlBody, text: textBody } : { text: textBody }),
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log("[EMAIL SENT]", data);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[EMAIL ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "notify_failed" },
      { status: 500 }
    );
  }
}
