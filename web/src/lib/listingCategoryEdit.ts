import type { ListingRow } from "@/lib/types";
import {
  COMMERCIAL_PROPERTY_LABEL,
  COMMERCIAL_SHOPPING_CENTER_LABEL,
  HOUSE_LABEL,
  LAND_PLOT_LABEL,
  LAND_OWNERSHIP_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  normalizeCommercialPremisesLabel,
} from "@/lib/realestateConstants";
import {
  formatPlotAreaForListingFromSotkiString,
  hectaresInputToSotki,
  normalizeDecimalInput,
  parseFlexiblePositiveNumber,
  sotkiToHectaresDisplay,
} from "@/lib/plotAreaSotki";
import type { AutoParamsShape, MotoParamsShape } from "@/lib/listingVehicleForm";
import {
  buildAutoParamsRecord,
  buildAutoSpecsSection,
  buildMotoParamsRecord,
  buildMotoSpecsSection,
  hydrateAutoParamsShape,
  hydrateMotoParamsShape,
  isAutoCatalogTripleComplete,
  mergeDescriptionWithSpecsSection,
  stripSpecsFromDescription,
  validateEngineHp,
  validateEngineVolumeAuto,
  validateEngineVolumeMoto,
} from "@/lib/listingVehicleForm";

export type RealEstateEditParams = {
  propertyType: string;
  commercialPremisesType: string;
  area: string;
  floor: string;
  floorsTotal: string;
  rooms: string;
  parking: string;
  renovation: string;
  plotArea: string;
  plotAreaUnitHa: boolean;
  commercialPowerKw: string;
  commsGas: boolean;
  commsWater: boolean;
  commsLight: boolean;
  commsSewage: boolean;
  commsElectricityDetail: string;
  landType: string;
  landOwnershipStatus: string;
};

export type ElectronicsEditParams = { brand: string; model: string; condition: string };
export type FashionEditParams = {
  itemType: string;
  size: string;
  sizeOther: string;
  condition: string;
};
export type ServicesEditParams = { serviceType: string; priceType: string };
export type KidsEditParams = { itemType: string; age: string; size: string; sizeOther: string };
export type SportEditParams = { itemType: string; condition: string };
export type HomeEditParams = { itemType: string; condition: string };
export type FurnitureEditParams = { itemType: string; condition: string };

export type CategoryEditParams = {
  auto: AutoParamsShape;
  moto: MotoParamsShape;
  realestate: RealEstateEditParams;
  electronics: ElectronicsEditParams;
  fashion: FashionEditParams;
  services: ServicesEditParams;
  kids: KidsEditParams;
  sport: SportEditParams;
  home: HomeEditParams;
  furniture: FurnitureEditParams;
};

export const EMPTY_CATEGORY_EDIT_PARAMS: CategoryEditParams = {
  auto: {
    carBodyClassId: "",
    carBodyClass: "",
    carCountryId: "",
    carBrandId: "",
    carModelId: "",
    brand: "",
    model: "",
    year: "",
    mileage: "",
    owners: "",
    fuel: "",
    transmission: "",
    drive: "",
    enginePowerHp: "",
    engineVolumeL: "",
    customsCleared: "",
    damaged: "",
  },
  moto: {
    bikeType: "",
    engineKind: "",
    engineVolumeL: "",
    mileageKm: "",
    customsCleared: "",
    ownersPts: "",
    enginePowerHp: "",
  },
  realestate: {
    propertyType: "",
    commercialPremisesType: "",
    area: "",
    floor: "",
    floorsTotal: "",
    rooms: "",
    parking: "",
    renovation: "",
    plotArea: "",
    plotAreaUnitHa: false,
    commercialPowerKw: "",
    commsGas: false,
    commsWater: false,
    commsLight: false,
    commsSewage: false,
    commsElectricityDetail: "",
    landType: "",
    landOwnershipStatus: "",
  },
  electronics: { brand: "", model: "", condition: "" },
  fashion: { itemType: "", size: "", sizeOther: "", condition: "" },
  services: { serviceType: "", priceType: "" },
  kids: { itemType: "", age: "", size: "", sizeOther: "" },
  sport: { itemType: "", condition: "" },
  home: { itemType: "", condition: "" },
  furniture: { itemType: "", condition: "" },
};

