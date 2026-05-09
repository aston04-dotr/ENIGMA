export const PAYMENT_CHECKOUT_STORAGE_KEY = "enigma_payment_checkout_v1";

export type PersistedPaymentCheckout = {
  paymentId: string;
  /** epoch ms когда ушли на YooKassa */
  ts: number;
  promoKind: string;
  listingId: string | null;
  orderTitle: string;
  listingPackSlots: string | null;
};

const MAX_AGE_MS = 20 * 60 * 1000;

export function writePersistedPaymentCheckout(payload: Omit<PersistedPaymentCheckout, "ts">): void {
  try {
    if (typeof window === "undefined") return;
    const body: PersistedPaymentCheckout = { ...payload, ts: Date.now() };
    window.sessionStorage.setItem(PAYMENT_CHECKOUT_STORAGE_KEY, JSON.stringify(body));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function readPersistedPaymentCheckout(): PersistedPaymentCheckout | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(PAYMENT_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPaymentCheckout>;
    const paymentId = String(parsed.paymentId ?? "").trim();
    if (!paymentId || Date.now() - Number(parsed.ts ?? 0) > MAX_AGE_MS) {
      window.sessionStorage.removeItem(PAYMENT_CHECKOUT_STORAGE_KEY);
      return null;
    }
    return {
      paymentId,
      ts: Number(parsed.ts ?? Date.now()),
      promoKind: String(parsed.promoKind ?? "").trim(),
      listingId: String(parsed.listingId ?? "").trim() || null,
      orderTitle: String(parsed.orderTitle ?? "").trim() || "Оплата ENIGMA",
      listingPackSlots: String(parsed.listingPackSlots ?? "").trim() || null,
    };
  } catch {
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(PAYMENT_CHECKOUT_STORAGE_KEY);
      }
    } catch {
      /* empty */
    }
    return null;
  }
}

export function clearPersistedPaymentCheckout(): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(PAYMENT_CHECKOUT_STORAGE_KEY);
  } catch {
    /* empty */
  }
}
