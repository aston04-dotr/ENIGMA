/**
 * Слой оплаты (web): в браузере создание платежа идёт через POST /api/payment/create,
 * чтобы секрет YooKassa не оказывался в клиентском бандле. На сервере вызывается провайдер напрямую.
 * Mock-режим — только в dev при явной конфигурации.
 */

import {
  confirmPayment as providerConfirmPayment,
  createPaymentIntent as providerCreatePaymentIntent,
  verifyPayment as providerVerifyPayment,
} from "@/lib/paymentProvider";

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
  confirmationUrl?: string | null;
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

export async function createPaymentIntent(
  rail: PaymentRail,
  amountRub: number,
  description: string,
  metadata: Record<string, string> = {}
): Promise<PaymentIntent> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/payment/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        rail,
        amountRub,
        description,
        metadata,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      payment?: PaymentIntent;
      error?: string;
    } | null;
    if (!res.ok || !data?.ok || !data.payment) {
      const err = data?.error ?? `payment_create_${res.status}`;
      throw new Error(err);
    }
    return data.payment;
  }

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
    confirmationUrl: created.confirmationUrl ?? null,
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
