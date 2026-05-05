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

  try {
    const payment = await yookassaRequest<YooKassaApiPayment>("/payments", {
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

    return {
      paymentId: String(payment.id ?? ""),
      status: toProviderStatus(payment.status),
      provider: "yookassa",
      confirmationUrl: String(payment.confirmation?.confirmation_url ?? "").trim() || null,
    };
  } catch {
    return {
      paymentId: "yookassa_create_failed",
      status: "failed",
      provider: "yookassa",
      confirmationUrl: null,
    };
  }
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
