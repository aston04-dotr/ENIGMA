"use client";

import { useAuth } from "@/context/auth-context";
import { CATEGORIES } from "@/lib/categories";
import { insertListingRow, getCitiesFromDb } from "@/lib/listings";
import { getListingPublishBlockMessage } from "@/lib/trustPublishGate";
import { canEditListingsAndListingPhotos, getTrustLevel } from "@/lib/trustLevels";
import { registerRapidListingCreated } from "@/lib/trust";
import { uploadListingPhotoWeb } from "@/lib/storageUploadWeb";
import { removeListingImagesFromStorage } from "@/lib/storageUploadWeb";
import { getMaxListingPhotos } from "@/lib/runtimeConfig";
import { getSupabaseRestWithSession, supabase } from "@/lib/supabase";
import { logRlsIfBlocked } from "@/lib/postgrestErrors";
import { parseNonNegativePrice } from "@/lib/validate";
import { ALLOWED_LISTING_CITIES, isAllowedListingCity } from "@/lib/russianCities";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { trackEvent } from "@/lib/analytics";
import {
  formatPlotAreaForListingFromSotkiString,
  hectaresInputToSotki,
  normalizeDecimalInput,
  parseFlexiblePositiveNumber,
  sotkiToHectaresDisplay,
} from "@/lib/plotAreaSotki";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CreatableSelect from "react-select/creatable";
import type { SingleValue } from "react-select";
import Select from "react-select";

function parseUnknownError(error: unknown): string {
  if (!error) return "Не удалось создать объявление. Попробуй снова.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Не удалось создать объявление. Попробуй снова.";
  if (typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
    try {
      const asJson = JSON.stringify(error);
      if (asJson && asJson !== "{}") return asJson;
    } catch {
      return "Не удалось создать объявление. Попробуй снова.";
    }
  }
  return "Не удалось создать объявление. Попробуй снова.";
}

const inputClass =
  "w-full min-h-[48px] rounded-card border border-line bg-elevated px-4 text-fg placeholder:text-muted/60 transition-colors duration-ui focus:outline-none focus:ring-2 focus:ring-accent/35";

const MAX_LISTING_PHOTOS = Math.min(10, Math.max(1, getMaxListingPhotos()));
const CREATE_FORM_STORAGE_KEY = "create_form";
/** Совпадает с ключом ленты (`page.tsx`): фильтры недвижимости для префилла «Снять». */
const FEED_SESSION_STORAGE_KEY = "feed_state";

const AUTO_ENGINE_VOLUME_PRESETS = [
  "1.0",
  "1.2",
  "1.4",
  "1.5",
  "1.6",
  "1.8",
  "2.0",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.4",
  "5.0",
  "5.5",
  "6.0",
  "6.7",
] as const;

const AUTO_ENGINE_POWER_PRESETS = [
  "75",
  "90",
  "100",
  "109",
  "120",
  "125",
  "136",
  "150",
  "156",
  "163",
  "174",
  "180",
  "190",
  "200",
  "211",
  "218",
  "224",
  "249",
  "275",
  "300",
  "340",
  "400",
  "450",
  "510",
  "550",
] as const;

type AutoComboOption = { value: string; label: string };

const AUTO_VOLUME_OPTIONS: AutoComboOption[] = AUTO_ENGINE_VOLUME_PRESETS.map((v) => ({
  value: v,
  label: `${v} л`,
}));

const AUTO_HP_OPTIONS: AutoComboOption[] = AUTO_ENGINE_POWER_PRESETS.map((v) => ({
  value: v,
  label: `${v} л.с.`,
}));

function AutoEngineCreatable({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly AutoComboOption[];
  placeholder: string;
}) {
  const trimmed = value.trim();
  const selected: AutoComboOption | null = trimmed
    ? options.some((o) => o.value === trimmed)
      ? options.find((o) => o.value === trimmed)!
      : { value: trimmed, label: trimmed }
    : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</label>
      <CreatableSelect<AutoComboOption, false>
        className="react-select-container"
        classNamePrefix="react-select"
        placeholder={placeholder}
        isClearable
        options={[...options]}
        value={selected}
        formatCreateLabel={(inputValue) => `Добавить «${inputValue}»`}
        onChange={(opt: SingleValue<AutoComboOption>) => {
          onChange(String(opt?.value ?? "").trim());
        }}
      />
    </div>
  );
}

type AutoParams = {
  brand: string;
  model: string;
  year: string;
  mileage: string;
  owners: string;
  fuel: string;
  transmission: string;
  drive: string;
  /** Мощность, л.с. — пресет или свой текст */
  enginePowerHp: string;
  /** Объём двигателя, л — пресет или свой текст */
  engineVolumeL: string;
  customsCleared: string;
  damaged: string;
};

type RealEstateParams = {
  propertyType: string;
  commercialPremisesType: string;
  area: string;
  floor: string;
  floorsTotal: string;
  rooms: string;
  parking: string;
  renovation: string;
  /** Площадь участка: для «Участок» — число соток (строка); отображение может быть в га. */
  plotArea: string;
  /** Участок: ввод площади в гектарах (значение plotArea всё равно в сотках). */
  plotAreaUnitHa: boolean;
  /** Коммерция: электромощность кВт (необязательно, все подтипы). */
  commercialPowerKw: string;
  commsGas: boolean;
  commsWater: boolean;
  /** Электроснабжение → колонка `comms_electricity` (есть / текст мощности). */
  commsLight: boolean;
  commsSewage: boolean;
  /** Уточнение для света, напр. «15 кВт» (при включённом «Свет»). */
  commsElectricityDetail: string;
  /** Участок: вид разрешённого использования (код из списка). */
  landType: string;
  /** Участок: собственность / аренда / субаренда. */
  landOwnershipStatus: string;
};

type ElectronicsParams = { brand: string; model: string; condition: string };
type FashionParams = {
  itemType: string;
  size: string;
  sizeOther: string;
  condition: string;
};
type ServicesParams = { serviceType: string; priceType: string };
type KidsParams = { itemType: string; age: string; size: string; sizeOther: string };
type SportParams = { itemType: string; condition: string };
type HomeParams = { itemType: string; condition: string };

type CategoryFormParams = {
  auto: AutoParams;
  realestate: RealEstateParams;
  electronics: ElectronicsParams;
  fashion: FashionParams;
  services: ServicesParams;
  kids: KidsParams;
  sport: SportParams;
  home: HomeParams;
};

const EMPTY_CATEGORY_PARAMS: CategoryFormParams = {
  auto: {
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
};

const KIDS_SIZE_OPTIONS = [
  "50",
  "56",
  "62",
  "68",
  "74",
  "80",
  "86",
  "92",
  "98",
  "104",
  "110",
  "116",
  "122",
  "128",
  "134",
  "140",
  "146",
  "152",
  "158",
  "164",
] as const;

const FASHION_CLOTHING_SIZE_OPTIONS = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
] as const;

