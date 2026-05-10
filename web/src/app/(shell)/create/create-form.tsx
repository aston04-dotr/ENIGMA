"use client";

import { useAuth } from "@/context/auth-context";
import { useFormattedIntegerInput } from "@/hooks/useFormattedIntegerInput";
import { CATEGORIES } from "@/lib/categories";
import {
  getCitiesByRegionFromDb,
  getDistrictsByCityFromDb,
  getRegionIdByCityName,
  getRegionsFromDb,
  insertListingRow,
  type CityRow,
  type CityDistrictRow,
  type RegionRow,
} from "@/lib/listings";
import { FREE_ACTIVE_LISTINGS_CAP, LISTING_EXTRA_SLOT_PACKS } from "@/lib/listingSlotPacks";
import {
  getListingPublishQuotaDetail,
  maxAllowedActiveListings,
  type ActiveListingQuotaDetail,
} from "@/lib/listingPublishQuota";
import { assessListingPublishGate } from "@/lib/trustPublishGate";
import { canEditListingsAndListingPhotos, getTrustLevel } from "@/lib/trustLevels";
import { registerRapidListingCreated } from "@/lib/trust";
import { ListingPhotoAddPanel } from "@/components/listing/ListingPhotoAddPanel";
import { mapListingPhotoUploadUiError } from "@/lib/listingPhotoClient";
import { uploadListingPhotoWeb } from "@/lib/storageUploadWeb";
import { removeListingImagesFromStorage } from "@/lib/storageUploadWeb";
import { getMaxListingPhotos } from "@/lib/runtimeConfig";
import { listingPath } from "@/lib/mobileRuntime";
import { getSupabaseRestWithSession, supabase } from "@/lib/supabase";
import { logRlsIfBlocked } from "@/lib/postgrestErrors";
import { parseNonNegativePrice } from "@/lib/validate";
import { normalizeAllowedListingCity } from "@/lib/russianCities";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { trackEvent } from "@/lib/analytics";
import {
  formatPlotAreaForListingFromSotkiString,
  hectaresInputToSotki,
  normalizeDecimalInput,
  parseFlexiblePositiveNumber,
  sotkiToHectaresDisplay,
} from "@/lib/plotAreaSotki";
import {
  COMMERCIAL_PROPERTY_LABEL,
  COMMERCIAL_SHOPPING_CENTER_LABEL,
  COMMERCIAL_PREMISES_OPTIONS,
  HOUSE_LABEL,
  LAND_PLOT_LABEL,
  LAND_OWNERSHIP_OPTIONS,
  LAND_PURPOSE_OPTIONS,
} from "@/lib/realestateConstants";
import Link from "next/link";
import { rememberSaveEnigmaContinuationRoute } from "@/lib/saveEnigmaFlow";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AutoParamsShape, MotoParamsShape } from "@/lib/listingVehicleForm";
import {
  buildAutoParamsRecord,
  buildAutoSpecsSection,
  buildMotoParamsRecord,
  buildMotoSpecsSection,
  validateEngineHp,
  validateEngineVolumeAuto,
  validateEngineVolumeMoto,
} from "@/lib/listingVehicleForm";
import {
  AUTO_ENGINE_VOLUME_OPTIONS,
  ENGINE_HP_OPTIONS,
  MOTO_ENGINE_VOLUME_OPTIONS,
  VehicleEngineCombo,
} from "@/components/listing/VehicleEngineCombo";

type AutoParams = AutoParamsShape;
type MotoParams = MotoParamsShape;

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

function formatRubInt(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(Number(value)));
}

const inputClass =
  "w-full min-h-[48px] rounded-card border border-line bg-elevated px-4 text-fg placeholder:text-muted/60 transition-colors duration-ui focus:outline-none focus:ring-2 focus:ring-accent/35";

const MAX_LISTING_PHOTOS = Math.min(10, Math.max(1, getMaxListingPhotos()));
const CREATE_FORM_STORAGE_KEY = "create_form";

type CreateListingPhotoSlot = {
  id: string;
  file: File;
  previewUrl: string;
  uploadProgress: number | null;
  uploadError: string | null;
};
/** Совпадает с ключом ленты (`page.tsx`): фильтры недвижимости для префилла «Снять». */
const FEED_SESSION_STORAGE_KEY = "feed_state";

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
type FurnitureParams = { itemType: string; condition: string };