function parsePositiveKw(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function resolveCommsElectricityColumn(p: RealEstateEditParams): string | null {
  if (p.propertyType === COMMERCIAL_PROPERTY_LABEL) {
    const kw = parsePositiveKw(p.commercialPowerKw);
    if (kw != null) return `${kw} кВт`;
    if (p.commsLight) return "Есть";
    return null;
  }
  if (!p.commsLight) return null;
  return "Есть";
}

export function formatPersistPlotArea(p: RealEstateEditParams): string {
  const t = p.plotArea.trim();
  if (!t) return "";
  if (p.propertyType === LAND_PLOT_LABEL) {
    return formatPlotAreaForListingFromSotkiString(t);
  }
  return t;
}

export function isCommercialShoppingCenter(p: RealEstateEditParams): boolean {
  return (
    p.propertyType === COMMERCIAL_PROPERTY_LABEL &&
    p.commercialPremisesType.trim() === COMMERCIAL_SHOPPING_CENTER_LABEL
  );
}

function parsePositiveAreaM2(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseNonNegativeInt(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePositiveInt(raw: string): number | null {
  const n = parseNonNegativeInt(raw);
  return n != null && n >= 1 ? n : null;
}

type KidsKind = "clothing" | "shoes" | "toy" | "transport_other";

function getKidsItemKind(raw: string): KidsKind | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("одеж")) return "clothing";
  if (t.includes("обув") || t.includes("ботин") || t.includes("кроссов")) return "shoes";
  if (t.includes("игруш")) return "toy";
  if (t.includes("транспорт") || t.includes("коляск") || t.includes("другое")) {
    return "transport_other";
  }
  return null;
}

function kidsShowsSize(kind: KidsKind | null): boolean {
  return kind === "clothing" || kind === "shoes";
}

export function listingIntentFromRow(row: ListingRow): "sale" | "rent" {
  const dt = row.deal_type ?? row.params?.deal_type;
  return dt === "rent" ? "rent" : "sale";
}

export function hydrateRealEstateEditParams(row: ListingRow): RealEstateEditParams {
  const p = row.params ?? {};
  const comm =
    p.communications && typeof p.communications === "object"
      ? (p.communications as Record<string, unknown>)
      : {};
  const electricityCol =
    row.comms_electricity != null && String(row.comms_electricity).trim() !== ""
      ? String(row.comms_electricity).trim()
      : comm.electricity != null
        ? String(comm.electricity).trim()
        : "";

  let commercialPowerKw = "";
  let commsLight = Boolean(row.has_electricity);
  const kwMatch = electricityCol.match(/(\d+(?:[.,]\d+)?)\s*кВт/i);
  if (kwMatch) {
    commercialPowerKw = kwMatch[1]!.replace(",", ".");
    commsLight = true;
  } else if (electricityCol.toLowerCase() === "есть") {
    commsLight = true;
  }

  const hasParking = p.has_parking;
  let parking = "";
  if (hasParking === true) parking = "Да";
  else if (hasParking === false) parking = "Нет";

  const propertyType = String(p.type ?? "").trim();
  const plotFromColumn = row.plot_area?.trim() ?? "";
  const plotFromParams = p.plot_area != null ? String(p.plot_area).trim() : "";
  const plotArea = plotFromColumn || plotFromParams;

  const area =
    p.area_m2 != null && String(p.area_m2).trim() !== ""
      ? String(Math.round(Number(p.area_m2)))
      : "";

  return {
    propertyType,
    commercialPremisesType: normalizeCommercialPremisesLabel(row.commercial_type),
    area,
    floor: p.floor != null ? String(p.floor) : "",
    floorsTotal: p.floors_total != null ? String(p.floors_total) : "",
    rooms: p.rooms != null ? String(p.rooms) : "",
    parking,
    renovation: typeof p.renovation === "string" ? p.renovation : "",
    plotArea,
    plotAreaUnitHa: false,
    commercialPowerKw,
    commsGas: Boolean(row.comms_gas ?? comm.gas),
    commsWater: Boolean(row.comms_water ?? comm.water),
    commsLight,
    commsSewage: Boolean(row.comms_sewage ?? comm.sewage),
    commsElectricityDetail: "",
    landType: row.land_type?.trim() ?? "",
    landOwnershipStatus: row.land_ownership_status?.trim() ?? "",
  };
}

export function hydrateCategoryEditParams(row: ListingRow): CategoryEditParams {
  const base = structuredClone(EMPTY_CATEGORY_EDIT_PARAMS);
  const cat = String(row.category ?? "").trim();
  const p = row.params ?? {};

  if (cat === "auto") {
    base.auto = hydrateAutoParamsShape(row);
  } else if (cat === "moto") {
    base.moto = hydrateMotoParamsShape(row);
  } else if (cat === "realestate") {
    base.realestate = hydrateRealEstateEditParams(row);
  } else if (cat === "electronics") {
    base.electronics = {
      brand: String(p.brand ?? ""),
      model: String(p.model ?? ""),
      condition: String(p.condition ?? ""),
    };
  } else if (cat === "fashion") {
    const sz = p.size;
    const sizeStr =
      typeof sz === "number" && Number.isFinite(sz)
        ? String(sz)
        : sz != null
          ? String(sz)
          : "";
    base.fashion = {
      itemType: String(p.type ?? ""),
      size: sizeStr === "__other__" ? "__other__" : sizeStr,
      sizeOther: "",
      condition: String(p.condition ?? ""),
    };
  } else if (cat === "services") {
    base.services = {
      serviceType: String(p.service_type ?? ""),
      priceType: String(p.price_type ?? ""),
    };
  } else if (cat === "kids") {
    const sz = p.size;
    const sizeStr =
      typeof sz === "number" && Number.isFinite(sz)
        ? String(sz)
        : sz != null
          ? String(sz)
          : "";
    base.kids = {
      itemType: String(p.item_type ?? ""),
      age: String(p.age ?? ""),
      size: sizeStr === "__other__" ? "__other__" : sizeStr,
      sizeOther: "",
    };
  } else if (cat === "sport") {
    base.sport = {
      itemType: String(p.item_type ?? ""),
      condition: String(p.condition ?? ""),
    };
  } else if (cat === "home") {
    base.home = {
      itemType: String(p.item_type ?? ""),
      condition: String(p.condition ?? ""),
    };
  } else if (cat === "furniture") {
    base.furniture = {
      itemType: String(p.item_type ?? ""),
      condition: String(p.condition ?? ""),
    };
  }

  return base;
}

export function buildSpecsSectionForCategoryEdit(
  category: string,
  categoryParams: CategoryEditParams,
  listingIntent: "sale" | "rent",
): string {
  const specs: Array<[string, string]> = [];
  if (category === "realestate") {
    const p = categoryParams.realestate;
    specs.push(
      ["Сделка", listingIntent === "rent" ? "Аренда" : "Продажа"],
      ["Тип", p.propertyType],
    );
    if (p.propertyType === COMMERCIAL_PROPERTY_LABEL && p.commercialPremisesType.trim()) {
      specs.push(["Тип помещения", p.commercialPremisesType]);
    }
    if (p.propertyType === LAND_PLOT_LABEL) {
      specs.push(["Площадь участка", formatPersistPlotArea(p)]);
      const purposeLabel =
        LAND_PURPOSE_OPTIONS.find((o) => o.value === p.landType)?.label ?? p.landType;
      if (purposeLabel.trim()) specs.push(["Вид участка", purposeLabel]);
      if (p.landOwnershipStatus.trim()) {
        specs.push(["Статус собственности", p.landOwnershipStatus]);
      }
    } else if (p.propertyType === HOUSE_LABEL) {
      specs.push(["Площадь дома (м2)", p.area]);
      specs.push(["Площадь участка", p.plotArea]);
    } else {
      specs.push(["Площадь (м2)", p.area]);
    }
    if (p.propertyType === COMMERCIAL_PROPERTY_LABEL) {
      const kw = parsePositiveKw(p.commercialPowerKw);
      if (kw != null) specs.push(["Мощность", `${kw} кВт`]);
    }
    if (p.propertyType !== LAND_PLOT_LABEL) {
      if (!isCommercialShoppingCenter(p)) {
        specs.push(["Этаж", p.floor]);
      }
      specs.push(["Этажность здания", p.floorsTotal]);
      if (p.propertyType !== COMMERCIAL_PROPERTY_LABEL) {
        specs.push(["Количество комнат", p.rooms]);
      }
      specs.push(["Парковка", p.parking], ["Ремонт", p.renovation]);
    }
    if (p.commsGas) specs.push(["Газ", "Есть"]);
    if (p.commsWater) specs.push(["Вода", "Есть"]);
    if (p.commsLight) specs.push(["Электричество", "Есть"]);
    if (p.commsSewage) specs.push(["Канализация", "Есть"]);
  }
  if (category === "electronics") {
    const p = categoryParams.electronics;
    specs.push(["Бренд", p.brand], ["Модель", p.model], ["Состояние", p.condition]);
  }
  if (category === "fashion") {
    const p = categoryParams.fashion;
    const resolvedSize =
      p.size === "__other__" ? p.sizeOther.trim() : p.size.trim();
    specs.push(["Тип", p.itemType], ["Размер", resolvedSize], ["Состояние", p.condition]);
  }
  if (category === "services") {
    const p = categoryParams.services;
    specs.push(["Тип услуги", p.serviceType], ["Цена", p.priceType]);
  }
  if (category === "kids") {
    const p = categoryParams.kids;
    const kind = getKidsItemKind(p.itemType);
    specs.push(["Тип товара", p.itemType]);
    if (p.age.trim()) specs.push(["Возраст", p.age]);
    if (kind && kidsShowsSize(kind)) {
      const resolved =
        p.size === "__other__" ? p.sizeOther.trim() : p.size.trim();
      if (resolved) specs.push(["Размер", resolved]);
    }
  }
  if (category === "sport") {
    const p = categoryParams.sport;
    specs.push(["Тип товара", p.itemType], ["Состояние", p.condition]);
  }
  if (category === "home") {
    const p = categoryParams.home;
    specs.push(["Тип товара", p.itemType], ["Состояние", p.condition]);
  }
  if (category === "furniture") {
    const p = categoryParams.furniture;
    specs.push(["Тип товара", p.itemType], ["Состояние", p.condition]);
  }

  const filled = specs
    .map(([label, value]) => [label, String(value ?? "").trim()] as const)
    .filter(([, value]) => value.length > 0);
  if (filled.length === 0) return "";
  const lines = filled.map(([label, value]) => `- ${label}: ${value}`).join("\n");
  return `Характеристики:\n${lines}`;
}

export function mergeDescriptionWithCategorySpecs(
  rawDescription: string,
  category: string,
  categoryParams: CategoryEditParams,
  listingIntent: "sale" | "rent",
): string {
  const block = buildSpecsSectionForCategoryEdit(category, categoryParams, listingIntent);
  if (category === "auto") {
    return mergeDescriptionWithSpecsSection(rawDescription, buildAutoSpecsSection(categoryParams.auto));
  }
  if (category === "moto") {
    return mergeDescriptionWithSpecsSection(rawDescription, buildMotoSpecsSection(categoryParams.moto));
  }
  if (!block) return stripSpecsFromDescription(rawDescription).trimEnd();
  return mergeDescriptionWithSpecsSection(rawDescription, block);
}

function toIntOrNull(raw: string): number | null {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}

function toBoolOrNull(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "да" || normalized === "true") return true;
  if (normalized === "нет" || normalized === "false") return false;
  return null;
}