const KIDS_SHOE_SIZE_OPTIONS = Array.from({ length: 14 }, (_, idx) => String(35 + idx));

const COMMERCIAL_PROPERTY_LABEL = "Коммерческая";

/** Отдельное здание целиком — без поля «Этаж». */
const COMMERCIAL_SHOPPING_CENTER_LABEL = "Торговый центр";

const COMMERCIAL_PREMISES_OPTIONS = [
  "Офис",
  "Склад",
  "ПСН",
  "Торговый центр",
  "Производство",
  "Общепит",
  "Гостиница",
] as const;

const HOUSE_LABEL = "Дом";
const LAND_PLOT_LABEL = "Участок";

const LAND_PURPOSE_OPTIONS = [
  { value: "ИЖС", label: "ИЖС (Индивидуальное жилищное строительство)" },
  { value: "ЛПХ", label: "ЛПХ (Личное подсобное хозяйство)" },
  { value: "СНТ / ДНП", label: "СНТ / ДНП (Садоводство и дачи)" },
  { value: "Промназначение", label: "Промназначение (Земли промышленности)" },
  { value: "Сельхозназначение", label: "Сельхозназначение (СХ)" },
  { value: "КФХ", label: "КФХ (Крестьянское фермерское хозяйство)" },
] as const;

const LAND_OWNERSHIP_OPTIONS = ["Собственность", "Аренда", "Субаренда"] as const;

