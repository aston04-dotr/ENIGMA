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

type CreateFormSnapshot = {
  title: string;
  description: string;
  price: string;
  city: string;
  category: string;
};

function buildDraftPayloadKey(
  title: string,
  description: string,
  price: string,
  city: string,
  category: string,
): string {
  return JSON.stringify({ title, description, price, city, category });
}

function cityToSelectedKey(cityRaw: string, safeCities: string[]): string {
  const n = (cityRaw || "").trim();
  if (isAllowedListingCity(n) && safeCities.includes(n)) return n;
  return safeCities[0] ?? ALLOWED_LISTING_CITIES[0];
}

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
  const [busy, setBusy] = useState(false);
  const [publishStage, setPublishStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [err, setErr] = useState("");
  const [showPhoneWarning, setShowPhoneWarning] = useState(false);
  const [formRestored, setFormRestored] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedRef = useRef("");
  const saveIdleClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const isDirty = Boolean(title || description || price);
  const { safePush, safeBack } = useUnsavedChangesGuard(isDirty, { enabled: true });
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

  const handleBack = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      document.referrer &&
      document.referrer.includes(window.location.origin)
    ) {
      safeBack(router);
    } else {
      safePush(router, "/");
    }
  }, [router, safeBack, safePush]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    setFormRestored(false);
    setDraftLoaded(false);

    void (async () => {
      const sc = safeCitiesRef.current;
      const localSafe = Array.isArray(sc) && sc.length > 0 ? sc : [...ALLOWED_LISTING_CITIES];

      const setLastSavedFromFields = (fields: {
        title: string;
        description: string;
        price: string;
        cityRaw: string;
        category: string;
      }) => {
        const cityK = cityToSelectedKey(fields.cityRaw, localSafe);
        lastSavedRef.current = buildDraftPayloadKey(
          fields.title,
          fields.description,
          fields.price,
          cityK,
          fields.category,
        );
      };

      const applyLocalSnapshot = (): {
        title: string;
        description: string;
        price: string;
        cityRaw: string;
        category: string;
      } | null => {
        try {
          const saved = localStorage.getItem(CREATE_FORM_STORAGE_KEY);
          if (!saved) return null;
          const parsed = JSON.parse(saved) as Partial<CreateFormSnapshot>;
          if (typeof parsed.title === "string") setTitle(parsed.title);
          if (typeof parsed.description === "string") setDescription(parsed.description);
          if (typeof parsed.price === "string") setPrice(parsed.price);
          if (typeof parsed.city === "string" && parsed.city.trim()) setCity(parsed.city);
          if (typeof parsed.category === "string" && parsed.category.trim()) setCategory(parsed.category);
          const t = typeof parsed.title === "string" ? parsed.title : "";
          const d = typeof parsed.description === "string" ? parsed.description : "";
          const p = typeof parsed.price === "string" ? parsed.price : "";
          const cRaw = typeof parsed.city === "string" && parsed.city.trim() ? parsed.city : "";
          const cat =
            typeof parsed.category === "string" && parsed.category.trim() ? parsed.category : "other";
          return { title: t, description: d, price: p, cityRaw: cRaw, category: cat };
        } catch (e) {
          console.warn("Failed to parse local draft", e);
          return null;
        }
      };

      if (uid) {
        const rest = getSupabaseRestWithSession();
        if (rest) {
          const { data, error } = await rest.from("drafts").select("*").eq("user_id", uid).maybeSingle();
          if (cancelled) return;
          if (error) {
            console.warn("[drafts] load", error);
          } else if (data) {
            const t = data.title != null ? String(data.title) : "";
            const d = data.description != null ? String(data.description) : "";
            const p = data.price != null ? String(data.price) : "";
            const cRaw = data.city != null && String(data.city).trim() ? String(data.city) : "";
            const cat =
              data.category != null && String(data.category).trim() ? String(data.category) : "other";
            setTitle(t);
            setDescription(d);
            setPrice(p);
            if (cRaw) setCity(cRaw);
            setCategory(cat);
            setLastSavedFromFields({ title: t, description: d, price: p, cityRaw: cRaw, category: cat });
            setFormRestored(true);
            setDraftLoaded(true);
            return;
          }
        }
        if (cancelled) return;
        const local = applyLocalSnapshot();
        if (local) {
          setLastSavedFromFields(local);
        } else {
          setLastSavedFromFields({
            title: "",
            description: "",
            price: "",
            cityRaw: "",
            category: "other",
          });
        }
        setFormRestored(true);
        setDraftLoaded(true);
        return;
      }

      const local = applyLocalSnapshot();
      if (local) setLastSavedFromFields(local);
      if (!cancelled) {
        setFormRestored(true);
        setDraftLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (typeof window === "undefined" || !formRestored) return;
    const timeout = setTimeout(() => {
      const snapshot: CreateFormSnapshot = {
        title,
        description,
        price,
        city,
        category,
      };
      try {
        localStorage.setItem(CREATE_FORM_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        /* quota / private mode */
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formRestored, title, description, price, city, category]);

  useEffect(() => {
    if (!uid || !isDirty || !draftLoaded || !formRestored) return;
    const rest = getSupabaseRestWithSession();
    if (!rest) return;

    const timeout = setTimeout(() => {
      void (async () => {
        const payload = buildDraftPayloadKey(title, description, price, selectedCity, category);
        if (payload === lastSavedRef.current) return;

        setSaveStatus("saving");
        const priceNum = parseNonNegativePrice(price);
        const { error } = await rest.from("drafts").upsert(
          {
            user_id: uid,
            title: title.trim() || null,
            description: description.trim() || null,
            price: priceNum,
            city: selectedCity.trim() || null,
            category: category || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (error) {
          logRlsIfBlocked(error);
          console.warn("[drafts] upsert", error);
          setSaveStatus("idle");
          return;
        }
        lastSavedRef.current = payload;
        setSaveStatus("saved");
        if (saveIdleClearRef.current) clearTimeout(saveIdleClearRef.current);
        saveIdleClearRef.current = setTimeout(() => {
          setSaveStatus("idle");
          saveIdleClearRef.current = null;
        }, 2000);
      })();
    }, 1000);

    return () => clearTimeout(timeout);
  }, [uid, isDirty, draftLoaded, formRestored, title, description, price, category, selectedCity]);

  useEffect(() => {
    return () => {
      if (saveIdleClearRef.current) clearTimeout(saveIdleClearRef.current);
    };
  }, []);

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

  const resetCreateFormState = useCallback(() => {
    const defaultCity = safeCitiesRef.current[0] ?? ALLOWED_LISTING_CITIES[0];
    setTitle("");
    setDescription("");
    setPrice("");
    setCity(defaultCity);
    setCategory("other");
    setFiles([]);
    setErr("");
    setSaveStatus("idle");
    lastSavedRef.current = buildDraftPayloadKey("", "", "", defaultCity, "other");
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

      const res = await insertListingRow({
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        category,
        city: selectedCity.trim(),
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
      const restForDraft = getSupabaseRestWithSession();
      if (restForDraft) {
        const { error: draftDeleteError } = await restForDraft.from("drafts").delete().eq("user_id", uid);
        logRlsIfBlocked(draftDeleteError);
        if (draftDeleteError) console.warn("[drafts] delete after publish", draftDeleteError);
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(CREATE_FORM_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
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
      {saveStatus === "saving" ? <div className="text-xs text-gray-400">Сохранение...</div> : null}
      {saveStatus === "saved" ? <div className="text-xs text-green-500">Сохранено ✓</div> : null}
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
