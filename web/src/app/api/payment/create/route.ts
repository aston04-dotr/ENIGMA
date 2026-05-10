import { NextResponse } from "next/server";
import { createPaymentIntent as providerCreatePaymentIntent } from "@/lib/paymentProvider";
import type { PaymentIntent, PaymentRail } from "@/lib/payments";
import {
  promoRequiresListingOwnership,
  validatePaymentCreateRequest,
} from "@/lib/paymentValidation";
import { getSupabasePublicConfig } from "@/lib/runtimeConfig";
import {
  logRouteHandlerAuthProbe,
  routeHandlerAuthDiagEnabled,
} from "@/lib/routeHandlerAuthDiag";
import { resolveRouteHandlerSupabaseUser } from "@/lib/serverSupabaseAuth";
import { createServerSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS: PaymentRail[] = ["sbp", "sber", "tinkoff", "vtb", "alfa", "raiffeisen", "card_mir"];

function isPaymentRail(s: unknown): s is PaymentRail {
  return typeof s === "string" && RAILS.includes(s.trim() as PaymentRail);
}

function sanitizeMetadata(meta: unknown): Record<string, string> {
  if (!meta || typeof meta !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k0, v0] of Object.entries(meta as Record<string, unknown>)) {
    const k = String(k0).trim().slice(0, 64);
    if (!k) continue;
    if (typeof v0 === "number" && Number.isFinite(v0)) out[k] = String(v0);
    else if (typeof v0 === "boolean") out[k] = v0 ? "1" : "0";
    else if (typeof v0 === "string") out[k] = v0.trim().slice(0, 512);
  }
  return out;
}

function parseDescription(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().slice(0, 240) : "";
  return s || "Оплата на ENIGMA";
}

export async function POST(request: Request) {
  const { configured } = getSupabasePublicConfig();
  if (!configured) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  console.log("[PAYMENT_DEBUG] headers.cookie =", request.headers.get("cookie"));

  const debugSupabase = await createServerSupabase();
  const sessionResult = await debugSupabase.auth.getSession();
  console.log("[PAYMENT_DEBUG] session =", {
    hasSession: !!sessionResult.data.session,
    userId: sessionResult.data.session?.user?.id ?? null,
    error: sessionResult.error?.message ?? null,
  });

  if (routeHandlerAuthDiagEnabled()) {
    await logRouteHandlerAuthProbe("api:payment:create:pre");
  }

  const { supabase, user, fatalRefreshCleared, authErrorMessage } =
    await resolveRouteHandlerSupabaseUser("api:payment:create");

  console.log("[PAYMENT_DEBUG] resolvedUser =", {
    hasUser: !!user,
    userId: user?.id ?? null,
  });

  if (routeHandlerAuthDiagEnabled()) {
    console.warn("[payment-create-auth-resolve]", {
      hasUser: Boolean(user?.id),
      userId: user?.id ?? null,
      fatalRefreshCleared,
      authErrorMessage: authErrorMessage ?? null,
    });
  }

  if (fatalRefreshCleared || !user?.id) {
    const denyReason = fatalRefreshCleared
      ? "fatal_refresh_cleared"
      : authErrorMessage === "no_user" || !authErrorMessage
        ? "no_authenticated_user"
        : `getUser:${authErrorMessage}`;

    console.log("[PAYMENT_DEBUG] RETURNING_401");

    return NextResponse.json(
      routeHandlerAuthDiagEnabled()
        ? { ok: false, error: "unauthorized", deny_reason: denyReason }
        : { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const rail = b.rail;
  if (!isPaymentRail(rail)) {
    return NextResponse.json({ ok: false, error: "invalid_rail" }, { status: 400 });
  }

  const rawAmount =
    typeof b.amountRub === "number"
      ? b.amountRub
      : typeof b.amountRub === "string"
        ? Number(b.amountRub)
        : NaN;

  const description = parseDescription(b.description);
  const metadataIn = sanitizeMetadata(b.metadata ?? {});
  const promoKindRaw = metadataIn.promoKind ?? metadataIn.promo_kind ?? null;
  const listingPackSlotsRaw = metadataIn.listing_pack_slots ?? metadataIn.listingPackSlots ?? null;
  const listingIdRaw =
    (metadataIn.listing_id ?? metadataIn.listingId ?? "").trim() || null;

  const validated = validatePaymentCreateRequest({
    promoKindRaw,
    listingPackSlotsRaw,
    amountRub: rawAmount,
  });
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: validated.status },
    );
  }

  if (promoRequiresListingOwnership(promoKindRaw)) {
    const lid = listingIdRaw ?? "";
    if (!lid) {
      return NextResponse.json({ ok: false, error: "listing_required" }, { status: 400 });
    }
    const { data: row, error } = await supabase
      .from("listings")
      .select("id")
      .eq("id", lid)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ ok: false, error: "listing_forbidden" }, { status: 403 });
    }
  }

  const secureAmount = validated.normalizedAmountRub;
  const metadata: Record<string, string> = {
    ...metadataIn,
    user_id: user.id,
    channel: rail,
    description,
  };

  try {
    const created = await providerCreatePaymentIntent(secureAmount, "RUB", metadata);
    const payload: PaymentIntent = {
      id: created.paymentId,
      amountRub: secureAmount,
      description,
      rail,
      status: created.status,
      currency: "RUB",
      metadata: created.metadata,
      confirmationUrl: created.confirmationUrl ?? null,
    };
    return NextResponse.json({ ok: true, payment: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create_failed";
    console.error("[api/payment/create]", msg, e);
    const isMapped = typeof msg === "string" && msg.startsWith("YOOKASSA_CREATE_FAILED:");
    return NextResponse.json(
      { ok: false, error: isMapped ? "yookassa_upstream" : "payment_provider_error" },
      { status: 502 },
    );
  }
}