function parsePositiveKw(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveCommsElectricityColumn(p: RealEstateParams): string | null {
  if (p.propertyType === COMMERCIAL_PROPERTY_LABEL) {
    const kw = parsePositiveKw(p.commercialPowerKw);
    if (kw != null) return `${kw} кВт`;
    if (p.commsLight) return "Есть";
    return null;
  }
  if (!p.commsLight) return null;
  return "Есть";
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

type KidsItemKind = "clothing" | "shoes" | "toy" | "transport_other";

/** Нормализация по нижнему регистру — допускает «игрушка», «Одежда» и т.д. */
function getKidsItemKind(raw: string): KidsItemKind | null {
  const t = raw.trim().toLowerCase();
  if (t === "одежда") return "clothing";
  if (t === "обувь") return "shoes";
  if (t === "игрушка") return "toy";
  if (t === "транспорт" || t === "другое") return "transport_other";
  return null;
}

function kidsShowsSize(kind: KidsItemKind | null): boolean {
  return kind === "clothing" || kind === "shoes";
}

function formatPersistPlotArea(p: RealEstateParams): string {
  const t = p.plotArea.trim();
  if (!t) return "";
  if (p.propertyType === LAND_PLOT_LABEL) {
    return formatPlotAreaForListingFromSotkiString(t);
  }
  return t;
}

function isCommercialShoppingCenter(p: RealEstateParams): boolean {
  return (
    p.propertyType === COMMERCIAL_PROPERTY_LABEL &&
    p.commercialPremisesType.trim() === COMMERCIAL_SHOPPING_CENTER_LABEL
  );
}

export function CreateListingForm() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingIntent = searchParams.get("intent") === "rent" ? "rent" : "sale";
  const uid = session?.user?.id;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState<string>(ALLOWED_LISTING_CITIES[0]);
  const [cities, setCities] = useState<string[]>([...ALLOWED_LISTING_CITIES]);
  const [category, setCategory] = useState("other");
  const [files, setFiles] = useState<File[]>([]);
  const [categoryParams, setCategoryParams] = useState<CategoryFormParams>(
    EMPTY_CATEGORY_PARAMS,
  );
  /** Локальное отображение поля га при вводе (каноническое значение — сотки в plotArea). */
  const [landPlotHaTyping, setLandPlotHaTyping] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishStage, setPublishStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [err, setErr] = useState("");
  const [showPhoneWarning, setShowPhoneWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const hasAnyParams = useMemo(() => {
    const active = categoryParams[category as keyof CategoryFormParams];
    if (!active || typeof active !== "object") return false;
    return Object.values(active).some((v) => {
      if (typeof v === "boolean") return v;
      return String(v ?? "").trim().length > 0;
    });
  }, [category, categoryParams, price]);
  const kidsKindUi = useMemo(
    () => getKidsItemKind(categoryParams.kids.itemType),
    [categoryParams.kids.itemType],
  );

  useEffect(() => {
    if (listingIntent === "rent") {
      setCategory("realestate");
    }
  }, [listingIntent]);

  useEffect(() => {
    const land =
      category === "realestate" &&
      categoryParams.realestate.propertyType === LAND_PLOT_LABEL;
    if (!land) setLandPlotHaTyping(null);
  }, [category, categoryParams.realestate.propertyType]);

  const rentFeedFiltersSeededRef = useRef(false);
  useEffect(() => {
    if (listingIntent !== "rent" || rentFeedFiltersSeededRef.current) return;
    rentFeedFiltersSeededRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(FEED_SESSION_STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as {
        city?: string;
        realAreaFrom?: string;
        realAreaTo?: string;
        realFloor?: string;
        realFloorsTotal?: string;
        realPlotFrom?: string;
        realPlotTo?: string;
        realPlotUseHa?: boolean;
      };
      const areaSeed =
        String(state.realAreaFrom ?? "").trim() || String(state.realAreaTo ?? "").trim();
      const floorSeed = String(state.realFloor ?? "").trim();
      const floorsTotalSeed = String(state.realFloorsTotal ?? "").trim();
      const plotSeedRaw =
        String(state.realPlotFrom ?? "").trim() || String(state.realPlotTo ?? "").trim();
      const plotHaMode = state.realPlotUseHa === true;
      let plotSotkiSeed: string | undefined;
      if (plotSeedRaw) {
        const n = plotHaMode ? hectaresInputToSotki(plotSeedRaw) : parseFlexiblePositiveNumber(plotSeedRaw);
        if (n != null) plotSotkiSeed = String(n);
      }
      const feedCity = String(state.city ?? "").trim();
      setCategoryParams((prev) => ({
        ...prev,
        realestate: {
          ...prev.realestate,
          ...(areaSeed ? { area: areaSeed } : {}),
          ...(floorSeed ? { floor: floorSeed } : {}),
          ...(floorsTotalSeed ? { floorsTotal: floorsTotalSeed } : {}),
          ...(plotSotkiSeed
            ? { plotArea: plotSotkiSeed, plotAreaUnitHa: plotHaMode }
            : {}),
        },
      }));
      if (isAllowedListingCity(feedCity)) {
        setCity(feedCity);
      }
    } catch {
      /* ignore */
    }
  }, [listingIntent]);

  const isDirty = Boolean(
    title.trim() ||
      description.trim() ||
      price.trim() ||
      files.length > 0 ||
      category !== "other" ||
      hasAnyParams,
  );
  const { safePush, confirmLeave } = useUnsavedChangesGuard(isDirty, {
    enabled: true,
  });
  const canSubmitBasic = Boolean(title.trim() && parseNonNegativePrice(price) !== null);

  const addSelectedFiles = useCallback((selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected).filter((file) =>
      String(file.type ?? "").toLowerCase().startsWith("image/"),
    );
    if (incoming.length === 0) return;
    setFiles((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const merged = [...base];
      for (const file of incoming) {
        if (
          merged.some(
            (x) =>
              x.name === file.name &&
              x.size === file.size &&
              x.lastModified === file.lastModified,
          )
        ) {
          continue;
        }
        if (merged.length >= MAX_LISTING_PHOTOS) break;
        merged.push(file);
      }
      return merged;
    });
  }, []);

  const removeSelectedFileAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  useEffect(() => {
    trackEvent("create_open");
  }, []);

  const safeCities = useMemo(() => {
    const source = Array.isArray(cities) ? cities : [];
    const normalized = source
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter((c) => c.length > 0);
    const allowed = normalized.filter((c) => isAllowedListingCity(c));
    return allowed.length > 0 ? Array.from(new Set(allowed)) : [...ALLOWED_LISTING_CITIES];
  }, [cities]);

  const safeCategories = useMemo(() => (Array.isArray(CATEGORIES) ? CATEGORIES : []), []);

  const selectedCity = useMemo(() => {
    const normalized = typeof city === "string" ? city.trim() : "";
    if (isAllowedListingCity(normalized) && safeCities.includes(normalized)) return normalized;
    return safeCities[0] ?? ALLOWED_LISTING_CITIES[0];
  }, [city, safeCities]);
  const selectedFilePreviews = useMemo(
    () =>
      files.map((file, idx) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${idx}`,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  const safeCitiesRef = useRef(safeCities);
  safeCitiesRef.current = safeCities;

  const resetCreateFormState = useCallback(() => {
    const defaultCity = safeCitiesRef.current[0] ?? ALLOWED_LISTING_CITIES[0];
    setTitle("");
    setDescription("");
    setPrice("");
    setCity(defaultCity);
    setCategory("other");
    setFiles([]);
    setCategoryParams(EMPTY_CATEGORY_PARAMS);
    setErr("");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const dbCities = await getCitiesFromDb();
        const normalized = Array.isArray(dbCities) ? dbCities : [];
        console.log("[CITIES-CREATE DEBUG] Loaded:", normalized.length, "cities");
        setCities(normalized);
      } catch (loadError) {
        console.error("CREATE PAGE CRASH", loadError);
        setCities([...ALLOWED_LISTING_CITIES]);
      }
    })();
  }, []);

  const clearDraft = useCallback(async () => {
    try {
      localStorage.removeItem(CREATE_FORM_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (!uid) return;
    const rest = getSupabaseRestWithSession();
    if (!rest) return;
    const { error } = await rest.from("drafts").delete().eq("user_id", uid);
    logRlsIfBlocked(error);
  }, [uid]);

  const updateCategoryParam = useCallback(
    <
      K extends keyof CategoryFormParams,
      P extends keyof CategoryFormParams[K],
    >(
      categoryKey: K,
      field: P,
      value: CategoryFormParams[K][P],
    ) => {
      setCategoryParams((prev) => ({
        ...prev,
        [categoryKey]: {
          ...prev[categoryKey],
          [field]: value,
        },
      }));
    },
    [],
  );

  const resolveKidsSize = useCallback((): string => {
    const p = categoryParams.kids;
    if (p.size === "__other__") return p.sizeOther.trim();
    return p.size.trim();
  }, [categoryParams.kids]);

  const resolveFashionSize = useCallback((): string => {
    const p = categoryParams.fashion;
    if (p.size === "__other__") return p.sizeOther.trim();
    return p.size.trim();
  }, [categoryParams.fashion]);

  const validateCategoryRequiredFields = useCallback((): string | null => {
    if (category === "auto") {
      const p = categoryParams.auto;
      if (!p.brand.trim() || !p.model.trim() || !p.year.trim() || !p.mileage.trim()) {
        return "Заполните обязательные параметры авто: марка, модель, год, пробег";
      }
    }
    if (category === "realestate") {
      const p = categoryParams.realestate;
      if (!p.propertyType.trim()) {
        return "Выберите тип недвижимости";
      }
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
        if (!p.plotArea.trim()) {
          return "Укажите площадь участка";
        }
      }

      if (isLand) {
        if (parseFlexiblePositiveNumber(p.plotArea) == null) {
          return "Укажите площадь участка числом больше нуля (сотки)";
        }
        if (!p.landType.trim()) {
          return "Выберите вид участка";
        }
        if (!p.landOwnershipStatus.trim()) {
          return "Укажите статус собственности";
        }
      }

      if (isCommercial && !p.commercialPremisesType.trim()) {
        return "Выберите тип помещения";
      }

      if (!isLand && !isCommercial) {
        const floor = parseNonNegativeInt(p.floor);
        const floorsTotal = parsePositiveInt(p.floorsTotal);
        if (floor === null) {
          return "Укажите этаж (целое число ≥ 0)";
        }
        if (floorsTotal === null) {
          return "Укажите этажность здания (целое число от 1)";
        }
        if (floorsTotal < floor) {
          return "Этажность здания не может быть меньше номера этажа";
        }
      }

      if (!isLand && isShoppingCenterCommercial) {
        const floorsTotal = parsePositiveInt(p.floorsTotal);
        if (floorsTotal === null) {
          return "Укажите этажность здания (целое число от 1)";
        }
      }

      if (listingIntent === "rent" && !isLand && !isCommercial) {
        const rooms = parseNonNegativeInt(p.rooms);
        if (rooms === null) {
          return "Укажите количество комнат (целое число ≥ 0)";
        }
      }
    }
    if (category === "electronics") {
      const p = categoryParams.electronics;
      if (!p.brand.trim() || !p.model.trim() || !p.condition.trim()) {
        return "Заполните обязательные параметры электроники: бренд, модель, состояние";
      }
    }
    if (category === "fashion") {
      const p = categoryParams.fashion;
      const resolvedSize = resolveFashionSize();
      if (!p.itemType.trim() || !resolvedSize || !p.condition.trim()) {
        return "Заполните обязательные параметры одежды/обуви: тип, размер, состояние";
      }
      if (p.itemType === "Обувь" && !/^\d+$/.test(resolvedSize)) {
        return "Для обуви размер должен быть числом";
      }
    }
    if (category === "services") {
      const p = categoryParams.services;
      if (!p.serviceType.trim() || !p.priceType.trim()) {
        return "Заполните обязательные параметры услуги: тип услуги и формат цены";
      }
    }
    if (category === "kids") {
      const p = categoryParams.kids;
      if (!p.itemType.trim()) {
        return "Укажите тип товара для категории Детям";
      }
      const kind = getKidsItemKind(p.itemType);
      if (!kind) {
        return "Тип товара: Одежда, Обувь, Игрушка, Транспорт или Другое";
      }
      if (kind === "toy" && !p.age.trim()) {
        return "Для игрушки укажите возраст";
      }
      if (kidsShowsSize(kind)) {
        const resolvedSize = resolveKidsSize();
        if (!resolvedSize) {
          return "Укажите размер";
        }
        if (kind === "shoes" && !/^\d+$/.test(resolvedSize)) {
          return "Для обуви размер должен быть числом";
        }
      }
    }
    if (category === "sport") {
      const p = categoryParams.sport;
      if (!p.itemType.trim() || !p.condition.trim()) {
        return "Заполните обязательные параметры категории Спорт: тип товара и состояние";
      }
    }
    if (category === "home") {
      const p = categoryParams.home;
      if (!p.itemType.trim() || !p.condition.trim()) {
        return "Заполните обязательные параметры категории Дом и сад: тип товара и состояние";
      }
    }
    return null;
  }, [category, categoryParams, listingIntent, resolveFashionSize, resolveKidsSize]);

  const buildSpecsSummary = useCallback((): string => {
    const specs: Array<[string, string]> = [];
    if (category === "auto") {
      const p = categoryParams.auto;
      specs.push(
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
      );
    }
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
      if (p.commsLight) {
        specs.push(["Электричество", "Есть"]);
      }
      if (p.commsSewage) specs.push(["Канализация", "Есть"]);
    }
    if (category === "electronics") {
      const p = categoryParams.electronics;
      specs.push(["Бренд", p.brand], ["Модель", p.model], ["Состояние", p.condition]);
    }
    if (category === "fashion") {
      const p = categoryParams.fashion;
      specs.push(
        ["Тип", p.itemType],
        ["Размер", resolveFashionSize()],
        ["Состояние", p.condition],
      );
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
        const sz = resolveKidsSize();
        if (sz) specs.push(["Размер", sz]);
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
    const filled = specs
      .map(([label, value]) => [label, String(value ?? "").trim()] as const)
      .filter(([, value]) => value.length > 0);
    if (filled.length === 0) return "";
    const lines = filled.map(([label, value]) => `- ${label}: ${value}`).join("\n");
    return `Характеристики:\n${lines}`;
  }, [category, categoryParams, listingIntent, resolveFashionSize, resolveKidsSize]);

  const buildParamsFromForm = useCallback((): Record<string, unknown> => {
    const toIntOrNull = (raw: string): number | null => {
      const normalized = raw.trim();
      if (!/^\d+$/.test(normalized)) return null;
      const value = Number.parseInt(normalized, 10);
      return Number.isFinite(value) ? value : null;
    };
    const toBoolOrNull = (raw: string): boolean | null => {
      const normalized = raw.trim().toLowerCase();
      if (!normalized) return null;
      if (normalized === "да" || normalized === "true") return true;
      if (normalized === "нет" || normalized === "false") return false;
      return null;
    };
    const normalizedPrice = toIntOrNull(price);
    if (category === "auto") {
      const p = categoryParams.auto;
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
      const resolvedSize = resolveFashionSize();
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
        const resolvedSize = resolveKidsSize();
        const parsedKidsSize = toIntOrNull(resolvedSize);
        base.size = parsedKidsSize ?? (resolvedSize || null);
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
    return {
      price: normalizedPrice,
    };
  }, [category, categoryParams, price, listingIntent, resolveFashionSize, resolveKidsSize]);

  const handleBack = useCallback(() => {
    if (!confirmLeave()) return;
    resetCreateFormState();
    void clearDraft();
    if (
      typeof window !== "undefined" &&
      document.referrer &&
      document.referrer.includes(window.location.origin)
    ) {
      router.back();
    } else {
      router.push("/");
    }
  }, [clearDraft, confirmLeave, resetCreateFormState, router]);

  useEffect(() => {
    if (profile?.phone?.trim()) {
      setShowPhoneWarning(false);
    }
  }, [profile?.phone]);

  useEffect(() => {
    if (!showPhoneWarning || !warningRef.current) return;
    warningRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [showPhoneWarning]);

  useEffect(() => {
    return () => {
      for (const item of selectedFilePreviews) {
        URL.revokeObjectURL(item.url);
      }
    };
  }, [selectedFilePreviews]);

  const publish = useCallback(async () => {
    if (!uid) {
      safePush(router, "/login");
      return;
    }
    setErr("");
    const level = getTrustLevel(profile?.trust_score);
    if (level === "CRITICAL") {
      setErr("Аккаунт ограничен.");
      return;
    }
    const block = await getListingPublishBlockMessage(uid, profile ?? null);
    if (block) {
      setErr(block);
      return;
    }
    if (title.trim().length < 2) {
      setErr("Укажите заголовок");
      return;
    }
    const priceNum = parseNonNegativePrice(price);
    if (priceNum === null) {
      setErr("Укажите цену");
      return;
    }
    if (!isAllowedListingCity(selectedCity.trim())) {
      setErr("Пожалуйста, выберите город из списка (Москва/Сочи)");
      return;
    }
    const paramsError = validateCategoryRequiredFields();
    if (paramsError) {
      setErr(paramsError);
      return;
    }
    setBusy(true);
    setPublishStage("uploading");
    try {
      const uploadGroupId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const uploadedUrls: string[] = [];
      const safeFiles = Array.isArray(files) ? files : [];
      for (let i = 0; i < safeFiles.length; i++) {
        const file = safeFiles[i];
        if (!file) continue;
        const url = await uploadListingPhotoWeb(uid, uploadGroupId, file, i);
        const normalizedUrl = url.trim();
        if (!normalizedUrl) {
          throw new Error("Не удалось загрузить фото");
        }
        uploadedUrls.push(normalizedUrl);
      }

      setPublishStage("creating");
      const specsSummary = buildSpecsSummary();
      const params = buildParamsFromForm();
      const finalDescription = [description.trim(), specsSummary]
        .filter((chunk) => chunk.length > 0)
        .join("\n\n");

      const realestateExtras =
        category === "realestate"
          ? (() => {
              const p = categoryParams.realestate;
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
            })()
          : null;

      const autoExtras =
        category === "auto"
          ? {
              engine_power: categoryParams.auto.enginePowerHp.trim() || null,
              engine_volume: categoryParams.auto.engineVolumeL.trim() || null,
            }
          : null;

      const res = await insertListingRow({
        title: title.trim(),
        description: finalDescription,
        price: priceNum,
        category,
        city: selectedCity.trim(),
        params,
        user_id: uid,
        owner_id: uid,
        contact_phone: profile?.phone || null,
        ...(autoExtras ?? {}),
        ...(realestateExtras ?? {}),
      });
      console.log("CREATE LISTING RESULT", res);
      if (res.error) {
        setErr(res.error);
        return;
      }
      if (!res.id) {
        setErr("Не удалось создать объявление. Попробуй снова.");
        return;
      }
      const lid = res.id;

      if (uploadedUrls.length > 0) {
        const hasInvalidUrl = uploadedUrls.some((url) => !/^https?:\/\//i.test(url));
        if (hasInvalidUrl) {
          throw new Error("Некорректная ссылка изображения");
        }

        const imageRows = uploadedUrls.map((url, sortOrder) => ({
          listing_id: lid,
          url,
          sort_order: sortOrder,
        }));

        const { error: ie } = await supabase.schema("public").from("images").insert(imageRows);
        logRlsIfBlocked(ie);
        if (ie) {
          try {
            await removeListingImagesFromStorage(uploadedUrls);
          } catch (storageCleanupError) {
            console.warn("LISTING STORAGE CLEANUP ERROR", storageCleanupError);
          }
          const { error: rollbackError } = await supabase.from("listings").delete().eq("id", lid);
          if (rollbackError) {
            console.warn("LISTING ROLLBACK ERROR", rollbackError);
          }
          throw new Error(ie.message || "Не удалось сохранить фотографии объявления");
        }
      }

      registerRapidListingCreated(uid);
      trackEvent("listing_publish", {
        category,
        city: selectedCity,
        listing_intent: listingIntent,
      });
      await clearDraft();
      resetCreateFormState();
      setShowPhoneWarning(false);
      await refreshProfile();
      router.push(`/listing/${lid}`);
    } catch (e: unknown) {
      const message = parseUnknownError(e);
      console.error("FETCH ERROR", message);
      setErr(message);
    } finally {
      setBusy(false);
      setPublishStage("idle");
    }
  }, [
    uid,
    profile,
    title,
    description,
    price,
    selectedCity,
    category,
    listingIntent,
    categoryParams,
    files,
    router,
    refreshProfile,
    resetCreateFormState,
    clearDraft,
    buildSpecsSummary,
    buildParamsFromForm,
    validateCategoryRequiredFields,
  ]);

  const handlePublishClick = useCallback(() => {
    if (!profile?.phone?.trim()) {
      setShowPhoneWarning(true);
      return;
    }
    void publish();
  }, [profile?.phone, publish]);

  if (!session) {
    return (
      <main className="safe-pt px-5 pb-8 pt-10">
        <p className="text-sm text-muted">Войдите, чтобы разместить объявление.</p>
        <Link
          href="/login"
          className="mt-6 inline-block min-h-[48px] rounded-card bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-ui hover:bg-accent-hover"
        >
          Войти
        </Link>
      </main>
    );
  }

  console.log("[CITIES-CREATE DEBUG] state:", safeCities.length, safeCities);

  const cityOptions = (safeCities || []).map((c) => ({ value: c, label: c }));

  const re = categoryParams.realestate;
  const isCommercialProp = re.propertyType === COMMERCIAL_PROPERTY_LABEL;
  const isHouseProp = re.propertyType === HOUSE_LABEL;
  const isLandPlotProp = re.propertyType === LAND_PLOT_LABEL;
  const needsMainAreaField = Boolean(re.propertyType.trim()) && !isLandPlotProp;
  const needsPlotAreaField = isHouseProp || isLandPlotProp;

  const landPlotInputDisplay = useMemo(() => {
    if (!isLandPlotProp) return "";
    if (!re.plotAreaUnitHa) return re.plotArea;
    if (landPlotHaTyping != null) return landPlotHaTyping;
    const s = parseFlexiblePositiveNumber(re.plotArea);
    return s != null ? sotkiToHectaresDisplay(s) : "";
  }, [isLandPlotProp, re.plotArea, re.plotAreaUnitHa, landPlotHaTyping]);

  console.log("[CITIES-CREATE DEBUG] options:", cityOptions?.length, cityOptions);

  try {
    return (
    <main className="safe-pt space-y-5 bg-main px-5 pb-10 pt-8">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold tracking-tight text-fg">
          {listingIntent === "rent" ? "Снять недвижимость" : "Новое объявление"}
        </h1>
        <button
          type="button"
          onClick={handleBack}
          aria-label="Назад"
          className="flex items-center gap-2 text-sm text-blue-500 hover:opacity-80 active:scale-95 transition-all duration-150"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Назад
        </button>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Фото</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={!canEditListingsAndListingPhotos(profile?.trust_score)}
          onChange={(e) => {
            addSelectedFiles(e.target.files);
            e.target.value = "";
          }}
          className="sr-only"
          tabIndex={-1}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={
              !canEditListingsAndListingPhotos(profile?.trust_score) ||
              files.length >= MAX_LISTING_PHOTOS
            }
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-elevated text-2xl font-light text-fg transition-all duration-200 hover:bg-elev-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Добавить фото"
          >
            +
          </button>
          <p className="text-xs text-muted">
            {files.length}/{MAX_LISTING_PHOTOS} фото
          </p>
        </div>
        {files.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {selectedFilePreviews.map((preview, idx) => (
              <div
                key={preview.key}
                className="relative overflow-hidden rounded-card border border-line bg-elevated"
              >
                <img
                  src={preview.url}
                  alt=""
                  className="h-24 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeSelectedFileAt(idx)}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-bold text-white"
                  aria-label="Удалить фото"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Заголовок</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" className={`mt-2 ${inputClass}`} />
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Описание</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание"
          rows={5}
          className={`mt-2 min-h-[120px] resize-none py-3 ${inputClass}`}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Цена</label>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="Цена"
          className={`mt-2 ${inputClass}`}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Город</label>
        <div className="mt-2">
          <Select
            value={(cityOptions || []).find((option) => option?.value === selectedCity) ?? null}
            onChange={(selectedOption) => setCity(selectedOption?.value || safeCities[0] || ALLOWED_LISTING_CITIES[0])}
            options={cityOptions}
            placeholder="Выберите город"
            isSearchable={false}
            className="react-select-container"
            classNamePrefix="react-select"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Категория</label>
        <select
          value={category}
          disabled={listingIntent === "rent"}
          onChange={(e) => setCategory(e.target.value)}
          className={`mt-2 ${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {(safeCategories || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {category === "auto" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры авто</label>
          <input value={categoryParams.auto.brand} onChange={(e) => updateCategoryParam("auto", "brand", e.target.value)} placeholder="Марка *" className={inputClass} />
          <input value={categoryParams.auto.model} onChange={(e) => updateCategoryParam("auto", "model", e.target.value)} placeholder="Модель *" className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input value={categoryParams.auto.year} onChange={(e) => updateCategoryParam("auto", "year", e.target.value)} inputMode="numeric" placeholder="Год выпуска *" className={inputClass} />
            <input value={categoryParams.auto.mileage} onChange={(e) => updateCategoryParam("auto", "mileage", e.target.value)} inputMode="numeric" placeholder="Пробег (км) *" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryParams.auto.owners} onChange={(e) => updateCategoryParam("auto", "owners", e.target.value)} className={inputClass}>
              <option value="">Владельцев</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3+</option>
            </select>
            <select value={categoryParams.auto.fuel} onChange={(e) => updateCategoryParam("auto", "fuel", e.target.value)} className={inputClass}>
              <option value="">Тип топлива</option>
              <option value="Бензин">Бензин</option>
              <option value="Дизель">Дизель</option>
              <option value="Гибрид">Гибрид</option>
              <option value="Электро">Электро</option>
              <option value="Газ">Газ</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryParams.auto.transmission} onChange={(e) => updateCategoryParam("auto", "transmission", e.target.value)} className={inputClass}>
              <option value="">Коробка передач</option>
              <option value="Механика">Механика</option>
              <option value="Автомат">Автомат</option>
              <option value="Робот">Робот</option>
              <option value="Вариатор">Вариатор</option>
            </select>
            <select value={categoryParams.auto.drive} onChange={(e) => updateCategoryParam("auto", "drive", e.target.value)} className={inputClass}>
              <option value="">Привод</option>
              <option value="Передний">Передний</option>
              <option value="Задний">Задний</option>
              <option value="Полный">Полный</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AutoEngineCreatable
              label="Мощность (л.с.)"
              value={categoryParams.auto.enginePowerHp}
              onChange={(next) => updateCategoryParam("auto", "enginePowerHp", next)}
              options={AUTO_HP_OPTIONS}
              placeholder="Выберите или введите"
            />
            <AutoEngineCreatable
              label="Объем (л)"
              value={categoryParams.auto.engineVolumeL}
              onChange={(next) => updateCategoryParam("auto", "engineVolumeL", next)}
              options={AUTO_VOLUME_OPTIONS}
              placeholder="Выберите или введите"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryParams.auto.customsCleared} onChange={(e) => updateCategoryParam("auto", "customsCleared", e.target.value)} className={inputClass}>
              <option value="">Растаможен</option>
              <option value="Да">Да</option>
              <option value="Нет">Нет</option>
            </select>
            <select value={categoryParams.auto.damaged} onChange={(e) => updateCategoryParam("auto", "damaged", e.target.value)} className={inputClass}>
              <option value="">Битый</option>
              <option value="Да">Да</option>
              <option value="Нет">Нет</option>
            </select>
          </div>
        </div>
      ) : null}
      {category === "realestate" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры недвижимости</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={categoryParams.realestate.propertyType}
              onChange={(e) => {
                const v = e.target.value;
                setCategoryParams((prev) => {
                  const r = prev.realestate;
                  const base: RealEstateParams = { ...r, propertyType: v };

                  if (v !== COMMERCIAL_PROPERTY_LABEL) {
                    base.commercialPremisesType = "";
                    base.commercialPowerKw = "";
                  }

                  if (v === HOUSE_LABEL || v === LAND_PLOT_LABEL) {
                    if (r.propertyType !== HOUSE_LABEL && r.propertyType !== LAND_PLOT_LABEL) {
                      base.plotArea = "";
                      base.plotAreaUnitHa = false;
                    }
                  } else {
                    base.plotArea = "";
                    base.plotAreaUnitHa = false;
                  }

                  if (v === LAND_PLOT_LABEL) {
                    base.area = "";
                    base.floor = "";
                    base.floorsTotal = "";
                    base.rooms = "";
                    base.parking = "";
                    base.renovation = "";
                    if (r.propertyType !== LAND_PLOT_LABEL) {
                      base.landType = "";
                      base.landOwnershipStatus = "";
                      base.plotAreaUnitHa = false;
                    }
                  }

                  if (v !== LAND_PLOT_LABEL && r.propertyType === LAND_PLOT_LABEL) {
                    base.landType = "";
                    base.landOwnershipStatus = "";
                    base.plotAreaUnitHa = false;
                  }

                  if (v === COMMERCIAL_PROPERTY_LABEL) {
                    base.plotArea = "";
                    base.plotAreaUnitHa = false;
                    base.rooms = "";
                  }

                  return { ...prev, realestate: base };
                });
              }}
              className={inputClass}
            >
              <option value="">Тип *</option>
              <option value="Квартира">Квартира</option>
              <option value={HOUSE_LABEL}>{HOUSE_LABEL}</option>
              <option value={LAND_PLOT_LABEL}>{LAND_PLOT_LABEL}</option>
              <option value={COMMERCIAL_PROPERTY_LABEL}>{COMMERCIAL_PROPERTY_LABEL}</option>
            </select>
            {needsMainAreaField ? (
              <input
                value={categoryParams.realestate.area}
                onChange={(e) => updateCategoryParam("realestate", "area", e.target.value)}
                inputMode="decimal"
                placeholder={
                  isHouseProp ? "Площадь дома (м²) *" : "Площадь (м²) *"
                }
                className={inputClass}
              />
            ) : null}
          </div>
          {needsPlotAreaField ? (
            isLandPlotProp ? (
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={landPlotInputDisplay}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!re.plotAreaUnitHa) {
                      updateCategoryParam(
                        "realestate",
                        "plotArea",
                        normalizeDecimalInput(raw).replace(/[^\d.]/g, ""),
                      );
                      return;
                    }
                    setLandPlotHaTyping(raw);
                    const ha = parseFlexiblePositiveNumber(raw);
                    updateCategoryParam(
                      "realestate",
                      "plotArea",
                      ha != null ? String(ha * 100) : "",
                    );
                  }}
                  onFocus={() => {
                    if (!re.plotAreaUnitHa) return;
                    const s = parseFlexiblePositiveNumber(re.plotArea);
                    setLandPlotHaTyping(s != null ? sotkiToHectaresDisplay(s) : "");
                  }}
                  onBlur={() => setLandPlotHaTyping(null)}
                  inputMode="decimal"
                  placeholder={re.plotAreaUnitHa ? "Площадь, га *" : "Площадь, сот. *"}
                  className={`${inputClass} min-w-[160px] flex-1`}
                />
                <label className="flex shrink-0 cursor-pointer select-none items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={re.plotAreaUnitHa}
                    aria-label="Площадь в гектарах"
                    onClick={() => {
                      const next = !re.plotAreaUnitHa;
                      updateCategoryParam("realestate", "plotAreaUnitHa", next);
                      setLandPlotHaTyping(null);
                    }}
                    className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border transition-colors duration-200 ${
                      re.plotAreaUnitHa
                        ? "border-accent bg-accent"
                        : "border-line bg-elev-2"
                    }`}
                  >
                    <span
                      className={`absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 ${
                        re.plotAreaUnitHa ? "translate-x-[22px]" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    ГА
                  </span>
                </label>
              </div>
            ) : (
              <input
                value={categoryParams.realestate.plotArea}
                onChange={(e) => updateCategoryParam("realestate", "plotArea", e.target.value)}
                placeholder="Площадь участка *"
                className={inputClass}
              />
            )
          ) : null}
          {isLandPlotProp ? (
            <>
              <select
                value={categoryParams.realestate.landType}
                onChange={(e) => updateCategoryParam("realestate", "landType", e.target.value)}
                className={inputClass}
              >
                <option value="">Вид участка *</option>
                {LAND_PURPOSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={categoryParams.realestate.landOwnershipStatus}
                onChange={(e) =>
                  updateCategoryParam("realestate", "landOwnershipStatus", e.target.value)
                }
                className={inputClass}
              >
                <option value="">Статус собственности *</option>
                {LAND_OWNERSHIP_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {isCommercialProp ? (
            <select
              value={categoryParams.realestate.commercialPremisesType}
              onChange={(e) => {
                const v = e.target.value;
                setCategoryParams((prev) => {
                  const r = prev.realestate;
                  return {
                    ...prev,
                    realestate: {
                      ...r,
                      commercialPremisesType: v,
                      floor: v === COMMERCIAL_SHOPPING_CENTER_LABEL ? "" : r.floor,
                    },
                  };
                });
              }}
              className={inputClass}
            >
              <option value="">Тип помещения *</option>
              {COMMERCIAL_PREMISES_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : null}
          {isCommercialProp ? (
            <input
              value={categoryParams.realestate.commercialPowerKw}
              onChange={(e) => updateCategoryParam("realestate", "commercialPowerKw", e.target.value)}
              inputMode="decimal"
              placeholder="Мощность (кВт)"
              className={inputClass}
            />
          ) : null}
          {!isLandPlotProp ? (
            isCommercialProp && isCommercialShoppingCenter(categoryParams.realestate) ? (
              <input
                value={categoryParams.realestate.floorsTotal}
                onChange={(e) => updateCategoryParam("realestate", "floorsTotal", e.target.value)}
                inputMode="numeric"
                placeholder="Этажность здания *"
                className={inputClass}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={categoryParams.realestate.floor}
                  onChange={(e) => updateCategoryParam("realestate", "floor", e.target.value)}
                  inputMode="numeric"
                  placeholder="Этаж *"
                  className={inputClass}
                />
                <input
                  value={categoryParams.realestate.floorsTotal}
                  onChange={(e) => updateCategoryParam("realestate", "floorsTotal", e.target.value)}
                  inputMode="numeric"
                  placeholder="Этажность здания *"
                  className={inputClass}
                />
              </div>
            )
          ) : null}
          {!isLandPlotProp && !isCommercialProp ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={categoryParams.realestate.rooms}
                onChange={(e) => updateCategoryParam("realestate", "rooms", e.target.value)}
                inputMode="numeric"
                placeholder={
                  listingIntent === "rent" ? "Количество комнат *" : "Количество комнат"
                }
                className={inputClass}
              />
              <select
                value={categoryParams.realestate.parking}
                onChange={(e) => updateCategoryParam("realestate", "parking", e.target.value)}
                className={inputClass}
              >
                <option value="">Парковка</option>
                <option value="Да">Да</option>
                <option value="Нет">Нет</option>
              </select>
            </div>
          ) : null}
          {!isLandPlotProp && isCommercialProp ? (
            <select
              value={categoryParams.realestate.parking}
              onChange={(e) => updateCategoryParam("realestate", "parking", e.target.value)}
              className={inputClass}
            >
              <option value="">Парковка</option>
              <option value="Да">Да</option>
              <option value="Нет">Нет</option>
            </select>
          ) : null}
          {!isLandPlotProp ? (
            <select
              value={categoryParams.realestate.renovation}
              onChange={(e) => updateCategoryParam("realestate", "renovation", e.target.value)}
              className={inputClass}
            >
              <option value="">Ремонт</option>
              <option value="Нет">Нет</option>
              <option value="Косметический">Косметический</option>
              <option value="Евро">Евро</option>
            </select>
          ) : null}

          <div className="border-t border-line pt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Коммуникации
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
                <input
                  type="checkbox"
                  checked={categoryParams.realestate.commsGas}
                  onChange={(e) => updateCategoryParam("realestate", "commsGas", e.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
                />
                Газ
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
                <input
                  type="checkbox"
                  checked={categoryParams.realestate.commsWater}
                  onChange={(e) => updateCategoryParam("realestate", "commsWater", e.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
                />
                Вода
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
                <input
                  type="checkbox"
                  checked={categoryParams.realestate.commsLight}
                  onChange={(e) => updateCategoryParam("realestate", "commsLight", e.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
                />
                Электричество
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
                <input
                  type="checkbox"
                  checked={categoryParams.realestate.commsSewage}
                  onChange={(e) => updateCategoryParam("realestate", "commsSewage", e.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
                />
                Канализация
              </label>
            </div>
          </div>
        </div>
      ) : null}
      {category === "electronics" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры электроники</label>
          <input value={categoryParams.electronics.brand} onChange={(e) => updateCategoryParam("electronics", "brand", e.target.value)} placeholder="Бренд *" className={inputClass} />
          <input value={categoryParams.electronics.model} onChange={(e) => updateCategoryParam("electronics", "model", e.target.value)} placeholder="Модель *" className={inputClass} />
          <select value={categoryParams.electronics.condition} onChange={(e) => updateCategoryParam("electronics", "condition", e.target.value)} className={inputClass}>
            <option value="">Состояние *</option>
            <option value="Новое">Новое</option>
            <option value="Б/у">Б/у</option>
          </select>
        </div>
      ) : null}
      {category === "fashion" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры одежды/обуви</label>
          <select
            value={categoryParams.fashion.itemType}
            onChange={(e) => {
              const nextType = e.target.value;
              updateCategoryParam("fashion", "itemType", nextType);
              updateCategoryParam("fashion", "size", "");
              updateCategoryParam("fashion", "sizeOther", "");
            }}
            className={inputClass}
          >
            <option value="">Тип * (одежда/обувь)</option>
            <option value="Одежда">Одежда</option>
            <option value="Обувь">Обувь</option>
          </select>
          <select
            value={categoryParams.fashion.itemType ? categoryParams.fashion.size || "" : ""}
            onChange={(e) => updateCategoryParam("fashion", "size", e.target.value)}
            className={`${inputClass} ${categoryParams.fashion.itemType ? (categoryParams.fashion.size ? "text-fg" : "text-muted") : "text-muted"} disabled:cursor-not-allowed disabled:opacity-[0.65]`}
            disabled={!categoryParams.fashion.itemType}
          >
            {!categoryParams.fashion.itemType ? (
              <option value="">Сначала выберите тип</option>
            ) : (
              <>
                <option value="" className="text-muted">
                  Выберите размер
                </option>
                {categoryParams.fashion.itemType === "Одежда"
                  ? FASHION_CLOTHING_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))
                  : null}
                {categoryParams.fashion.itemType === "Обувь"
                  ? Array.from({ length: 14 }, (_, idx) => String(35 + idx)).map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))
                  : null}
                <option value="__other__" className="text-fg">
                  Другой
                </option>
              </>
            )}
          </select>
          {categoryParams.fashion.size === "__other__" ? (
            <input
              value={categoryParams.fashion.sizeOther}
              onChange={(e) => updateCategoryParam("fashion", "sizeOther", e.target.value)}
              placeholder="Укажите размер"
              className={inputClass}
            />
          ) : null}
          <select value={categoryParams.fashion.condition} onChange={(e) => updateCategoryParam("fashion", "condition", e.target.value)} className={inputClass}>
            <option value="">Состояние *</option>
            <option value="Новое">Новое</option>
            <option value="Б/у">Б/у</option>
          </select>
        </div>
      ) : null}
      {category === "services" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры услуги</label>
          <input value={categoryParams.services.serviceType} onChange={(e) => updateCategoryParam("services", "serviceType", e.target.value)} placeholder="Тип услуги *" className={inputClass} />
          <select value={categoryParams.services.priceType} onChange={(e) => updateCategoryParam("services", "priceType", e.target.value)} className={inputClass}>
            <option value="">Цена *</option>
            <option value="За час">За час</option>
            <option value="За услугу">За услугу</option>
          </select>
        </div>
      ) : null}
      {category === "kids" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры категории Детям</label>
          <input
            value={categoryParams.kids.itemType}
            onChange={(e) => {
              const v = e.target.value;
              setCategoryParams((prev) => ({
                ...prev,
                kids: {
                  ...prev.kids,
                  itemType: v,
                  size: "",
                  sizeOther: "",
                },
              }));
            }}
            placeholder="Тип товара * (Одежда, Обувь, Игрушка, Транспорт, Другое)"
            className={inputClass}
          />
          <input
            value={categoryParams.kids.age}
            onChange={(e) => updateCategoryParam("kids", "age", e.target.value)}
            placeholder={kidsKindUi === "toy" ? "Возраст *" : "Возраст"}
            className={inputClass}
          />
          {kidsShowsSize(kidsKindUi) ? (
            <>
              <select
                value={categoryParams.kids.size || ""}
                onChange={(e) => updateCategoryParam("kids", "size", e.target.value)}
                className={`${inputClass} ${categoryParams.kids.size ? "text-fg" : "text-muted"}`}
              >
                <option value="" className="text-muted">
                  Выберите размер *
                </option>
                {kidsKindUi === "shoes"
                  ? KIDS_SHOE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size} className="text-fg">
                        {size}
                      </option>
                    ))
                  : KIDS_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size} className="text-fg">
                        {size}
                      </option>
                    ))}
                <option value="__other__" className="text-fg">
                  Другой
                </option>
              </select>
              {categoryParams.kids.size === "__other__" ? (
                <input
                  value={categoryParams.kids.sizeOther}
                  onChange={(e) => updateCategoryParam("kids", "sizeOther", e.target.value)}
                  placeholder={kidsKindUi === "shoes" ? "Укажите размер (число)" : "Укажите размер"}
                  className={inputClass}
                  inputMode={kidsKindUi === "shoes" ? "numeric" : undefined}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {category === "sport" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры категории Спорт</label>
          <input value={categoryParams.sport.itemType} onChange={(e) => updateCategoryParam("sport", "itemType", e.target.value)} placeholder="Тип товара *" className={inputClass} />
          <select value={categoryParams.sport.condition} onChange={(e) => updateCategoryParam("sport", "condition", e.target.value)} className={inputClass}>
            <option value="">Состояние *</option>
            <option value="Новое">Новое</option>
            <option value="Б/у">Б/у</option>
          </select>
        </div>
      ) : null}
      {category === "home" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры категории Дом и сад</label>
          <input value={categoryParams.home.itemType} onChange={(e) => updateCategoryParam("home", "itemType", e.target.value)} placeholder="Тип товара *" className={inputClass} />
          <select value={categoryParams.home.condition} onChange={(e) => updateCategoryParam("home", "condition", e.target.value)} className={inputClass}>
            <option value="">Состояние *</option>
            <option value="Новое">Новое</option>
            <option value="Б/у">Б/у</option>
          </select>
        </div>
      ) : null}
      {err ? <p className="text-sm font-medium text-danger">{err}</p> : null}
      <button
        type="button"
        disabled={busy || !canSubmitBasic}
        onClick={handlePublishClick}
        className="pressable w-full min-h-[52px] rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (publishStage === "uploading" ? "Загрузка фото..." : "Создание объявления...") : "Опубликовать"}
      </button>
      {!profile?.phone?.trim() && showPhoneWarning ? (
        <div
          ref={warningRef}
          className="mt-4 rounded-card border border-[rgba(34,197,94,0.3)] bg-[#0f172a] p-4"
        >
          <div className="mb-3 text-base font-bold text-[#22c55e]">
            Рекомендуем добавить номер телефона в профиле
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void publish()}
              className="min-h-[46px] w-full rounded-xl bg-gradient-to-r from-[#6366f1] to-[#3b82f6] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Опубликовать
            </button>
            <Link
              href="/profile"
              className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border border-line bg-elevated px-4 py-3 text-sm font-medium text-fg transition-colors duration-ui hover:bg-elev-2"
            >
              Добавить телефон
            </Link>
          </div>
        </div>
      ) : null}
    </main>
    );
  } catch (renderError) {
    console.error("CREATE PAGE CRASH", renderError);
    return (
      <main className="safe-pt px-5 pb-10 pt-8">
        <div className="rounded-card border border-line bg-elevated p-4 text-sm text-fg">Ошибка загрузки</div>
      </main>
    );
  }
}
