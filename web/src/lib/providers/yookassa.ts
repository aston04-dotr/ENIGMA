import { createHmac, timingSafeEqual } from "crypto";

export type YooKassaCreatePaymentInput = {
  amountRub: number;
  currency: string;
  metadata?: Record<string, string>;
};

export type YooKassaPaymentResult = {
  paymentId: string;
  status: "pending" | "confirmed" | "failed";
  provider: "yookassa";
  confirmationUrl?: string | null;
};

export type YooKassaWebhookResolved = {
  ok: boolean;
  event: string | null;
  paymentId: string | null;
  status: "pending" | "confirmed" | "failed";
  amount: number;
  currency: string;
  metadata: Record<string, string>;
};

type YooKassaApiPayment = {
  id?: string;
  status?: string;
  amount?: { value?: string; currency?: string };
  confirmation?: { confirmation_url?: string };
  metadata?: Record<string, unknown>;
};

const YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";

function readYooKassaConfig() {
  const shopId = String(process.env.YOOKASSA_SHOP_ID ?? "").trim();
  const secretKey = String(process.env.YOOKASSA_SECRET_KEY ?? "").trim();
  /**
   * return_url после оплаты: `${origin}/payment`. Обязательно совпадает с публичным доменом
   * (NEXT_PUBLIC_APP_URL или NEXT_PUBLIC_SITE_URL), иначе YooKassa вернёт пользователя не туда.
   */
  const appUrl =
    String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim() ||
    String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
    "https://enigma-app.online";

  return {
    shopId,
    secretKey,
    appUrl,
    configured: Boolean(shopId && secretKey),
  };
}

function toProviderStatus(rawStatus: string | undefined): YooKassaPaymentResult["status"] {
  if (rawStatus === "succeeded") return "confirmed";
  if (rawStatus === "pending" || rawStatus === "waiting_for_capture") return "pending";
  return "failed";
}

export type YooKassaPaymentSnapshot = {
  paymentId: string;
  status: YooKassaPaymentResult["status"];
  rawStatus: string;
  metadata: Record<string, string>;
};

function parsePaymentMetadata(metadataRaw: Record<string, unknown> | undefined): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (!metadataRaw || typeof metadataRaw !== "object") return metadata;
  for (const [key, value] of Object.entries(metadataRaw)) {
    if (value == null) continue;
    metadata[key] = String(value);
  }
  return metadata;
}

async function yookassaRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { shopId, secretKey, configured } = readYooKassaConfig();
  if (!configured) {
    throw new Error("YOOKASSA_NOT_CONFIGURED");
  }

  const basicAuth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const res = await fetch(`${YOOKASSA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YOOKASSA_HTTP_${res.status}:${body || "request_failed"}`);
  }

  return (await res.json()) as T;
}

/** URL редиректа на оплату (YooKassa отдаёт snake_case; на всякий случай поддерживаем и camelCase). */
function resolveRedirectConfirmationUrl(payment: YooKassaApiPayment): string | null {
  const c = payment.confirmation;
  if (!c || typeof c !== "object") return null;
  const raw = c as Record<string, unknown>;
  const snake = raw.confirmation_url;
  const camel = raw.confirmationUrl;
  const u =
    (typeof snake === "string" ? snake : typeof camel === "string" ? (camel as string) : "").trim();
  return u || null;
}