type CategoryFormParams = {
  auto: AutoParams;
  moto: MotoParams;
  realestate: RealEstateParams;
  electronics: ElectronicsParams;
  fashion: FashionParams;
  services: ServicesParams;
  kids: KidsParams;
  sport: SportParams;
  home: HomeParams;
  furniture: FurnitureParams;
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
  if (!t) return null;
  if (t.includes("одеж")) return "clothing";
  if (t.includes("обув") || t.includes("ботин") || t.includes("кроссов")) return "shoes";
  if (t.includes("игруш")) return "toy";
  if (t.includes("транспорт") || t.includes("коляск") || t.includes("другое")) {
    return "transport_other";
  }
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

function isCreateListingRole(raw: string | null): raw is "offer" | "seeking" {
  return raw === "offer" || raw === "seeking";
}

function CreateListingRolePicker() {
  const router = useRouter();
  return (
    <main className="safe-pt space-y-6 bg-main px-5 pb-28 pt-10">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold tracking-tight text-fg">Новое объявление</h1>
        <p className="text-sm text-muted">Выберите тип размещения</p>
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => router.push("/create?role=offer")}
          className="flex w-full flex-col items-start rounded-[16px] border border-line bg-elevated px-4 py-4 text-left shadow-sm transition-all duration-200 hover:bg-elev-2 active:scale-[0.99]"
        >
          <span className="text-[17px] font-semibold text-fg">Продать / Сдать</span>
          <span className="mt-1 text-[13px] leading-snug text-muted">
            Вы предлагаете товар, жильё, авто или услугу
          </span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/create?role=seeking")}
          className="flex w-full flex-col items-start rounded-[16px] border border-line bg-elevated px-4 py-4 text-left shadow-sm transition-all duration-200 hover:bg-elev-2 active:scale-[0.99]"
        >
          <span className="text-[17px] font-semibold text-fg">Купить / Снять</span>
          <span className="mt-1 text-[13px] leading-snug text-muted">
            Вы ищете жильё, авто или аренду — арендодатели найдут вас здесь
          </span>
        </button>
      </div>
    </main>
  );
}

