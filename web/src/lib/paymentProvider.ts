import { createPayment as createYooKassaPayment, fetchPayment as fetchYooKassaPayment } from "@/lib/providers/yookassa";

export type PaymentMode = "mock" | "yookassa";
export type ProviderPaymentStatus = "pending" | "confirmed" | "failed";

export type ProviderPayment = {
  paymentId: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  status: ProviderPaymentStatus;
  provider: PaymentMode;
  confirmationUrl?: string | null;
};

export type PaymentProvider = {
  createPaymentIntent: (
    amount: number,
    currency: string,
    metadata?: Record<string, string>
  ) => Promise<ProviderPayment>;
  confirmPayment: (paymentId: string) => Promise<ProviderPayment>;
  verifyPayment: (paymentId: string) => Promise<ProviderPayment>;
};

const mockStore = new Map<string, ProviderPayment>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function getPaymentMode(): PaymentMode {
  const raw =
    process.env.NEXT_PUBLIC_PAYMENT_MODE ??
    process.env.PAYMENT_MODE ??
    (process.env.NODE_ENV === "production" ? "yookassa" : "mock");
  if (process.env.NODE_ENV === "production") {
    return "yookassa";
  }
  return raw === "yookassa" ? "yookassa" : "mock";
}

const mockProvider: PaymentProvider = {
  async createPaymentIntent(amount, currency, metadata = {}) {
    await wait(randomInt(1000, 2000));
    const paymentId = `mock_pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payment: ProviderPayment = {
      paymentId,
      amount,
      currency,
      metadata,
      status: "pending",
      provider: "mock",
      confirmationUrl: null,
    };
    mockStore.set(paymentId, payment);
    return payment;
  },

  async confirmPayment(paymentId) {
    await wait(randomInt(1000, 2000));
    const current = mockStore.get(paymentId);
    if (!current) {
      return {
        paymentId,
        amount: 0,
        currency: "RUB",
        metadata: {},
        status: "failed",
        provider: "mock",
        confirmationUrl: null,
      };
    }
    const next: ProviderPayment = { ...current, status: "confirmed" };
    mockStore.set(paymentId, next);
    return next;
  },

  async verifyPayment(paymentId) {
    await wait(120);
    const current = mockStore.get(paymentId);
    if (!current) {
      return {
        paymentId,
        amount: 0,
        currency: "RUB",
        metadata: {},
        status: "failed",
        provider: "mock",
        confirmationUrl: null,
      };
    }
    return current;
  },
};

const yookassaProvider: PaymentProvider = {
  async createPaymentIntent(amount, currency, metadata = {}) {
    const created = await createYooKassaPayment({ amountRub: amount, currency, metadata });
    return {
      paymentId: created.paymentId,
      amount,
      currency,
      metadata,
      status: created.status,
      provider: "yookassa",
      confirmationUrl: created.confirmationUrl ?? null,
    };
  },

  async confirmPayment(paymentId) {
    const checked = await fetchYooKassaPayment(paymentId);
    return {
      paymentId: checked.paymentId,
      amount: 0,
      currency: "RUB",
      metadata: {},
      status: checked.status,
      provider: "yookassa",
      confirmationUrl: null,
    };
  },

  async verifyPayment(paymentId) {
    const checked = await fetchYooKassaPayment(paymentId);
    return {
      paymentId: checked.paymentId,
      amount: 0,
      currency: "RUB",
      metadata: {},
      status: checked.status,
      provider: "yookassa",
      confirmationUrl: null,
    };
  },
};

function provider(): PaymentProvider {
  return getPaymentMode() === "yookassa" ? yookassaProvider : mockProvider;
}

export async function createPaymentIntent(
  amount: number,
  currency: string,
  metadata: Record<string, string> = {}
): Promise<ProviderPayment> {
  return provider().createPaymentIntent(amount, currency, metadata);
}

export async function confirmPayment(paymentId: string): Promise<ProviderPayment> {
  return provider().confirmPayment(paymentId);
}

export async function verifyPayment(paymentId: string): Promise<ProviderPayment> {
  return provider().verifyPayment(paymentId);
}
