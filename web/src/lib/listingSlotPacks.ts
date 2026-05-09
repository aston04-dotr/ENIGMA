/**
 * Платные пакеты дополнительных одновременно активных объявлений (сверх 15 бесплатных).
 * BOOST / TOP / VIP не затрагиваются.
 */
export type ListingExtraSlotPack = {
  slots: number;
  priceRub: number;
  /** Короткий ярлык для UI */
  label: string;
};

export const LISTING_EXTRA_SLOT_PACKS: ListingExtraSlotPack[] = [
  { slots: 25, priceRub: 2900, label: "+25 активных" },
  { slots: 50, priceRub: 4900, label: "+50 активных" },
  { slots: 100, priceRub: 7900, label: "+100 активных" },
];

export const FREE_ACTIVE_LISTINGS_CAP = 15;

export function findListingSlotPackBySlots(slots: number): ListingExtraSlotPack | undefined {
  return LISTING_EXTRA_SLOT_PACKS.find((p) => p.slots === slots);
}

/** Проверка для webhook: сумма и количество слотов соответствуют каталогу. */
export function listingSlotPackValidates(slots: number, amountRub: number): boolean {
  const pack = findListingSlotPackBySlots(slots);
  if (!pack) return false;
  return Math.round(Number(amountRub)) === pack.priceRub;
}
