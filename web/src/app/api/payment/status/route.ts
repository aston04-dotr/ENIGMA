import { NextResponse } from "next/server";
import { fetchPaymentWithMetadata } from "@/lib/providers/yookassa";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";
import { resolveRouteHandlerSupabaseUser } from "@/lib/serverSupabaseAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UUID YooKassa + запас под будущие идентификаторы. */
const PAYMENT_ID_SAFE = /^[a-zA-Z0-9-]{16,128}$/;

function ownerFromMetadata(metadata: Record<string, string>): string {
  return String(metadata.user_id ?? metadata.userId ?? "").trim();
}

export type PaymentPublicStatusPayload = {
  ok: true;
  status: "pending" | "succeeded" | "failed";
};

/** Опрос платежа после return_url — только для владельца (metadata.user_id). */
export async function GET(req: Request) {
  const { configured } = getSupabasePublicConfig();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { user, fatalRefreshCleared } = await resolveRouteHandlerSupabaseUser("api:payment:status");

  if (fatalRefreshCleared || !user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const paymentId =
    String(new URL(req.url).searchParams.get("paymentId") ?? "").trim() || "";

  if (!paymentId || !PAYMENT_ID_SAFE.test(paymentId)) {
    return NextResponse.json({ ok: false, error: "bad_payment_id" }, { status: 400 });
  }

  const snapshot = await fetchPaymentWithMetadata(paymentId);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "payment_unreachable" }, { status: 502 });
  }

  const ownerId = ownerFromMetadata(snapshot.metadata);
  if (!ownerId || ownerId !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let status: PaymentPublicStatusPayload["status"];
  if (snapshot.status === "confirmed") status = "succeeded";
  else if (snapshot.status === "pending") status = "pending";
  else status = "failed";

  const body: PaymentPublicStatusPayload = { ok: true, status };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
