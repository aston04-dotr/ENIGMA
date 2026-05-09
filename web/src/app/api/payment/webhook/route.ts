import { NextResponse } from "next/server";
import { markPaymentProcessed, isPaymentProcessed, logPaymentEvent } from "@/lib/paymentLogs";
import { handleWebhook, verifySignature } from "@/lib/providers/yookassa";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { listingSlotPackValidates } from "@/lib/listingSlotPacks";

type PaidServiceKind =
  | "renew_30"
  | "boost_3"
  | "boost_7"
  | "vip_3"
  | "vip_7"
  | "vip_30"
  | "top_7"
  | "listing_slot_pack";

type ApplyPaidServiceResult = {
  ok: boolean;
  userId: string | null;
  listingTitle: string | null;
  error?: string;
};

function getServiceRoleSupabase() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function toPaidServiceKind(rawPromoKind: string | null, rawServiceType: string | null): PaidServiceKind | null {
  const promo = String(rawPromoKind ?? "").trim().toLowerCase();
  const serviceType = String(rawServiceType ?? "").trim().toLowerCase();

  if (promo === "renew_30" || promo === "renewal_30" || promo === "listing_renew_30") return "renew_30";
  if (promo === "boost_3") return "boost_3";
  if (promo === "boost_7") return "boost_7";
  if (promo === "vip_3") return "vip_3";
  if (promo === "vip_7") return "vip_7";
  if (promo === "vip_30") return "vip_30";
  if (promo === "top_7" || promo === "top7") return "top_7";

  if (serviceType === "renew" || serviceType === "renew_30") return "renew_30";
  return null;
}

function promoLabel(kind: PaidServiceKind | null): string {
  if (kind === "renew_30") return "Продление объявления на 30 дней";
  if (kind === "boost_3") return "BOOST на 3 дня";
  if (kind === "boost_7") return "BOOST на 7 дней";
  if (kind === "vip_3") return "VIP на 3 дня";
  if (kind === "vip_7") return "VIP на 7 дней";
  if (kind === "vip_30") return "VIP на 30 дней";
  if (kind === "top_7") return "TOP на 7 дней";
  if (kind === "listing_slot_pack") return "Пакет дополнительных активных объявлений";
  return "Платная услуга";
}

async function hasProcessedPaymentPersistent(
  sb: ReturnType<typeof getServiceRoleSupabase>,
  paymentId: string,
): Promise<boolean> {
  if (!sb) return false;
  const marker = `payment:${paymentId}`;
  const { count, error } = await sb
    .from("listing_owner_notices")
    .select("id", { count: "exact", head: true })
    .eq("kind", "payment_processed")
    .eq("body", marker);
  if (error) return false;
  return (count ?? 0) > 0;
}

async function markPaymentProcessedPersistent(
  sb: ReturnType<typeof getServiceRoleSupabase>,
  paymentId: string,
  userId: string | null,
  listingId: string | null,
): Promise<void> {
  if (!sb || !userId) return;
  const marker = `payment:${paymentId}`;
  await sb.from("listing_owner_notices").insert({
    user_id: userId,
    listing_id: listingId,
    kind: "payment_processed",
    body: marker,
  });
}

