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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type AutoParams = {
  brand: string;
  model: string;
  year: string;
  mileage: string;
  owners: string;
  fuel: string;
  transmission: string;
  drive: string;
  customsCleared: string;
  damaged: string;
};

type RealEstateParams = {
  propertyType: string;
  area: string;
  floor: string;
  floorsTotal: string;
  rooms: string;
  parking: string;
  renovation: string;
};

type ElectronicsParams = { brand: string; model: string; condition: string };
type FashionParams = { itemType: string; size: string; condition: string };
type ServicesParams = { serviceType: string; priceType: string };
type KidsParams = { itemType: string; age: string };
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
    customsCleared: "",
    damaged: "",
  },
  realestate: {
    propertyType: "",
    area: "",
    floor: "",
    floorsTotal: "",
    rooms: "",
    parking: "",
    renovation: "",
  },
  electronics: { brand: "", model: "", condition: "" },
  fashion: { itemType: "", size: "", condition: "" },
  services: { serviceType: "", priceType: "" },
  kids: { itemType: "", age: "" },
  sport: { itemType: "", condition: "" },
  home: { itemType: "", condition: "" },
};

export default function CreatePage() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
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
  const [busy, setBusy] = useState(false);
  const [publishStage, setPublishStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [err, setErr] = useState("");
  const [showPhoneWarning, setShowPhoneWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const hasAnyParams = useMemo(() => {
    const active = categoryParams[category as keyof CategoryFormParams];
    if (!active || typeof active !== "object") return false;
    return Object.values(active).some((v) => String(v ?? "").trim().length > 0);
  }, [category, categoryParams, price]);
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
      value: string,
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

  const validateCategoryRequiredFields = useCallback((): string | null => {
    if (category === "auto") {
      const p = categoryParams.auto;
      if (!p.brand.trim() || !p.model.trim() || !p.year.trim() || !p.mileage.trim()) {
        return "Заполните обязательные параметры авто: марка, модель, год, пробег";
      }
    }
    if (category === "realestate") {
      const p = categoryParams.realestate;
      if (!p.propertyType.trim() || !p.area.trim()) {
        return "Заполните обязательные параметры недвижимости: тип и площадь";
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
      if (!p.itemType.trim() || !p.size.trim() || !p.condition.trim()) {
        return "Заполните обязательные параметры одежды/обуви: тип, размер, состояние";
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
      if (!p.itemType.trim() || !p.age.trim()) {
        return "Заполните обязательные параметры для категории Детям: тип товара и возраст";
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
  }, [category, categoryParams]);

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
        ["Растаможен", p.customsCleared],
        ["Битый", p.damaged],
      );
    }
    if (category === "realestate") {
      const p = categoryParams.realestate;
      specs.push(
        ["Тип", p.propertyType],
        ["Площадь (м2)", p.area],
        ["Этаж", p.floor],
        ["Этажность здания", p.floorsTotal],
        ["Количество комнат", p.rooms],
        ["Парковка", p.parking],
        ["Ремонт", p.renovation],
      );
    }
    if (category === "electronics") {
      const p = categoryParams.electronics;
      specs.push(["Бренд", p.brand], ["Модель", p.model], ["Состояние", p.condition]);
    }
    if (category === "fashion") {
      const p = categoryParams.fashion;
      specs.push(["Тип", p.itemType], ["Размер", p.size], ["Состояние", p.condition]);
    }
    if (category === "services") {
      const p = categoryParams.services;
      specs.push(["Тип услуги", p.serviceType], ["Цена", p.priceType]);
    }
    if (category === "kids") {
      const p = categoryParams.kids;
      specs.push(["Тип товара", p.itemType], ["Возраст", p.age]);
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
  }, [category, categoryParams]);

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
        is_cleared: toBoolOrNull(p.customsCleared),
        is_damaged: toBoolOrNull(p.damaged),
      };
    }
    if (category === "realestate") {
      const p = categoryParams.realestate;
      return {
        type: p.propertyType.trim() || null,
        area_m2: toIntOrNull(p.area),
        floor: toIntOrNull(p.floor),
        floors_total: toIntOrNull(p.floorsTotal),
        rooms: toIntOrNull(p.rooms),
        price: normalizedPrice,
        has_parking: toBoolOrNull(p.parking),
        renovation: p.renovation.trim() || null,
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
      return {
        type: p.itemType.trim() || null,
        size: p.size.trim() || null,
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
      return {
        item_type: p.itemType.trim() || null,
        age: p.age.trim() || null,
        price: normalizedPrice,
      };
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
  }, [category, categoryParams]);

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

  console.log("[CITIES-CREATE DEBUG] options:", cityOptions?.length, cityOptions);

  try {
    return (
    <main className="safe-pt space-y-5 bg-main px-5 pb-10 pt-8">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold tracking-tight text-fg">Новое объявление</h1>
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
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-2 ${inputClass}`}>
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
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryParams.realestate.propertyType} onChange={(e) => updateCategoryParam("realestate", "propertyType", e.target.value)} className={inputClass}>
              <option value="">Тип * (квартира/дом/участок)</option>
              <option value="Квартира">Квартира</option>
              <option value="Дом">Дом</option>
              <option value="Участок">Участок</option>
            </select>
            <input value={categoryParams.realestate.area} onChange={(e) => updateCategoryParam("realestate", "area", e.target.value)} inputMode="decimal" placeholder="Площадь (м2) *" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={categoryParams.realestate.floor} onChange={(e) => updateCategoryParam("realestate", "floor", e.target.value)} inputMode="numeric" placeholder="Этаж" className={inputClass} />
            <input value={categoryParams.realestate.floorsTotal} onChange={(e) => updateCategoryParam("realestate", "floorsTotal", e.target.value)} inputMode="numeric" placeholder="Этажность здания" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={categoryParams.realestate.rooms} onChange={(e) => updateCategoryParam("realestate", "rooms", e.target.value)} inputMode="numeric" placeholder="Количество комнат" className={inputClass} />
            <select value={categoryParams.realestate.parking} onChange={(e) => updateCategoryParam("realestate", "parking", e.target.value)} className={inputClass}>
              <option value="">Парковка</option>
              <option value="Да">Да</option>
              <option value="Нет">Нет</option>
            </select>
          </div>
          <select value={categoryParams.realestate.renovation} onChange={(e) => updateCategoryParam("realestate", "renovation", e.target.value)} className={inputClass}>
            <option value="">Ремонт</option>
            <option value="Нет">Нет</option>
            <option value="Косметический">Косметический</option>
            <option value="Евро">Евро</option>
          </select>
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
          <select value={categoryParams.fashion.itemType} onChange={(e) => updateCategoryParam("fashion", "itemType", e.target.value)} className={inputClass}>
            <option value="">Тип * (одежда/обувь)</option>
            <option value="Одежда">Одежда</option>
            <option value="Обувь">Обувь</option>
          </select>
          <input value={categoryParams.fashion.size} onChange={(e) => updateCategoryParam("fashion", "size", e.target.value)} placeholder="Размер *" className={inputClass} />
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
          <input value={categoryParams.kids.itemType} onChange={(e) => updateCategoryParam("kids", "itemType", e.target.value)} placeholder="Тип товара *" className={inputClass} />
          <input value={categoryParams.kids.age} onChange={(e) => updateCategoryParam("kids", "age", e.target.value)} placeholder="Возраст *" className={inputClass} />
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
          <div className="mb-2 text-base font-bold text-[#22c55e]">
            Рекомендуем добавить номер телефона в профиле
          </div>
          <div className="mb-3 text-sm text-[#94a3b8]">
            Так вы не пропустите важный звонок
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
