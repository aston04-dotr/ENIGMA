export type YooKassaCreatePaymentInput = {
  amountRub: number;
  currency: string;
  metadata?: Record<string, string>;
};

export type YooKassaPaymentResult = {
  paymentId: string;
  status: "pending" | "confirmed" | "failed";
  provider: "yookassa";
};

export async function createPayment(input: YooKassaCreatePaymentInput): Promise<YooKassaPaymentResult> {
  void input;
  return {
    paymentId: "yookassa_not_configured",
    status: "failed",
    provider: "yookassa",
  };
}

export async function handleWebhook(payload: unknown): Promise<{ ok: boolean }> {
  void payload;
  return { ok: true };
}

export function verifySignature(signature: string | null | undefined, body: string): boolean {
  void signature;
  void body;
  return false;
}
