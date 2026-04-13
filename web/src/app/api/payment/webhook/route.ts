import { NextResponse } from "next/server";
import { markPaymentProcessed, isPaymentProcessed, logPaymentEvent } from "@/lib/paymentLogs";
import { handleWebhook, verifySignature } from "@/lib/providers/yookassa";

type PaymentWebhookBody = {
  paymentId?: string;
  status?: "pending" | "confirmed" | "failed";
  userId?: string;
  listingId?: string;
  promoKind?: string;
  amount?: number;
};

/**
 * Архитектура вебхука (source of truth для реального провайдера):
 * 1) verify signature
 * 2) parse payment event
 * 3) idempotency check by paymentId
 * 4) apply promotion (future: server-side secure context)
 * 5) mark processed + log
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-yookassa-signature");

  if (!verifySignature(signature, rawBody)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let body: PaymentWebhookBody;
  try {
    body = JSON.parse(rawBody) as PaymentWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const paymentId = body.paymentId?.trim();
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "paymentId required" }, { status: 400 });
  }

  if (isPaymentProcessed(paymentId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await handleWebhook(body);

  if (body.status !== "confirmed") {
    logPaymentEvent({
      user_id: body.userId ?? "webhook",
      listing_id: body.listingId ?? null,
      promoKind: body.promoKind ?? null,
      amount: Number(body.amount ?? 0),
      payment_id: paymentId,
      status: "failed",
    });
    return NextResponse.json({ ok: false, error: "Payment is not confirmed" }, { status: 409 });
  }

  logPaymentEvent({
    user_id: body.userId ?? "webhook",
    listing_id: body.listingId ?? null,
    promoKind: body.promoKind ?? null,
    amount: Number(body.amount ?? 0),
    payment_id: paymentId,
    status: "confirmed",
  });

  // NOTE: future production path
  // applyPromotionTariff must be executed here under server-side trusted context.

  markPaymentProcessed(paymentId);
  return NextResponse.json({ ok: true, processed: true });
}
