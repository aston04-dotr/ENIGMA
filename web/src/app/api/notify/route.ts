import { Resend } from "resend";
import { NextResponse } from "next/server";

/**
 * Асинхронные email-уведомления (Resend).
 * Вызов из Edge Function / cron / после события в БД — не блокирует UI.
 *
 * Body: { to: string, subject: string, text?: string, html?: string }
 */
export async function POST(req: Request) {
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
  const { to, subject, text, html } = body;
  if (!to?.trim() || !subject?.trim()) {
    return NextResponse.json({ ok: false, error: "to and subject required" }, { status: 400 });
  }

  const textBody = text?.trim();
  const htmlBody = html?.trim();
  if (!textBody && !htmlBody) {
    return NextResponse.json({ ok: false, error: "text or html required" }, { status: 400 });
  }

  const from = process.env.RESEND_FROM ?? "Enigma <onboarding@resend.dev>";
  const resend = new Resend(key);

  const { data, error } = await resend.emails.send({
    from,
    to: [to.trim()],
    subject: subject.trim(),
    ...(htmlBody
      ? { html: htmlBody, ...(textBody ? { text: textBody } : {}) }
      : { text: textBody ?? "" }),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id });
}
