export type PaymentLogStatus =
  | "creating"
  | "pending"
  | "confirmed"
  | "failed"
  | "invalid"
  | "applied";

export type PaymentLogEntry = {
  user_id: string;
  listing_id: string | null;
  promoKind: string | null;
  amount: number;
  status: PaymentLogStatus;
  payment_id?: string;
  timestamp: string;
};

const paymentLogs: PaymentLogEntry[] = [];
const processedPaymentIds = new Set<string>();

export function logPaymentEvent(entry: Omit<PaymentLogEntry, "timestamp">): PaymentLogEntry {
  const event: PaymentLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  paymentLogs.push(event);
  return event;
}

export function listPaymentLogs(): PaymentLogEntry[] {
  return [...paymentLogs];
}

export function clearPaymentLogs() {
  paymentLogs.length = 0;
  processedPaymentIds.clear();
}

export function isPaymentProcessed(paymentId: string | null | undefined): boolean {
  if (!paymentId) return false;
  return processedPaymentIds.has(paymentId);
}

export function markPaymentProcessed(paymentId: string | null | undefined) {
  if (!paymentId) return;
  processedPaymentIds.add(paymentId);
}