async function applyPaidService(
  sb: ReturnType<typeof getServiceRoleSupabase>,
  listingId: string,
  serviceKind: PaidServiceKind,
): Promise<ApplyPaidServiceResult> {
  if (!sb) return { ok: false, userId: null, listingTitle: null, error: "supabase_not_configured" };

  const { data: listing, error: listingError } = await sb
    .from("listings")
    .select("id,user_id,title,status,expires_at,boosted_until,vip_until,top_until")
    .eq("id", listingId)
    .single();

  if (listingError || !listing) {
    return {
      ok: false,
      userId: null,
      listingTitle: null,
      error: listingError?.message || "listing_not_found",
    };
  }

  const userId = String((listing as { user_id?: unknown }).user_id ?? "").trim() || null;
  const listingTitle = String((listing as { title?: unknown }).title ?? "").trim() || null;
  const now = new Date();
  const nowIso = now.toISOString();
  const currentExpiresAt = String((listing as { expires_at?: unknown }).expires_at ?? "").trim();
  const currentBoostedUntil = String((listing as { boosted_until?: unknown }).boosted_until ?? "").trim();
  const currentVipUntil = String((listing as { vip_until?: unknown }).vip_until ?? "").trim();
  const currentTopUntil = String((listing as { top_until?: unknown }).top_until ?? "").trim();

  if (serviceKind === "renew_30") {
    const baseTs = Date.parse(currentExpiresAt);
    const base = Number.isFinite(baseTs) && baseTs > now.getTime() ? new Date(baseTs) : now;
    const nextExpiresAt = addDays(base, 30).toISOString();
    const { error } = await sb
      .from("listings")
      .update({
        status: "active",
        expires_at: nextExpiresAt,
        updated_at: nowIso,
      })
      .eq("id", listingId);
    if (error) {
      return { ok: false, userId, listingTitle, error: error.message || "renew_update_failed" };
    }
    return { ok: true, userId, listingTitle };
  }

  if (serviceKind === "boost_3" || serviceKind === "boost_7") {
    const days = serviceKind === "boost_3" ? 3 : 7;
    const boostedTs = Date.parse(currentBoostedUntil);
    const base = Number.isFinite(boostedTs) && boostedTs > now.getTime() ? new Date(boostedTs) : now;
    const boostedUntil = addDays(base, days).toISOString();

    const { error } = await sb
      .from("listings")
      .update({
        boosted_until: boostedUntil,
        boosted_at: nowIso,
        updated_at: nowIso,
        status: "active",
      })
      .eq("id", listingId);

    if (error) {
      return { ok: false, userId, listingTitle, error: error.message || "boost_update_failed" };
    }

    await ((sb.from as unknown as (relation: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    })("listing_boosts")).insert({
      listing_id: listingId,
      type: "boost",
      expires_at: boostedUntil,
      created_at: nowIso,
    });

    return { ok: true, userId, listingTitle };
  }

  if (serviceKind === "vip_3" || serviceKind === "vip_7" || serviceKind === "vip_30") {
    const days = serviceKind === "vip_3" ? 3 : serviceKind === "vip_7" ? 7 : 30;
    const vipTs = Date.parse(currentVipUntil);
    const base = Number.isFinite(vipTs) && vipTs > now.getTime() ? new Date(vipTs) : now;
    const vipUntil = addDays(base, days).toISOString();

    const { error } = await sb
      .from("listings")
      .update({
        is_vip: true,
        vip_until: vipUntil,
        updated_at: nowIso,
        status: "active",
      })
      .eq("id", listingId);

    if (error) {
      return { ok: false, userId, listingTitle, error: error.message || "vip_update_failed" };
    }

    await ((sb.from as unknown as (relation: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    })("listing_boosts")).insert({
      listing_id: listingId,
      type: "vip",
      expires_at: vipUntil,
      created_at: nowIso,
    });

    return { ok: true, userId, listingTitle };
  }

  if (serviceKind === "top_7") {
    const topTs = Date.parse(currentTopUntil);
    const base = Number.isFinite(topTs) && topTs > now.getTime() ? new Date(topTs) : now;
    const topUntil = addDays(base, 7).toISOString();

    const { error } = await sb
      .from("listings")
      .update({
        is_top: true,
        top_until: topUntil,
        updated_at: nowIso,
        status: "active",
      })
      .eq("id", listingId);

    if (error) {
      return { ok: false, userId, listingTitle, error: error.message || "top_update_failed" };
    }

    await ((sb.from as unknown as (relation: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    })("listing_boosts")).insert({
      listing_id: listingId,
      type: "top",
      expires_at: topUntil,
      created_at: nowIso,
    });

    return { ok: true, userId, listingTitle };
  }

  return { ok: false, userId, listingTitle, error: "unknown_service_kind" };
}

async function applyListingExtraSlotPack(
  sb: NonNullable<ReturnType<typeof getServiceRoleSupabase>>,
  userId: string,
  slots: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.rpc("add_listing_extra_slot_capacity_service", {
    p_user_id: userId,
    p_delta: slots,
  });
  if (error) return { ok: false, error: error.message || "rpc_failed" };
  return { ok: true };
}

