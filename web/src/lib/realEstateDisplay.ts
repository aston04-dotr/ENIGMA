import type { ListingRow } from "./types";

/** Одна строка для карточки / шапки объявления по недвижимости. */
export function formatRealEstateListingFacts(row: ListingRow): string | null {
  if (row.category !== "realestate") return null;
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
  if (landType) parts.push(landType);
  if (landOwn) parts.push(landOwn);
  if (row.comms_gas === true) parts.push("газ");
  if (row.comms_water === true) parts.push("вода");
  if (commsElec) parts.push(commsElec);
  if (row.comms_sewage === true) parts.push("канализация");
  return parts.length > 0 ? parts.join(" · ") : null;
}
