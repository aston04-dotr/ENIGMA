import { TOP_PRICE_RUB } from "@/lib/boostPay";
import { listingSlotPackValidates } from "@/lib/listingSlotPacks";
import { BOOST_TARIFFS, parsePromotionTariffKind, VIP_TARIFFS, type PromotionTariffKind } from "@/lib/monetization";
import { getListingRenewalPriceRub } from "@/lib/runtimeConfig";

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

export type PaymentCreateValidationResult =
  | { ok: true; normalizedAmountRub: number }
  | { ok: false; error: string; status: number };

const MAX_PAYMENT_RUB = 1_500_000;

/** Нужно убедиться, что payer владеет listing_id (антисписок чужих UUID в metadata). */
export function promoRequiresListingOwnership(promoKindRaw: string | null | undefined): boolean {
  const promoLower = String(promoKindRaw ?? "").trim().toLowerCase();
  if (promoLower === "listing_pack" || promoLower === "listing_slot_pack") return false;
  return (
    promoLower === "renew_30" ||
    promoLower === "renewal_30" ||
    promoLower === "listing_renew_30" ||
    promoLower === "boost_3" ||
    promoLower === "boost_7" ||
    promoLower === "vip_3" ||
    promoLower === "vip_7" ||
    promoLower === "vip_30" ||
    promoLower === "top_7" ||
    promoLower === "top7"
  );
}

function wantsListingPack(promoLower: string): boolean {
  return promoLower === "listing_pack" || promoLower === "listing_slot_pack";
}

/**
 * Серверная проверка суммы/metadata перед созданием платежа (в паре с UI на /payment).
 */
export function validatePaymentCreateRequest(input: {
  promoKindRaw: string | null | undefined;
  listingPackSlotsRaw: string | null | undefined;
  amountRub: number;
}): PaymentCreateValidationResult {
  const rawAmt = Number(input.amountRub);
  if (!Number.isFinite(rawAmt) || rawAmt < 1 || rawAmt > MAX_PAYMENT_RUB) {
    return {
      ok: false,
      error: "Некорректная сумма платежа.",
      status: 400,
    };
  }

  const promoTrim = String(input.promoKindRaw ?? "").trim();
  const promoLower = promoTrim.toLowerCase();

  if (!promoTrim) {
    return { ok: true, normalizedAmountRub: Math.floor(rawAmt) };
  }

  if (wantsListingPack(promoLower)) {
    const slots = Number.parseInt(String(input.listingPackSlotsRaw ?? "").trim(), 10);
    if (!Number.isFinite(slots) || slots <= 0) {
      return { ok: false, error: "Некорректный пакет слотов.", status: 400 };
    }
    const rounded = Math.round(rawAmt);
    if (!listingSlotPackValidates(slots, rounded)) {
      return { ok: false, error: "Сумма не соответствует выбранному пакету.", status: 400 };
    }
    return { ok: true, normalizedAmountRub: rounded };
  }

  const tariffKind = parsePromotionTariffKind(promoTrim);
  if (tariffKind) {
    const check = validatePromotionPaymentAmount(tariffKind, rawAmt);
    if (!check.valid) {
      return { ok: false, error: check.reason ?? "Некорректная сумма тарифа.", status: 400 };
    }
    return { ok: true, normalizedAmountRub: check.normalizedAmountRub };
  }

  if (promoLower === "top_7" || promoLower === "top7") {
    if (Math.round(rawAmt) !== TOP_PRICE_RUB) {
      return { ok: false, error: "Некорректная сумма для TOP.", status: 400 };
    }
    return { ok: true, normalizedAmountRub: TOP_PRICE_RUB };
  }

  const renewalPrice = getListingRenewalPriceRub();
  const renewalKeys = new Set(["renew_30", "renewal_30", "listing_renew_30"]);
  if (renewalKeys.has(promoLower)) {
    if (renewalPrice > 0 && Math.round(rawAmt) !== renewalPrice) {
      return { ok: false, error: "Некорректная сумма продления.", status: 400 };
    }
    if (renewalPrice <= 0) {
      return {
        ok: false,
        error: "Платное продление не включено для этого окружения.",
        status: 400,
      };
    }
    return { ok: true, normalizedAmountRub: renewalPrice };
  }

  return { ok: false, error: "Неизвестный тип оплаты (promoKind).", status: 400 };
}
