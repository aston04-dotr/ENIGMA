import { createPayment as createYooKassaPayment } from "./providers/yookassa";

export type PaymentMode = "mock" | "yookassa";
export type ProviderPaymentStatus = "pending" | "confirmed" | "failed";

export type ProviderPayment = {
  paymentId: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  status: ProviderPaymentStatus;
  provider: PaymentMode;
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

function envMap(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

export function getPaymentMode(): PaymentMode {
  const env = envMap();
  const raw = env.PAYMENT_MODE ?? env.EXPO_PUBLIC_PAYMENT_MODE ?? env.NEXT_PUBLIC_PAYMENT_MODE ?? "mock";
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
    };
  },

  async confirmPayment(paymentId) {
    return {
      paymentId,
      amount: 0,
      currency: "RUB",
      metadata: {},
      status: "failed",
      provider: "yookassa",
    };
  },

  async verifyPayment(paymentId) {
    return {
      paymentId,
      amount: 0,
      currency: "RUB",
      metadata: {},
      status: "failed",
      provider: "yookassa",
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