export function validateCategoryEditForm(
  category: string,
  categoryParams: CategoryEditParams,
  listingIntent: "sale" | "rent",
): string | null {
  if (category === "auto") {
    const p = categoryParams.auto;
    if (
      !isAutoCatalogTripleComplete(p) ||
      !p.brand.trim() ||
      !p.model.trim() ||
      !p.year.trim() ||
      !p.mileage.trim()
    ) {
      return "Выберите страну, марку и модель из каталога и заполните год и пробег";
    }
    const hpErr = validateEngineHp(p.enginePowerHp);
    if (hpErr) return hpErr;
    const volErr = validateEngineVolumeAuto(p.engineVolumeL);
    if (volErr) return volErr;
    return null;
  }
  if (category === "moto") {
    const p = categoryParams.moto;
    if (!p.bikeType.trim() || !p.engineKind.trim() || !p.mileageKm.trim()) {
      return "Заполните тип мотоцикла, двигатель и пробег";
    }
    const hpErr = validateEngineHp(p.enginePowerHp);
    if (hpErr) return hpErr;
    const volErr = validateEngineVolumeMoto(p.engineVolumeL);
    if (volErr) return volErr;
    return null;
  }
  if (category === "realestate") {
    const p = categoryParams.realestate;
    if (!p.propertyType.trim()) return "Выберите тип недвижимости";
    const isLand = p.propertyType === LAND_PLOT_LABEL;
    const isHouse = p.propertyType === HOUSE_LABEL;
    const isCommercial = p.propertyType === COMMERCIAL_PROPERTY_LABEL;
    const isShoppingCenterCommercial = isCommercialShoppingCenter(p);

    if (!isLand) {
      const areaNum = parsePositiveAreaM2(p.area);
      if (areaNum === null) {
        return isHouse
          ? "Укажите корректную площадь дома (м²), число больше нуля"
          : "Укажите корректную площадь (м²), число больше нуля";
      }
    }

    if (isHouse || isLand) {
      if (!p.plotArea.trim()) return "Укажите площадь участка";
    }

    if (isLand) {
      if (parseFlexiblePositiveNumber(p.plotArea) == null) {
        return "Укажите площадь участка числом больше нуля (сотки)";
      }
      if (!p.landType.trim()) return "Выберите вид участка";
      if (!p.landOwnershipStatus.trim()) return "Укажите статус собственности";
    }

    if (isCommercial && !p.commercialPremisesType.trim()) {
      return "Выберите тип помещения";
    }

    if (!isLand && !isCommercial) {
      const floor = parseNonNegativeInt(p.floor);
      const floorsTotal = parsePositiveInt(p.floorsTotal);
      if (floor === null) return "Укажите этаж (целое число ≥ 0)";
      if (floorsTotal === null) return "Укажите этажность здания (целое число от 1)";
      if (floorsTotal < floor) return "Этажность здания не может быть меньше номера этажа";
    }

    if (!isLand && isShoppingCenterCommercial) {
      const floorsTotal = parsePositiveInt(p.floorsTotal);
      if (floorsTotal === null) return "Укажите этажность здания (целое число от 1)";
    }

    if (listingIntent === "rent" && !isLand && !isCommercial) {
      const rooms = parseNonNegativeInt(p.rooms);
      if (rooms === null) return "Укажите количество комнат (целое число ≥ 0)";
    }
    return null;
  }
  if (category === "electronics") {
    const p = categoryParams.electronics;
    if (!p.brand.trim() || !p.model.trim() || !p.condition.trim()) {
      return "Заполните бренд, модель и состояние";
    }
    return null;
  }
  if (category === "fashion") {
    const p = categoryParams.fashion;
    const resolvedSize =
      p.size === "__other__" ? p.sizeOther.trim() : p.size.trim();
    if (!p.itemType.trim() || !resolvedSize || !p.condition.trim()) {
      return "Заполните тип, размер и состояние";
    }
    if (p.itemType === "Обувь" && !/^\d+$/.test(resolvedSize)) {
      return "Для обуви размер должен быть числом";
    }
    return null;
  }
  if (category === "services") {
    const p = categoryParams.services;
    if (!p.serviceType.trim() || !p.priceType.trim()) {
      return "Заполните тип услуги и формат цены";
    }
    return null;
  }
  if (category === "kids") {
    const p = categoryParams.kids;
    if (!p.itemType.trim()) return "Укажите тип товара";
    const kind = getKidsItemKind(p.itemType);
    if (kind === "toy" && !p.age.trim()) return "Для игрушки укажите возраст";
    if (kidsShowsSize(kind)) {
      const resolved =
        p.size === "__other__" ? p.sizeOther.trim() : p.size.trim();
      if (!resolved) return "Укажите размер";
      if (kind === "shoes" && !/^\d+$/.test(resolved)) {
        return "Для обуви размер должен быть числом";
      }
    }
    return null;
  }
  if (category === "sport") {
    const p = categoryParams.sport;
    if (!p.itemType.trim() || !p.condition.trim()) return "Заполните тип товара и состояние";
    return null;
  }
  if (category === "home") {
    const p = categoryParams.home;
    if (!p.itemType.trim() || !p.condition.trim()) return "Заполните тип товара и состояние";
    return null;
  }
  if (category === "furniture") {
    const p = categoryParams.furniture;
    if (!p.itemType.trim() || !p.condition.trim()) return "Заполните тип товара и состояние";
    return null;
  }
  return null;
}

