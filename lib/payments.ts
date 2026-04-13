/**
 * Клиентский слой оплаты: СБП, приложения банков РФ, карты.
 * Реальное списание — через эквайринг / Edge Function на бэкенде.
 */

import {
  confirmPayment as providerConfirmPayment,
  createPaymentIntent as providerCreatePaymentIntent,
  verifyPayment as providerVerifyPayment,
} from "./paymentProvider";

export type PaymentRail =
  | "sbp"
  | "sber"
  | "tinkoff"
  | "vtb"
  | "alfa"
  | "raiffeisen"
  | "card_mir";

export type PaymentIntent = {
  id: string;
  amountRub: number;
  description: string;
  rail: PaymentRail;
  status: "pending" | "confirmed" | "failed";
  currency: "RUB";
  metadata?: Record<string, string>;
};

const RAIL_LABELS: Record<PaymentRail, string> = {
  sbp: "СБП",
  sber: "СберБанк Онлайн",
  tinkoff: "Тинькофф",
  vtb: "ВТБ Онлайн",
  alfa: "Альфа-Онлайн",
  raiffeisen: "Райффайзен Онлайн",
  card_mir: "Карта (МИР, Visa, Mastercard)",
};

export function paymentRailLabel(rail: PaymentRail): string {
  return RAIL_LABELS[rail];
}

/** Имитация создания платежа на сервере до подключения провайдера. */
export async function createPaymentIntent(
  rail: PaymentRail,
  amountRub: number,
  description: string,
  metadata: Record<string, string> = {}
): Promise<PaymentIntent> {
  const created = await providerCreatePaymentIntent(amountRub, "RUB", {
    channel: rail,
    description,
    ...metadata,
  });
  return {
    id: created.paymentId,
    amountRub,
    description,
    rail,
    status: created.status,
    currency: "RUB",
    metadata: created.metadata,
  };
}

export async function confirmPayment(paymentId: string): Promise<PaymentIntent["status"]> {
  const confirmed = await providerConfirmPayment(paymentId);
  return confirmed.status;
}

export async function verifyPayment(paymentId: string): Promise<PaymentIntent["status"]> {
  const verified = await providerVerifyPayment(paymentId);
  return verified.status;
}
