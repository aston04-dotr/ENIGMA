/**
 * Пакеты размещений (покупка в настройках, списание при публикации сверх лимита).
 * Типы для оплаты: package_type real_estate | auto | other
 */
import { getCategoryRule } from "./monetization";

export type PackageKind = "real_estate" | "auto" | "other";

export type ListingPackageDef = {
  kind: PackageKind;
  emoji: string;
  cardTitle: string;
  headline: string;
  slotsLabel: string;
  priceRub: number;
  slots: number;
  /** Бейдж «лучшая выгода» на карточке. */
  bestValue?: boolean;
};

/** Категория для взятия цены разового платного размещения из CATEGORY_RULES. */
function baselineCategoryId(kind: PackageKind): string {
  if (kind === "real_estate") return "realestate";
  if (kind === "auto") return "auto";
  return "other";
}

/**
 * Экономия пакета: (цена разового размещения × слоты) − цена пакета.
 * Синхронно с правилами в monetization.ts (getCategoryRule).
 */
export function computePackageEconomics(p: Pick<ListingPackageDef, "kind" | "slots" | "priceRub">): {
  unitPriceRub: number;
  baselineRub: number;
  savingsRub: number;
} {
  const unitPriceRub = getCategoryRule(baselineCategoryId(p.kind)).priceRub;
  const baselineRub = unitPriceRub * p.slots;
  const savingsRub = Math.max(0, baselineRub - p.priceRub);
  return { unitPriceRub, baselineRub, savingsRub };
}

export const LISTING_PACKAGES: ListingPackageDef[] = [
  {
    kind: "real_estate",
    emoji: "🏠",
    cardTitle: "Недвижимость",
    headline: "Пакет недвижимости",
    slotsLabel: "30 объявлений",
    priceRub: 14_900,
    slots: 30,
    bestValue: true,
  },
  {
    kind: "auto",
    emoji: "🚗",
    cardTitle: "Авто",
    headline: "Пакет авто",
    slotsLabel: "20 объявлений",
    priceRub: 8_700,
    slots: 20,
  },
  {
    kind: "other",
    emoji: "📦",
    cardTitle: "Общий пакет",
    headline: "Пакет объявлений",
    slotsLabel: "20 объявлений",
    priceRub: 2_500,
    slots: 20,
  },
];

export function packageByKind(kind: string): ListingPackageDef | undefined {
  return LISTING_PACKAGES.find((p) => p.kind === kind);
}

export function parsePackageKind(s: string | undefined | null): PackageKind | null {
  const k = String(s ?? "").trim();
  if (k === "real_estate" || k === "auto" || k === "other") return k;
  return null;
}

/** Категория объявления (id из CATEGORIES) → какой пакет списывается. */
export function listingCategoryToPackageKind(categoryId: string): PackageKind {
  if (categoryId === "realestate") return "real_estate";
  if (categoryId === "auto" || categoryId === "moto") return "auto";
  return "other";
}

/** Есть ли хотя бы один слот пакета для этой категории. */
export function hasListingPackageBalance(
  profile:
    | {
        real_estate_package_count?: number | null;
        auto_package_count?: number | null;
        other_package_count?: number | null;
      }
    | null
    | undefined,
  categoryId: string
): boolean {
  const k = listingCategoryToPackageKind(categoryId);
  if (k === "real_estate") return (profile?.real_estate_package_count ?? 0) > 0;
  if (k === "auto") return (profile?.auto_package_count ?? 0) > 0;
  return (profile?.other_package_count ?? 0) > 0;
}