export function buildParamsRecordForCategoryEdit(
  category: string,
  categoryParams: CategoryEditParams,
  listingIntent: "sale" | "rent",
  priceRaw: string,
): Record<string, unknown> | null {
  const normalizedPrice = toIntOrNull(priceRaw);
  if (category === "auto") {
    return buildAutoParamsRecord(categoryParams.auto, normalizedPrice);
  }
  if (category === "moto") {
    return buildMotoParamsRecord(categoryParams.moto, normalizedPrice);
  }
  if (category === "realestate") {
    const p = categoryParams.realestate;
    const isLand = p.propertyType === LAND_PLOT_LABEL;
    const isCommercial = p.propertyType === COMMERCIAL_PROPERTY_LABEL;
    const areaNum = isLand ? null : parsePositiveAreaM2(p.area);
    const area_m2 = areaNum != null ? Math.round(areaNum) : null;
    const commercialType =
      isCommercial ? p.commercialPremisesType.trim() || null : null;
    const plotPersist =
      isLand ? formatPersistPlotArea(p) : p.plotArea.trim();
    const electricityCol = resolveCommsElectricityColumn(p);
    const landTypeTrim = isLand ? p.landType.trim() || null : null;
    const landOwnTrim = isLand ? p.landOwnershipStatus.trim() || null : null;
    const isShoppingCenterCommercial = isCommercialShoppingCenter(p);
    return {
      type: p.propertyType.trim() || null,
      commercial_type: commercialType,
      deal_type: listingIntent,
      area_m2,
      plot_area: plotPersist || null,
      land_type: landTypeTrim,
      land_ownership_status: landOwnTrim,
      floor: isLand || isShoppingCenterCommercial ? null : toIntOrNull(p.floor),
      floors_total: isLand ? null : toIntOrNull(p.floorsTotal),
      rooms: isLand || isCommercial ? null : toIntOrNull(p.rooms),
      price: normalizedPrice,
      has_parking: isLand ? null : toBoolOrNull(p.parking),
      renovation: isLand ? null : p.renovation.trim() || null,
      communications: {
        gas: p.commsGas,
        water: p.commsWater,
        light: p.commsLight,
        sewage: p.commsSewage,
        electricity: electricityCol,
      },
    };
  }
  if (category === "electronics") {
    const p = categoryParams.electronics;
    return {
      brand: p.brand.trim() || null,
      model: p.model.trim() || null,
      price: normalizedPrice,
      condition: p.condition.trim() || null,
    };
  }
  if (category === "fashion") {
    const p = categoryParams.fashion;
    const resolvedSize =
      p.size === "__other__" ? p.sizeOther.trim() : p.size.trim();
    const sizeValue =
      p.itemType === "Обувь"
        ? toIntOrNull(resolvedSize)
        : resolvedSize || null;
    return {
      type: p.itemType.trim() || null,
      size: sizeValue,
      price: normalizedPrice,
      condition: p.condition.trim() || null,
    };
  }
  if (category === "services") {
    const p = categoryParams.services;
    return {
      service_type: p.serviceType.trim() || null,
      price: normalizedPrice,
      price_type: p.priceType.trim() || null,
    };
  }
  if (category === "kids") {
    const p = categoryParams.kids;
    const kind = getKidsItemKind(p.itemType);
    const base: Record<string, unknown> = {
      item_type: p.itemType.trim() || null,
      age: p.age.trim() || null,
      price: normalizedPrice,
    };
    if (kind && kidsShowsSize(kind)) {
      const resolved =
        p.size === "__other__" ? p.sizeOther.trim() : p.size.trim();
      const parsedKidsSize = toIntOrNull(resolved);
      base.size = parsedKidsSize ?? (resolved || null);
    }
    return base;
  }
  if (category === "sport") {
    const p = categoryParams.sport;
    return {
      item_type: p.itemType.trim() || null,
      price: normalizedPrice,
      condition: p.condition.trim() || null,
    };
  }
  if (category === "home") {
    const p = categoryParams.home;
    return {
      item_type: p.itemType.trim() || null,
      price: normalizedPrice,
      condition: p.condition.trim() || null,
    };
  }
  if (category === "furniture") {
    const p = categoryParams.furniture;
    return {
      item_type: p.itemType.trim() || null,
      price: normalizedPrice,
      condition: p.condition.trim() || null,
    };
  }
  return {};
}