export function CreateListingForm() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleRaw = searchParams.get("role");
  const listingRoleResolved: "offer" | "seeking" | null = isCreateListingRole(roleRaw)
    ? roleRaw
    : null;
  const intentFromUrl = searchParams.get("intent") === "rent" ? "rent" : "sale";
  const [listingIntent, setListingIntent] = useState<"sale" | "rent">(() =>
    listingRoleResolved === "seeking" ? "rent" : intentFromUrl,
  );

  useEffect(() => {
    const next = searchParams.get("intent") === "rent" ? "rent" : "sale";
    setListingIntent(next);
  }, [searchParams]);

  useEffect(() => {
    if (listingRoleResolved !== "seeking") return;
    setCategory((c) => (c === "realestate" || c === "auto" || c === "moto" ? c : "realestate"));
  }, [listingRoleResolved]);

  const uid = session?.user?.id;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const { formattedProps: priceInputProps } = useFormattedIntegerInput(price, setPrice);
  const [city, setCity] = useState<string>("");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("");
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");
  const [cities, setCities] = useState<CityRow[]>([]);
  const [districts, setDistricts] = useState<CityDistrictRow[]>([]);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [locationSheetStep, setLocationSheetStep] = useState<1 | 2>(1);
  const [category, setCategory] = useState("other");
  const [photoSlots, setPhotoSlots] = useState<CreateListingPhotoSlot[]>([]);
  const [categoryParams, setCategoryParams] = useState<CategoryFormParams>(
    EMPTY_CATEGORY_PARAMS,
  );
  /** Локальное отображение поля га при вводе (каноническое значение — сотки в plotArea). */
  const [landPlotHaTyping, setLandPlotHaTyping] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishStage, setPublishStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [err, setErr] = useState("");
  /** Мягкий sheet при достижении лимита активных объявлений (не красная ошибка). */
  const [activeQuotaSheet, setActiveQuotaSheet] = useState<ActiveListingQuotaDetail | null>(null);
  const [quotaSheetPackIx, setQuotaSheetPackIx] = useState(0);
  const [showPhoneWarning, setShowPhoneWarning] = useState(false);
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
      setCategory((prev) =>
        prev === "auto" || prev === "moto" || prev === "realestate" ? prev : "realestate",
      );
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
      const normalizedFeedCity = normalizeAllowedListingCity(feedCity);
      if (normalizedFeedCity) {
        setCity(normalizedFeedCity);
        setDistrict("");
        setSelectedDistrictId("");
        void (async () => {
          const regionId = await getRegionIdByCityName(normalizedFeedCity);
          if (regionId) setSelectedRegionId(regionId);
          const cityRow = cities.find((c) => c.name === normalizedFeedCity);
          if (cityRow?.id) setSelectedCityId(cityRow.id);
        })();
      }
    } catch {
      /* ignore */
    }
  }, [listingIntent, cities]);

  const isDirty = Boolean(
    title.trim() ||
      description.trim() ||
      price.trim() ||
      photoSlots.length > 0 ||
      category !== "other" ||
      hasAnyParams,
  );
  const { safePush, confirmLeave } = useUnsavedChangesGuard(isDirty, {
    enabled: true,
  });
  const canSubmitBasic = Boolean(title.trim() && parseNonNegativePrice(price) !== null);

  const addPhotosFromPicker = useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    setPhotoSlots((prev) => {
      const merged = [...prev];
      for (const file of incoming) {
        if (
          merged.some(
            (x) =>
              x.file.name === file.name &&
              x.file.size === file.size &&
              x.file.lastModified === file.lastModified,
          )
        ) {
          continue;
        }
        if (merged.length >= MAX_LISTING_PHOTOS) break;
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        merged.push({
          id,
          file,
          previewUrl: URL.createObjectURL(file),
          uploadProgress: null,
          uploadError: null,
        });
      }
      return merged;
    });
  }, []);

  const removePhotoSlotAt = useCallback((index: number) => {
    setPhotoSlots((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  useEffect(() => {
    trackEvent("create_open");
  }, []);

  const safeCategories = useMemo(() => (Array.isArray(CATEGORIES) ? CATEGORIES : []), []);
  const selectedCity = useMemo(() => normalizeAllowedListingCity(city) ?? "", [city]);
  const regionOptions = useMemo(
    () => regions.map((region) => ({ value: region.id, label: region.name })),
    [regions],
  );
  const cityOptions = useMemo(
    () => cities.map((cityRow) => ({ id: cityRow.id, value: cityRow.name, label: cityRow.name })),
    [cities],
  );
  const districtOptions = useMemo(
    () =>
      districts.map((districtRow) => ({
        id: districtRow.id,
        value: districtRow.name,
        label: districtRow.name,
      })),
    [districts],
  );
  const selectedRegionName = useMemo(
    () => regions.find((r) => r.id === selectedRegionId)?.name ?? "",
    [regions, selectedRegionId],
  );
  const createLocationGlobalActive = useMemo(
    () => !String(selectedRegionId ?? "").trim(),
    [selectedRegionId],
  );
  const resetCreateFormState = useCallback(() => {
    setTitle("");
    setDescription("");
    setPrice("");
    setCity("");
    setSelectedCityId("");
    setSelectedRegionId("");
    setDistrict("");
    setSelectedDistrictId("");
    setCategory("other");
    setPhotoSlots((prev) => {
      for (const s of prev) URL.revokeObjectURL(s.previewUrl);
      return [];
    });
    setCategoryParams(EMPTY_CATEGORY_PARAMS);
    setErr("");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const dbRegions = await getRegionsFromDb();
        setRegions(dbRegions);
      } catch (loadError) {
        console.error("CREATE PAGE CRASH", loadError);
        setRegions([]);
      }
    })();
  }, []);

  useEffect(() => {
    const regionId = String(selectedRegionId ?? "").trim();
    if (!regionId) {
      setCities([]);
      setCity("");
      setSelectedCityId("");
      setDistricts([]);
      setDistrict("");
      setSelectedDistrictId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dbCities = await getCitiesByRegionFromDb(regionId);
        if (cancelled) return;
        setCities(dbCities);
        setCity("");
        setSelectedCityId("");
        setDistricts([]);
        setDistrict("");
        setSelectedDistrictId("");
      } catch (e) {
        if (cancelled) return;
        console.error("CREATE PAGE CITIES LOAD ERROR", e);
        setCities([]);
        setCity("");
        setSelectedCityId("");
        setDistricts([]);
        setDistrict("");
        setSelectedDistrictId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRegionId]);

  useEffect(() => {
    const cityId = String(selectedCityId ?? "").trim();
    if (!cityId) {
      setDistricts([]);
      setDistrict("");
      setSelectedDistrictId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dbDistricts = await getDistrictsByCityFromDb(cityId);
        if (cancelled) return;
        setDistricts(dbDistricts);
        setDistrict("");
        setSelectedDistrictId("");
      } catch (districtLoadError) {
        if (cancelled) return;
        console.error("CREATE PAGE DISTRICTS LOAD ERROR", districtLoadError);
        setDistricts([]);
        setDistrict("");
        setSelectedDistrictId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCityId]);

  useEffect(() => {
    if (!city.trim() || selectedCityId) return;
    const match = cities.find((cityRow) => cityRow.name === city);
    if (match?.id) {
      setSelectedCityId(match.id);
    }
  }, [cities, city, selectedCityId]);

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
    if (districtOptions.length > 0 && !district.trim()) {
      return "Выберите район/локальную зону";
    }
    if (category === "auto") {
      const p = categoryParams.auto;
      if (!p.brand.trim() || !p.model.trim() || !p.year.trim() || !p.mileage.trim()) {
        return "Заполните обязательные параметры авто: марка, модель, год, пробег";
      }
      const hpErr = validateEngineHp(p.enginePowerHp);
      if (hpErr) return hpErr;
      const volErr = validateEngineVolumeAuto(p.engineVolumeL);
      if (volErr) return volErr;
    }
    if (category === "moto") {
      const p = categoryParams.moto;
      if (!p.bikeType.trim() || !p.engineKind.trim() || !p.mileageKm.trim()) {
        return "Заполните тип мотоцикла, тип двигателя и пробег";
      }
      const hpErr = validateEngineHp(p.enginePowerHp);
      if (hpErr) return hpErr;
      const volErr = validateEngineVolumeMoto(p.engineVolumeL);
      if (volErr) return volErr;
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
    if (category === "furniture") {
      const p = categoryParams.furniture;
      if (!p.itemType.trim() || !p.condition.trim()) {
        return "Заполните обязательные параметры категории Мебель: тип товара и состояние";
      }
    }
    return null;
  }, [category, categoryParams, district, districtOptions.length, listingIntent, resolveFashionSize, resolveKidsSize]);

  const buildSpecsSummary = useCallback((): string => {
    if (category === "auto") {
      return buildAutoSpecsSection(categoryParams.auto);
    }
    if (category === "moto") {
      return buildMotoSpecsSection(categoryParams.moto);
    }
    const specs: Array<[string, string]> = [];
    if (category === "realestate") {
      const p = categoryParams.realestate;
      specs.push(
        ["Сделка", listingIntent === "rent" ? "Аренда" : "Продажа"],
        ["Тип", p.propertyType],
      );
      if (district.trim()) {
        specs.push(["Район", district.trim()]);
      }
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
  }, [category, categoryParams, district, listingIntent, resolveFashionSize, resolveKidsSize]);

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
    if (category === "furniture") {
      const p = categoryParams.furniture;
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
    if (activeQuotaSheet) setQuotaSheetPackIx(0);
  }, [activeQuotaSheet]);

  const photoSlotsRef = useRef(photoSlots);
  photoSlotsRef.current = photoSlots;

  useEffect(() => {
    return () => {
      for (const s of photoSlotsRef.current) {
        URL.revokeObjectURL(s.previewUrl);
      }
    };
  }, []);

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
    const gate = await assessListingPublishGate(uid, profile ?? null);
    if (!gate.ok) {
      if (gate.block === "active_listing_quota") {
        setErr("");
        setActiveQuotaSheet(gate.quota);
        return;
      }
      setErr(gate.message);
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
    if (!selectedCity.trim()) {
      setErr("Пожалуйста, выберите город");
      return;
    }
    const paramsError = validateCategoryRequiredFields();
    if (paramsError) {
      setErr(paramsError);
      return;
    }
    setBusy(true);
    setPublishStage("uploading");
    setPhotoSlots((prev) =>
      prev.map((s) => ({ ...s, uploadProgress: null, uploadError: null })),
    );
    try {
      const uploadGroupId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const uploadedUrls: string[] = [];
      const slotsSnapshot = photoSlots.slice();
      for (let i = 0; i < slotsSnapshot.length; i++) {
        const slot = slotsSnapshot[i]!;
        setPhotoSlots((prev) =>
          prev.map((s) =>
            s.id === slot.id ? { ...s, uploadProgress: 0, uploadError: null } : s,
          ),
        );
        try {
          const url = await uploadListingPhotoWeb(uid, uploadGroupId, slot.file, i, {
            onUploadProgress: (pct) => {
              setPhotoSlots((prev) =>
                prev.map((s) =>
                  s.id === slot.id ? { ...s, uploadProgress: pct } : s,
                ),
              );
            },
          });
          const normalizedUrl = url.trim();
          if (!normalizedUrl) {
            throw new Error("Не удалось загрузить фото");
          }
          uploadedUrls.push(normalizedUrl);
          setPhotoSlots((prev) =>
            prev.map((s) =>
              s.id === slot.id ? { ...s, uploadProgress: 100 } : s,
            ),
          );
        } catch (uploadErr: unknown) {
          try {
            if (uploadedUrls.length > 0) {
              await removeListingImagesFromStorage(uploadedUrls);
            }
          } catch (cleanupErr) {
            console.warn("LISTING PARTIAL STORAGE CLEANUP", cleanupErr);
          }
          const msg = mapListingPhotoUploadUiError(uploadErr);
          setPhotoSlots((prev) =>
            prev.map((s) => ({
              ...s,
              uploadProgress: null,
              uploadError: s.id === slot.id ? msg : null,
            })),
          );
          throw new Error(msg);
        }
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

      const motoExtras =
        category === "moto"
          ? {
              engine_power: categoryParams.moto.enginePowerHp.trim() || null,
              engine_volume: categoryParams.moto.engineVolumeL.trim() || null,
              moto_type: categoryParams.moto.bikeType.trim() || null,
              moto_engine: categoryParams.moto.engineKind.trim() || null,
              moto_mileage: categoryParams.moto.mileageKm.trim() || null,
              moto_customs_cleared: categoryParams.moto.customsCleared.trim() || null,
              moto_owners_pts: categoryParams.moto.ownersPts.trim() || null,
            }
          : null;

      const res = await insertListingRow({
        title: title.trim(),
        description: finalDescription,
        price: priceNum,
        category,
        city: selectedCity.trim(),
        city_id: selectedCityId || null,
        district: district.trim() || null,
        district_id: selectedDistrictId || null,
        params,
        user_id: uid,
        owner_id: uid,
        deal_type: listingIntent,
        listing_kind: listingRoleResolved === "seeking" ? "seeking" : "offer",
        ...(autoExtras ?? {}),
        ...(motoExtras ?? {}),
        ...(realestateExtras ?? {}),
      });
      console.log("CREATE LISTING RESULT", res);
      if (res.error) {
        try {
          if (uploadedUrls.length > 0) {
            await removeListingImagesFromStorage(uploadedUrls);
          }
        } catch (storageRollbackErr) {
          console.warn("LISTING STORAGE ROLLBACK", storageRollbackErr);
        }
        if (res.activeQuotaExceeded && uid) {
          setErr("");
          const detail = await getListingPublishQuotaDetail(uid, profile ?? null);
          const maxFb = maxAllowedActiveListings(profile ?? null);
          setActiveQuotaSheet(
            detail ?? {
              active: maxFb,
              max: maxFb,
              message: res.error ?? "",
            },
          );
          return;
        }
        setErr(res.error);
        return;
      }
      if (!res.id) {
        try {
          if (uploadedUrls.length > 0) {
            await removeListingImagesFromStorage(uploadedUrls);
          }
        } catch (storageRollbackErr) {
          console.warn("LISTING STORAGE ROLLBACK", storageRollbackErr);
        }
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
        district: district.trim(),
        listing_intent: listingIntent,
      });
      await clearDraft();
      resetCreateFormState();
      setShowPhoneWarning(false);
      await refreshProfile();
      router.push(listingPath(lid));
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
    selectedCityId,
    district,
    selectedDistrictId,
    category,
    listingIntent,
    categoryParams,
    photoSlots,
    router,
    refreshProfile,
    resetCreateFormState,
    clearDraft,
    buildSpecsSummary,
    buildParamsFromForm,
    validateCategoryRequiredFields,
    listingRoleResolved,
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
        <p className="text-sm text-muted">
          Новое объявление — после короткой регистрации или входа по почте.
        </p>
        <Link
          href="/login?returnTo=%2Fcreate&source=guest_create_gate"
          onClick={() => {
            rememberSaveEnigmaContinuationRoute("/create");
          }}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-card bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors duration-ui hover:bg-accent-hover"
        >
          Продолжить с почтой
        </Link>
      </main>
    );
  }

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

  if (listingRoleResolved === null) {
    return <CreateListingRolePicker />;
  }

  try {
    return (
    <main className="safe-pt space-y-5 bg-main px-5 pb-10 pt-8">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold tracking-tight text-fg">
          {listingRoleResolved === "seeking"
            ? listingIntent === "rent"
              ? "Запрос: ищу в аренду"
              : "Запрос: ищу к покупке"
            : listingIntent === "rent"
              ? "Предложение: сдаю в аренду"
              : "Предложение: продажа"}
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
      <div className="rounded-[14px] bg-black/[0.045] p-1 dark:bg-white/[0.06]">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setListingIntent("sale")}
            className={`min-h-[40px] rounded-[11px] text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] ${
              listingIntent === "sale"
                ? "bg-white text-fg shadow-[0_1px_8px_rgba(15,23,42,0.12)] dark:bg-[#1a1d24] dark:text-white"
                : "text-muted hover:text-fg/90"
            }`}
          >
            Продажа
          </button>
          <button
            type="button"
            onClick={() => setListingIntent("rent")}
            className={`min-h-[40px] rounded-[11px] text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] ${
              listingIntent === "rent"
                ? "bg-white text-fg shadow-[0_1px_8px_rgba(15,23,42,0.12)] dark:bg-[#1a1d24] dark:text-white"
                : "text-muted hover:text-fg/90"
            }`}
          >
            Аренда
          </button>
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Фото</label>
        <ListingPhotoAddPanel
          disabled={busy || !canEditListingsAndListingPhotos(profile?.trust_score)}
          remainingSlots={MAX_LISTING_PHOTOS - photoSlots.length}
          currentCount={photoSlots.length}
          maxPhotos={MAX_LISTING_PHOTOS}
          onAddFiles={addPhotosFromPicker}
        />
        {photoSlots.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoSlots.map((slot, idx) => (
              <div
                key={slot.id}
                className="relative overflow-hidden rounded-card border border-line bg-elevated"
              >
                <img
                  src={slot.previewUrl}
                  alt=""
                  className={`h-24 w-full object-cover ${slot.uploadError ? "opacity-55" : ""}`}
                  loading="lazy"
                  decoding="async"
                />
                {slot.uploadProgress != null && slot.uploadProgress < 100 ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
                    <div
                      className="h-full bg-accent transition-[width] duration-150"
                      style={{
                        width: `${Math.min(100, Math.max(0, slot.uploadProgress))}%`,
                      }}
                    />
                  </div>
                ) : null}
                {slot.uploadError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-end gap-1 bg-black/50 p-1.5">
                    <p className="line-clamp-3 text-center text-[10px] font-medium leading-tight text-white">
                      {slot.uploadError}
                    </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void publish()}
                      className="rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-fg shadow active:scale-95 disabled:opacity-55"
                    >
                      Повторить
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removePhotoSlotAt(idx)}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-bold text-white disabled:opacity-40"
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
          {...priceInputProps}
          placeholder="Цена"
          className={`mt-2 ${inputClass} tabular-nums tracking-tight`}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Локация</label>
        <button
          type="button"
          onClick={() => {
            setLocationSheetStep(1);
            setLocationSheetOpen(true);
          }}
          className={`mt-2 flex w-full items-center justify-between ${inputClass}`}
        >
          <span className={selectedCity ? "text-fg" : "text-muted"}>
            {selectedCity
              ? `${selectedRegionName || "Регион"} · ${selectedCity}${district ? ` · ${district}` : ""}`
              : "Выберите регион и город"}
          </span>
          <span className="text-muted">→</span>
        </button>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Район / локальная зона
        </label>
        <select
          value={district}
          onChange={(e) => {
            const nextDistrict = e.target.value;
            setDistrict(nextDistrict);
            const match = districtOptions.find((d) => d.value === nextDistrict);
            setSelectedDistrictId(match?.id ?? "");
          }}
          disabled={!selectedCityId || districtOptions.length === 0}
          className={`mt-2 ${inputClass} ${
            !selectedCityId || districtOptions.length === 0 ? "cursor-not-allowed opacity-65" : ""
          }`}
        >
          <option value="">
            {!selectedCityId
              ? "Сначала выберите город"
              : districtOptions.length === 0
                ? "Для этого города пока нет районов"
                : "Выберите район *"}
          </option>
          {districtOptions.map((districtOption) => (
            <option key={districtOption.id} value={districtOption.value}>
              {districtOption.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Категория</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`mt-2 ${inputClass}`}
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
            <VehicleEngineCombo
              label="Мощность (л.с.)"
              unit="hp"
              value={categoryParams.auto.enginePowerHp}
              onChange={(next) => updateCategoryParam("auto", "enginePowerHp", next)}
              options={ENGINE_HP_OPTIONS}
              placeholder="Выберите или введите, л.с."
            />
            <VehicleEngineCombo
              label="Объем (л)"
              unit="liters"
              value={categoryParams.auto.engineVolumeL}
              onChange={(next) => updateCategoryParam("auto", "engineVolumeL", next)}
              options={AUTO_ENGINE_VOLUME_OPTIONS}
              placeholder="Выберите или введите, л"
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
      {category === "moto" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры мотоцикла</label>
          <select
            value={categoryParams.moto.bikeType}
            onChange={(e) => updateCategoryParam("moto", "bikeType", e.target.value)}
            className={inputClass}
          >
            <option value="">Тип *</option>
            <option value="Спортивный">Спортивный</option>
            <option value="Чоппер">Чоппер</option>
            <option value="Эндуро">Эндуро</option>
            <option value="Скутер">Скутер</option>
            <option value="Квадроцикл">Квадроцикл</option>
          </select>
          <select
            value={categoryParams.moto.engineKind}
            onChange={(e) => updateCategoryParam("moto", "engineKind", e.target.value)}
            className={inputClass}
          >
            <option value="">Двигатель *</option>
            <option value="Бензиновый">Бензиновый</option>
            <option value="Электрический">Электрический</option>
          </select>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <VehicleEngineCombo
              label="Объем (л)"
              unit="liters"
              value={categoryParams.moto.engineVolumeL}
              onChange={(next) => updateCategoryParam("moto", "engineVolumeL", next)}
              options={MOTO_ENGINE_VOLUME_OPTIONS}
              placeholder="До 2.5 л, свой ввод"
            />
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Пробег (км)</label>
              <input
                value={categoryParams.moto.mileageKm}
                onChange={(e) => updateCategoryParam("moto", "mileageKm", e.target.value)}
                inputMode="text"
                placeholder="Пробег *"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <VehicleEngineCombo
              label="Мощность (л.с.)"
              unit="hp"
              value={categoryParams.moto.enginePowerHp}
              onChange={(next) => updateCategoryParam("moto", "enginePowerHp", next)}
              options={ENGINE_HP_OPTIONS}
              placeholder="Выберите или введите, л.с."
            />
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Владельцев по ПТС</label>
              <select
                value={categoryParams.moto.ownersPts}
                onChange={(e) => updateCategoryParam("moto", "ownersPts", e.target.value)}
                className={inputClass}
              >
                <option value="">Владельцев по ПТС</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3+">3+</option>
              </select>
            </div>
          </div>
          <select
            value={categoryParams.moto.customsCleared}
            onChange={(e) => updateCategoryParam("moto", "customsCleared", e.target.value)}
            className={inputClass}
          >
            <option value="">Растаможен</option>
            <option value="Да">Да</option>
            <option value="Нет">Нет</option>
          </select>
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
      {category === "furniture" ? (
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры категории Мебель</label>
          <input value={categoryParams.furniture.itemType} onChange={(e) => updateCategoryParam("furniture", "itemType", e.target.value)} placeholder="Тип товара *" className={inputClass} />
          <select value={categoryParams.furniture.condition} onChange={(e) => updateCategoryParam("furniture", "condition", e.target.value)} className={inputClass}>
            <option value="">Состояние *</option>
            <option value="Новое">Новое</option>
            <option value="Б/у">Б/у</option>
          </select>
        </div>
      ) : null}
      {err ? <p className="text-sm font-medium text-danger">{err}</p> : null}
      <p className="text-center text-[12px] leading-relaxed text-muted/90">
        До {FREE_ACTIVE_LISTINGS_CAP} активных объявлений можно размещать бесплатно — во всех категориях и городах.
      </p>
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
      {locationSheetOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-main/40 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-location-title"
          onClick={() => setLocationSheetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-line bg-elevated p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="create-location-title" className="text-base font-semibold text-fg">
                Локация
              </h2>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
                {locationSheetStep} из 2
              </span>
            </div>
            {locationSheetStep === 2 ? (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-fg">{selectedRegionName || "Выбран регион"}</p>
                <button
                  type="button"
                  onClick={() => setLocationSheetStep(1)}
                  className="pressable rounded-card border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg"
                >
                  Назад
                </button>
              </div>
            ) : null}
            <div className="relative mt-3 h-[min(58vh,460px)] overflow-hidden">
              <div
                className={`absolute inset-0 transition-all duration-250 ${
                  locationSheetStep === 1
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-4 pointer-events-none opacity-0"
                }`}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Выберите регион
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pr-1 [-webkit-overflow-scrolling:touch]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRegionId("");
                        setLocationSheetOpen(false);
                      }}
                      className={`pressable mb-2 flex w-full flex-col gap-0.5 rounded-card border px-3 py-3 text-left transition-colors ${
                        createLocationGlobalActive
                          ? "border-accent/40 bg-accent/12 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "border-line/80 bg-elev-2/40 text-fg hover:bg-elev-2"
                      }`}
                    >
                      <span className="text-[13px] font-semibold leading-tight tracking-tight">
                        Все города
                      </span>
                      <span className="text-[11px] font-normal leading-snug text-muted">
                        Выберите регион и город позже или ниже по списку
                      </span>
                    </button>
                    {regionOptions.map((region) => (
                      <button
                        key={region.value}
                        type="button"
                        onClick={() => {
                          setSelectedRegionId(region.value);
                          setLocationSheetStep(2);
                        }}
                        className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                          !createLocationGlobalActive && selectedRegionId === region.value
                            ? "bg-accent/10 text-accent"
                            : "text-fg hover:bg-elev-2"
                        }`}
                      >
                        <span>{region.label}</span>
                        {!createLocationGlobalActive && selectedRegionId === region.value ? (
                          <span>✓</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div
                className={`absolute inset-0 transition-all duration-250 ${
                  locationSheetStep === 2
                    ? "translate-x-0 opacity-100"
                    : "translate-x-4 pointer-events-none opacity-0"
                }`}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Выберите город
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pr-1 [-webkit-overflow-scrolling:touch]">
                    {cityOptions.map((cityOption) => (
                      <button
                        key={cityOption.value}
                        type="button"
                        onClick={() => {
                          setCity(cityOption.value);
                          setSelectedCityId(cityOption.id);
                          setDistrict("");
                          setSelectedDistrictId("");
                          setLocationSheetOpen(false);
                        }}
                        className={`pressable mb-1 flex w-full items-center justify-between rounded-card px-3 py-2.5 text-left text-sm transition-colors ${
                          selectedCity === cityOption.value
                            ? "bg-accent/10 text-accent"
                            : "text-fg hover:bg-elev-2"
                        }`}
                      >
                        <span>{cityOption.label}</span>
                        {selectedCity === cityOption.value ? <span>✓</span> : null}
                      </button>
                    ))}
                    {cityOptions.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted">
                        В этом регионе пока нет городов
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {activeQuotaSheet ? (
        <div
          className="fixed inset-0 z-[105] flex items-end justify-center bg-main/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-quota-title"
          onClick={() => setActiveQuotaSheet(null)}
        >
          <div
            className="max-h-[min(90vh,640px)] w-full max-w-md overflow-y-auto rounded-card border border-line bg-elevated p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-quota-title" className="text-[17px] font-semibold leading-snug text-fg">
              У вас уже {activeQuotaSheet.max} активных объявлений
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Подключите пакет дополнительных слотов — и можно разместить ещё, не закрывая текущие. Обычное размещение по-прежнему без абонентской платы.
            </p>
            <p className="mt-3 text-[13px] tabular-nums text-fg/90">
              Сейчас: {activeQuotaSheet.active} из {activeQuotaSheet.max}
            </p>
            <div className="mt-5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Пакеты</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {LISTING_EXTRA_SLOT_PACKS.map((pack, ix) => {
                  const sel = quotaSheetPackIx === ix;
                  return (
                    <button
                      key={pack.slots}
                      type="button"
                      onClick={() => setQuotaSheetPackIx(ix)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        sel
                          ? "border-accent/45 bg-accent/[0.07]"
                          : "border-line bg-main/30 hover:bg-elev-2"
                      }`}
                    >
                      <span className="text-[12px] text-muted">+{pack.slots}</span>
                      <p className="mt-1 text-[14px] font-semibold tabular-nums text-fg">
                        {formatRubInt(pack.priceRub)} ₽
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const pack = LISTING_EXTRA_SLOT_PACKS[quotaSheetPackIx];
                  if (!pack) return;
                  const title = encodeURIComponent(`Пакет +${pack.slots} активных объявлений`);
                  safePush(
                    router,
                    `/payment?promoKind=listing_pack&listingPackSlots=${pack.slots}&amount=${pack.priceRub}&title=${title}`,
                  );
                }}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-fg/10 bg-fg/[0.06] px-4 text-[14px] font-semibold text-fg transition-colors hover:bg-fg/[0.09]"
              >
                Продолжить к оплате
              </button>
              <Link
                href="/profile#packages-panel"
                onClick={() => setActiveQuotaSheet(null)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-line bg-elevated px-4 text-[14px] font-medium text-fg transition-colors hover:bg-elev-2"
              >
                Открыть профиль
              </Link>
            </div>
            <button
              type="button"
              className="mt-3 w-full py-2.5 text-[13px] font-medium text-muted transition-colors hover:text-fg"
              onClick={() => setActiveQuotaSheet(null)}
            >
              Закрыть
            </button>
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
