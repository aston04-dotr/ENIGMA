import type { ListingRow } from "./types";

export type AutoParamsShape = {
  brand: string;
  model: string;
  year: string;
  mileage: string;
  owners: string;
  fuel: string;
  transmission: string;
  drive: string;
  enginePowerHp: string;
  engineVolumeL: string;
  customsCleared: string;
  damaged: string;
};

export type MotoParamsShape = {
  bikeType: string;
  engineKind: string;
  engineVolumeL: string;
  mileageKm: string;
  customsCleared: string;
  ownersPts: string;
  enginePowerHp: string;
};

export const SPECS_MARKER = "\n\nХарактеристики:\n";

export function stripSpecsFromDescription(desc: string): string {
  const idx = desc.indexOf(SPECS_MARKER);
  if (idx < 0) return desc;
  return desc.slice(0, idx).trimEnd();
}

export function mergeDescriptionWithSpecsSection(desc: string, specsSection: string): string {
  const base = stripSpecsFromDescription(desc).trimEnd();
  const specs = specsSection.trim();
  if (!specs) return base;
  return base ? `${base}\n\n${specs}` : specs;
}

function formatSpecsBlock(pairs: Array<[string, string]>): string {
  const filled = pairs
    .map(([lbl, val]) => [lbl, String(val ?? "").trim()] as const)
    .filter(([, val]) => val.length > 0);
  if (filled.length === 0) return "";
  const lines = filled.map(([lbl, val]) => `- ${lbl}: ${val}`).join("\n");
  return `Характеристики:\n${lines}`;
}

export function buildAutoSpecsSection(p: AutoParamsShape): string {
  return formatSpecsBlock([
    ["Марка", p.brand],
    ["Модель", p.model],
    ["Год выпуска", p.year],
    ["Пробег (км)", p.mileage],
    ["Количество владельцев", p.owners],
    ["Тип топлива", p.fuel],
    ["Коробка передач", p.transmission],
    ["Привод", p.drive],
    ["Мощность (л.с.)", p.enginePowerHp],
    ["Объем (л)", p.engineVolumeL],
    ["Растаможен", p.customsCleared],
    ["Битый", p.damaged],
  ]);
}

export function buildMotoSpecsSection(p: MotoParamsShape): string {
  return formatSpecsBlock([
    ["Тип", p.bikeType],
    ["Двигатель", p.engineKind],
    ["Объем (л)", p.engineVolumeL],
    ["Пробег (км)", p.mileageKm],
    ["Растаможен", p.customsCleared],
    ["Владельцев по ПТС", p.ownersPts],
    ["Мощность (л.с.)", p.enginePowerHp],
  ]);
}

function paramStr(params: Record<string, unknown> | null | undefined, key: string): string {
  if (!params) return "";
  const v = params[key];
  return v == null ? "" : String(v).trim();
}

function daNetFromBool(b: unknown): string {
  if (b === true) return "Да";
  if (b === false) return "Нет";
  return "";
}

export function hydrateAutoParamsShape(row: ListingRow): AutoParamsShape {
  const p = row.params ?? {};
  const g = (key: string) => paramStr(p, key);

  let owners = "";
  const ow = p.owners;
  if (typeof ow === "number" && Number.isFinite(ow)) {
    owners = ow >= 3 ? "3" : String(Math.round(ow));
  } else {
    const s = g("owners");
    owners = s === "3+" ? "3" : /^\d+$/.test(s) ? s : s.startsWith("3") ? "3" : s;
  }

  return {
    brand: g("brand"),
    model: g("model"),
    year: g("year"),
    mileage: g("mileage"),
    owners,
    fuel: g("fuel"),
    transmission: g("transmission"),
    drive: g("drive"),
    enginePowerHp: row.engine_power?.trim() || paramStr(p, "engine_power"),
    engineVolumeL: row.engine_volume?.trim() || paramStr(p, "engine_volume"),
    customsCleared: daNetFromBool(p.is_cleared) || g("customs_cleared"),
    damaged: daNetFromBool(p.is_damaged),
  };
}

export function hydrateMotoParamsShape(row: ListingRow): MotoParamsShape {
  const p = row.params ?? {};
  const g = (key: string) => paramStr(p, key);

  const customs =
    row.moto_customs_cleared?.trim() || daNetFromBool(p.is_cleared) || g("moto_customs_cleared");

  return {
    bikeType: row.moto_type?.trim() || g("moto_type"),
    engineKind: row.moto_engine?.trim() || g("moto_engine"),
    engineVolumeL: row.engine_volume?.trim() || g("engine_volume"),
    mileageKm: row.moto_mileage?.trim() || g("mileage_km"),
    customsCleared: customs,
    ownersPts: row.moto_owners_pts?.trim() || g("owners_pts"),
    enginePowerHp: row.engine_power?.trim() || g("engine_power"),
  };
}

export function toIntOrNull(raw: string): number | null {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}

export function toBoolOrNull(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "да" || normalized === "true") return true;
  if (normalized === "нет" || normalized === "false") return false;
  return null;
}

export function buildAutoParamsRecord(
  p: AutoParamsShape,
  normalizedPrice: number | null,
): Record<string, unknown> {
  return {
    brand: p.brand.trim() || null,
    model: p.model.trim() || null,
    year: toIntOrNull(p.year),
    mileage: toIntOrNull(p.mileage),
    owners: toIntOrNull(p.owners),
    price: normalizedPrice,
    fuel: p.fuel.trim() || null,
    transmission: p.transmission.trim() || null,
    drive: p.drive.trim() || null,
    engine_power: p.enginePowerHp.trim() || null,
    engine_volume: p.engineVolumeL.trim() || null,
    is_cleared: toBoolOrNull(p.customsCleared),
    is_damaged: toBoolOrNull(p.damaged),
  };
}

export function buildMotoParamsRecord(
  p: MotoParamsShape,
  normalizedPrice: number | null,
): Record<string, unknown> {
  return {
    moto_type: p.bikeType.trim() || null,
    moto_engine: p.engineKind.trim() || null,
    mileage_km: p.mileageKm.trim() || null,
    owners_pts: p.ownersPts.trim() || null,
    engine_power: p.enginePowerHp.trim() || null,
    engine_volume: p.engineVolumeL.trim() || null,
    is_cleared: toBoolOrNull(p.customsCleared),
    price: normalizedPrice,
  };
}

export function parseEngineHpNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseEngineVolumeLiters(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function validateEngineHp(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseEngineHpNumber(t);
  if (n == null) return "Мощность: укажите число";
  if (n <= 0 || n > 1500) return "Мощность: допустимо от 1 до 1500 л.с.";
  return null;
}

export function validateEngineVolumeAuto(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseEngineVolumeLiters(t);
  if (n == null) return "Объём двигателя: укажите число";
  if (n <= 0 || n > 8) return "Объём: допустимо до 8 л";
  return null;
}

export function validateEngineVolumeMoto(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseEngineVolumeLiters(t);
  if (n == null) return "Объём двигателя: укажите число";
  if (n <= 0 || n > 2.5) return "Объём: допустимо до 2.5 л";
  return null;
}