export function buildRealEstateColumnExtras(
  p: RealEstateEditParams,
  listingIntent: "sale" | "rent",
): Record<string, unknown> {
  const electricityCol = resolveCommsElectricityColumn(p);
  const isLand = p.propertyType === LAND_PLOT_LABEL;
  const plotPersist =
    isLand ? formatPersistPlotArea(p) : p.plotArea.trim();
  return {
    commercial_type:
      p.propertyType === COMMERCIAL_PROPERTY_LABEL
        ? p.commercialPremisesType.trim() || null
        : null,
    plot_area: plotPersist || null,
    land_type: isLand ? p.landType.trim() || null : null,
    land_ownership_status: isLand ? p.landOwnershipStatus.trim() || null : null,
    comms_gas: p.commsGas,
    comms_water: p.commsWater,
    comms_electricity: electricityCol,
    comms_sewage: p.commsSewage,
    has_gas: p.commsGas,
    has_water: p.commsWater,
    has_electricity: Boolean(electricityCol),
    has_sewage: p.commsSewage,
    deal_type: listingIntent,
  };
}

export function clearVehicleColumnsPatch(): Record<string, unknown> {
  return {
    engine_power: null,
    engine_volume: null,
    moto_type: null,
    moto_engine: null,
    moto_mileage: null,
    moto_customs_cleared: null,
    moto_owners_pts: null,
  };
}

export function clearRealEstateColumnsPatch(): Record<string, unknown> {
  return {
    commercial_type: null,
    plot_area: null,
    land_type: null,
    land_ownership_status: null,
    comms_gas: false,
    comms_water: false,
    comms_electricity: null,
    comms_sewage: false,
    has_gas: false,
    has_water: false,
    has_electricity: false,
    has_sewage: false,
  };
}

export {
  COMMERCIAL_PREMISES_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  LAND_OWNERSHIP_OPTIONS,
  HOUSE_LABEL,
  LAND_PLOT_LABEL,
  COMMERCIAL_PROPERTY_LABEL,
  COMMERCIAL_SHOPPING_CENTER_LABEL,
} from "@/lib/realestateConstants";
export {
  hectaresInputToSotki,
  normalizeDecimalInput,
  parseFlexiblePositiveNumber,
  sotkiToHectaresDisplay,
} from "@/lib/plotAreaSotki";