async function sendPaymentReceiptEmail(params: {
  sb: ReturnType<typeof getServiceRoleSupabase>;
  userId: string | null;
  paymentId: string;
  amount: number;
  currency: string;
  serviceKind: PaidServiceKind | null;
  listingId: string | null;
  listingTitle: string | null;
}): Promise<void> {
  const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
  if (!params.sb || !params.userId || !apiKey) return;

  const { data: profile } = await params.sb
    .from("profiles")
    .select("email")
    .eq("id", params.userId)
    .single();
  const to = String((profile as { email?: unknown } | null)?.email ?? "").trim();
  if (!to) return;

  const fromEmail = String(process.env.RESEND_FROM ?? "").trim() || "support@enigma-app.online";
  const resend = new Resend(apiKey);
  const serviceTitle = promoLabel(params.serviceKind);
  const amountLabel = `${Math.max(0, Number(params.amount || 0)).toFixed(2)} ${params.currency || "RUB"}`;
  const lines = [
    "Оплата в Enigma успешно подтверждена.",
    "",
    `Услуга: ${serviceTitle}`,
    `Сумма: ${amountLabel}`,
    `Платёж: ${params.paymentId}`,
    params.listingId ? `Объявление: ${params.listingTitle || "Без названия"} (${params.listingId})` : null,
    "",
    "Спасибо, что используете Enigma.",
  ]
    .filter(Boolean)
    .join("\n");

  await resend.emails.send({
    from: `Enigma Support <${fromEmail}>`,
    to,
    subject: "Оплата подтверждена - Enigma",
    text: lines,
  });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-yookassa-signature");
  if (!verifySignature(signature, rawBody)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const resolved = await handleWebhook(payload);
  const paymentId = String(resolved.paymentId ?? "").trim();
  if (!resolved.ok || !paymentId) {
    return NextResponse.json({ ok: false, error: "invalid_payment_event" }, { status: 400 });
  }

  if (resolved.event && resolved.event !== "payment.succeeded") {
    return NextResponse.json({ ok: true, ignored: true, event: resolved.event });
  }

  if (resolved.status !== "confirmed") {
    return NextResponse.json({ ok: false, error: "payment_not_confirmed" }, { status: 409 });
  }

  if (isPaymentProcessed(paymentId)) {
    return NextResponse.json({ ok: true, duplicate: true, source: "memory" });
  }

  const sb = getServiceRoleSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  if (await hasProcessedPaymentPersistent(sb, paymentId)) {
    markPaymentProcessed(paymentId);
    return NextResponse.json({ ok: true, duplicate: true, source: "db" });
  }

  const metadata = resolved.metadata ?? {};
  const listingId =
    String(
      metadata.listing_id ??
        metadata.listingId ??
        "",
    ).trim() || null;
  const metadataUserId =
    String(
      metadata.user_id ??
        metadata.userId ??
        "",
    ).trim() || null;
  const promoKind =
    String(
      metadata.promoKind ??
        metadata.promo_kind ??
        metadata.tariff ??
        "",
    ).trim() || null;
  const serviceType =
    String(
      metadata.service_type ??
        metadata.serviceType ??
        "",
    ).trim() || null;

  const promoLower = String(promoKind ?? "").trim().toLowerCase();
  const rawPackSlots = String(
    metadata.listing_pack_slots ?? metadata.listingPackSlots ?? "",
  ).trim();
  const packSlotsParsed = Number.parseInt(rawPackSlots, 10);
  const amountRubRounded = Math.round(Number(resolved.amount ?? 0));

  const wantsListingPack =
    promoLower === "listing_pack" || promoLower === "listing_slot_pack";

  let resolvedServiceKind: PaidServiceKind | null = null;
  let listingTitle: string | null = null;
  let appliedUserId: string | null = metadataUserId;

  if (wantsListingPack) {
    if (!metadataUserId) {
      return NextResponse.json({ ok: false, error: "missing_user_for_listing_pack" }, { status: 400 });
    }
    if (!Number.isFinite(packSlotsParsed) || packSlotsParsed <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_listing_pack_slots" }, { status: 400 });
    }
    if (!listingSlotPackValidates(packSlotsParsed, amountRubRounded)) {
      return NextResponse.json({ ok: false, error: "listing_pack_amount_mismatch" }, { status: 400 });
    }

    const packRes = await applyListingExtraSlotPack(sb, metadataUserId, packSlotsParsed);
    if (!packRes.ok) {
      return NextResponse.json(
        { ok: false, error: packRes.error || "listing_pack_apply_failed" },
        { status: 500 },
      );
    }
    resolvedServiceKind = "listing_slot_pack";
    appliedUserId = metadataUserId;
  } else {
    const serviceKind = toPaidServiceKind(promoKind, serviceType);
    resolvedServiceKind = serviceKind;
    if (listingId && serviceKind) {
      const applied = await applyPaidService(sb, listingId, serviceKind);
      if (!applied.ok) {
        return NextResponse.json(
          { ok: false, error: applied.error || "apply_paid_service_failed" },
          { status: 500 },
        );
      }
      appliedUserId = applied.userId || appliedUserId;
      listingTitle = applied.listingTitle;
    }
  }

  await markPaymentProcessedPersistent(sb, paymentId, appliedUserId, listingId);

  logPaymentEvent({
    user_id: appliedUserId ?? "webhook",
    listing_id: listingId,
    promoKind: promoKind ?? resolvedServiceKind,
    amount: Number(resolved.amount ?? 0),
    payment_id: paymentId,
    status: resolvedServiceKind ? "applied" : "confirmed",
  });

  await sendPaymentReceiptEmail({
    sb,
    userId: appliedUserId,
    paymentId,
    amount: resolved.amount,
    currency: resolved.currency,
    serviceKind: resolvedServiceKind,
    listingId,
    listingTitle,
  });

  markPaymentProcessed(paymentId);

  return NextResponse.json({
    ok: true,
    processed: true,
    paymentId,
    service: resolvedServiceKind,
  });
}
