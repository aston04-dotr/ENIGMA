import { BOOST_TARIFFS, VIP_TARIFFS, type PromotionTariffKind } from "@/lib/monetization";

export const VIP_7_DISCOUNT_PRICE_RUB = 249;

type PromotionTariff = (typeof BOOST_TARIFFS)[number] | (typeof VIP_TARIFFS)[number];

export type PromotionPaymentValidationResult = {
  valid: boolean;
  normalizedAmountRub: number;
  reason?: string;
};

function findTariff(kind: PromotionTariffKind): PromotionTariff | undefined {
  return [...BOOST_TARIFFS, ...VIP_TARIFFS].find((t) => t.id === kind);
}

export function validatePromotionPaymentAmount(
  promoKind: PromotionTariffKind,
  amountRub: number
): PromotionPaymentValidationResult {
  const tariff = findTariff(promoKind);
  if (!tariff) {
    return { valid: false, normalizedAmountRub: 0, reason: "Неизвестный тариф." };
  }

  const basePrice = tariff.priceRub;
  const usesAllowedDiscount = promoKind === "vip_7" && amountRub === VIP_7_DISCOUNT_PRICE_RUB;
  const usesBasePrice = amountRub === basePrice;

  if (!usesBasePrice && !usesAllowedDiscount) {
    return {
      valid: false,
      normalizedAmountRub: basePrice,
      reason: `Некорректная сумма для ${promoKind}.`,
    };
  }

  return {
    valid: true,
    normalizedAmountRub: usesAllowedDiscount ? VIP_7_DISCOUNT_PRICE_RUB : basePrice,
  };
}

export function resolveSecurePromotionAmount(
  promoKind: PromotionTariffKind,
  requestedAmountRub?: number | null
): number {
  const tariff = findTariff(promoKind);
  if (!tariff) return 0;
  if (promoKind === "vip_7" && requestedAmountRub === VIP_7_DISCOUNT_PRICE_RUB) {
    return VIP_7_DISCOUNT_PRICE_RUB;
  }
  return tariff.priceRub;
}