/** GET /payments/{id} со snapshot metadata (для /api/payment/status после return_url). */
export async function fetchPaymentWithMetadata(paymentId: string): Promise<YooKassaPaymentSnapshot | null> {
  const id = String(paymentId ?? "").trim();
  if (!id) return null;
  try {
    const payment = await yookassaRequest<YooKassaApiPayment>(
      `/payments/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    const rawStatus = String(payment.status ?? "").trim() || "unknown";
    return {
      paymentId: String(payment.id ?? id),
      status: toProviderStatus(payment.status),
      rawStatus,
      metadata: parsePaymentMetadata(payment.metadata as Record<string, unknown>),
    };
  } catch {
    return null;
  }
}

export async function fetchPayment(paymentId: string): Promise<YooKassaPaymentResult> {
  const id = String(paymentId ?? "").trim();
  if (!id) {
    return {
      paymentId: "",
      status: "failed",
      provider: "yookassa",
    };
  }

  try {
    const payment = await yookassaRequest<YooKassaApiPayment>(`/payments/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    return {
      paymentId: String(payment.id ?? id),
      status: toProviderStatus(payment.status),
      provider: "yookassa",
      confirmationUrl: null,
    };
  } catch {
    return {
      paymentId: id,
      status: "failed",
      provider: "yookassa",
      confirmationUrl: null,
    };
  }
}

export async function createPayment(input: YooKassaCreatePaymentInput): Promise<YooKassaPaymentResult> {
  const amountRub = Math.max(1, Math.floor(Number(input.amountRub ?? 0)));
  const currency = String(input.currency || "RUB").toUpperCase();
  const metadata = input.metadata ?? {};
  const { appUrl } = readYooKassaConfig();

  let payment: YooKassaApiPayment;
  try {
    payment = await yookassaRequest<YooKassaApiPayment>("/payments", {
      method: "POST",
      headers: {
        "Idempotence-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: {
          value: amountRub.toFixed(2),
          currency,
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: `${appUrl.replace(/\/+$/, "")}/payment`,
        },
        metadata,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yookassa] create_payment_failed", { message: msg });
    throw new Error(`YOOKASSA_CREATE_FAILED:${msg}`);
  }

  const paymentId = String(payment.id ?? "").trim();
  if (!paymentId) {
    console.error("[yookassa] create_payment_missing_id", { rawStatus: payment.status });
    throw new Error("YOOKASSA_CREATE_FAILED:missing_payment_id");
  }

  const confirmationUrl = resolveRedirectConfirmationUrl(payment);
  if (!confirmationUrl) {
    console.error("[yookassa] create_payment_missing_confirmation_url", {
      paymentId,
      status: payment.status,
      confirmationType:
        payment.confirmation && typeof payment.confirmation === "object"
          ? (payment.confirmation as Record<string, unknown>).type
          : undefined,
    });
    throw new Error("YOOKASSA_CREATE_FAILED:missing_confirmation_url");
  }

  return {
    paymentId,
    status: toProviderStatus(payment.status),
    provider: "yookassa",
    confirmationUrl,
  };
}

export async function handleWebhook(payload: unknown): Promise<YooKassaWebhookResolved> {
  const eventPayload = payload as {
    event?: unknown;
    object?: YooKassaApiPayment;
  } | null;

  const event = typeof eventPayload?.event === "string" ? eventPayload.event : null;
  const object = eventPayload?.object;
  const paymentId = String(object?.id ?? "").trim();
  const metadataRaw = object?.metadata ?? {};

  const metadata: Record<string, string> = {};
  if (metadataRaw && typeof metadataRaw === "object") {
    for (const [key, value] of Object.entries(metadataRaw)) {
      if (value == null) continue;
      metadata[key] = String(value);
    }
  }

  const amountValue = Number(object?.amount?.value ?? 0);
  const amount = Number.isFinite(amountValue) ? amountValue : 0;
  const currency = String(object?.amount?.currency ?? "RUB");

  if (!paymentId) {
    return {
      ok: false,
      event,
      paymentId: null,
      status: "failed",
      amount,
      currency,
      metadata,
    };
  }

  const verified = await fetchPayment(paymentId);

  return {
    ok: true,
    event,
    paymentId,
    status: verified.status,
    amount,
    currency,
    metadata,
  };
}

export function verifySignature(signature: string | null | undefined, body: string): boolean {
  if (!signature) return true;
  const { secretKey } = readYooKassaConfig();
  if (!secretKey) return false;

  const digest = createHmac("sha256", secretKey).update(body).digest("hex");
  const normalizedSig = signature.trim().toLowerCase();
  const normalizedDigest = digest.toLowerCase();
  const a = Buffer.from(normalizedSig);
  const b = Buffer.from(normalizedDigest);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
