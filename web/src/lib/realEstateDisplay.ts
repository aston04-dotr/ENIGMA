import type { ListingRow } from "./types";

/**
 * Коды из формы создания → развёрнутый текст для блока характеристик
 * (на странице объявления). В ленте показывается короткий код (compact).
 */
const LAND_TYPE_LABELS: Record<string, string> = {
  ИЖС: "ИЖС (Индивидуальное жилищное строительство)",
  ЛПХ: "ЛПХ (Личное подсобное хозяйство)",
  "СНТ / ДНП": "СНТ / ДНП (Садоводство и дачи)",
  Промназначение: "Промназначение (Земли промышленности)",
  Сельхозназначение: "Сельхозназначение (СХ)",
  КФХ: "КФХ (Крестьянское фермерское хозяйство)",
};

export type FormatRealEstateListingFactsOptions = {
  /** Короткие коды земли и без длинных скобок — для карточки ленты (line-clamp). */
  compact?: boolean;
};

function resolveLandTypeDisplay(stored: string, compact: boolean): string {
  const code = stored.trim();
  if (!code) return "";
  if (compact) return code;
  return LAND_TYPE_LABELS[code] ?? code;
}

/** Показывать вид участка и статус права только для земли, без дублей с типом «Квартира» и т.п. */
function shouldShowLandDetails(
  typeLabel: string,
  landType: string,
  landOwn: string,
): boolean {
  if (typeLabel === "Участок") return true;
  if (landType.length === 0 && landOwn.length === 0) return false;
  // Запасной случай: колонки заполнены, а в params.type ещё пусто
  if (!typeLabel) return true;
  return false;
}

function formatElectricityPart(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s === "Есть") return "электричество";
  return `электричество (${s})`;
}

function pushCommunicationsLine(parts: string[], row: ListingRow, commsElectricityRaw: string): void {
  const bits: string[] = [];
  if (row.comms_gas === true) bits.push("газ");
  if (row.comms_water === true) bits.push("вода");
  const elec = formatElectricityPart(commsElectricityRaw);
  if (elec) bits.push(elec);
  if (row.comms_sewage === true) bits.push("канализация");
  if (bits.length === 0) return;
  parts.push(`Коммуникации: ${bits.join(", ")}`);
}

/** Одна строка для карточки / шапки объявления по недвижимости. */
export function formatRealEstateListingFacts(
  row: ListingRow,
  opts?: FormatRealEstateListingFactsOptions,
): string | null {
  if (row.category !== "realestate") return null;
  const compact = opts?.compact === true;

  const params =
    row.params && typeof row.params === "object"
      ? (row.params as Record<string, unknown>)
      : {};
  const typeLabel = String(params.type ?? "").trim();
  const areaRaw = params.area_m2;
  let areaM2: number | null = null;
  if (typeof areaRaw === "number" && Number.isFinite(areaRaw)) {
    areaM2 = Math.round(areaRaw);
  } else if (typeof areaRaw === "string" && /^\d+$/.test(areaRaw.trim())) {
    const n = Number.parseInt(areaRaw.trim(), 10);
    if (Number.isFinite(n)) areaM2 = n;
  }
  const plot = String(row.plot_area ?? params.plot_area ?? "").trim();
  const landType = String(row.land_type ?? params.land_type ?? "").trim();
  const landOwn = String(row.land_ownership_status ?? params.land_ownership_status ?? "").trim();
  const commsElec = String(row.comms_electricity ?? "").trim();

  const parts: string[] = [];
  if (typeLabel) parts.push(typeLabel);
  if (areaM2 != null && areaM2 > 0) parts.push(`${areaM2} м²`);
  if (plot) parts.push(`участок ${plot}`);

  const landBlock = shouldShowLandDetails(typeLabel, landType, landOwn);
  if (landBlock) {
    if (landType) {
      const vis = resolveLandTypeDisplay(landType, compact);
      if (vis) parts.push(`Вид: ${vis}`);
    }
    if (landOwn) parts.push(`Статус: ${landOwn}`);
  }

  pushCommunicationsLine(parts, row, commsElec);

  return parts.length > 0 ? parts.join(" · ") : null;
}
