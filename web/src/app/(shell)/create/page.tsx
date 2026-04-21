"use client";

import { useAuth } from "@/context/auth-context";
import { CATEGORIES } from "@/lib/categories";
import { insertListingRow, getCitiesFromDb } from "@/lib/listings";
import { getListingPublishBlockMessage } from "@/lib/trustPublishGate";
import { canEditListingsAndListingPhotos, getTrustLevel } from "@/lib/trustLevels";
import { registerRapidListingCreated } from "@/lib/trust";
import { uploadListingPhotoWeb } from "@/lib/storageUploadWeb";
import { getMaxListingPhotos } from "@/lib/runtimeConfig";
import { supabase } from "@/lib/supabase";
import { logRlsIfBlocked } from "@/lib/postgrestErrors";
import { parseNonNegativePrice } from "@/lib/validate";
import { ALLOWED_LISTING_CITIES, isAllowedListingCity } from "@/lib/russianCities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

const MAX_LISTING_PHOTOS = getMaxListingPhotos();
const PHONE_REQUIRED_PROMPT = "Please add a phone number so buyers can contact you.";

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

  useEffect(() => {
    void (async () => {
      const dbCities = await getCitiesFromDb();
      console.log("[CITIES-CREATE DEBUG] Loaded:", dbCities.length, "cities");
      setCities(dbCities);
    })();
  }, []);

  const publish = useCallback(async () => {
    if (!uid) {
      router.push("/login");
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
    if (!isAllowedListingCity(city.trim())) {
      setErr("Пожалуйста, выберите город из списка (Москва/Сочи)");
      return;
    }
    if (!profile?.phone?.trim()) {
      setErr(PHONE_REQUIRED_PROMPT);
      if (typeof window !== "undefined") {
        window.alert(PHONE_REQUIRED_PROMPT);
      }
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
      for (let i = 0; i < files.length; i++) {
        const url = await uploadListingPhotoWeb(uid, uploadGroupId, files[i]!, i);
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
        city: city.trim(),
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
          const { error: rollbackError } = await supabase.from("listings").delete().eq("id", lid);
          if (rollbackError) {
            console.warn("LISTING ROLLBACK ERROR", rollbackError);
          }
          throw new Error(ie.message || "Не удалось сохранить фотографии объявления");
        }
      }

      registerRapidListingCreated(uid);
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
  }, [uid, profile, title, description, price, city, category, files, router, refreshProfile]);

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

  console.log("[CITIES-CREATE DEBUG] state:", cities?.length, cities);

  const cityOptions = cities.map((c) => ({ value: c, label: c }));

  console.log("[CITIES-CREATE DEBUG] options:", cityOptions?.length, cityOptions);

  return (
    <main className="safe-pt space-y-5 bg-main px-5 pb-10 pt-8">
      <h1 className="text-[26px] font-bold tracking-tight text-fg">Новое объявление</h1>
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Фото</label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={!canEditListingsAndListingPhotos(profile?.trust_score)}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_LISTING_PHOTOS))}
          className="mt-2 min-h-[48px] w-full text-sm text-muted file:mr-4 file:rounded-card file:border-0 file:bg-elev-2 file:px-4 file:py-2 file:text-sm file:font-medium file:text-fg"
        />
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
            value={cityOptions.find(option => option.value === city)}
            onChange={(selectedOption) => setCity(selectedOption?.value || ALLOWED_LISTING_CITIES[0])}
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
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {err ? <p className="text-sm font-medium text-danger">{err}</p> : null}
      {err === PHONE_REQUIRED_PROMPT ? (
        <Link
          href="/profile"
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-card border border-line bg-elevated px-4 py-3 text-sm font-medium text-fg transition-colors duration-ui hover:bg-elev-2"
        >
          Открыть профиль
        </Link>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void publish()}
        className="pressable w-full min-h-[52px] rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? (publishStage === "uploading" ? "Загрузка фото..." : "Создание объявления...") : "Опубликовать"}
      </button>
    </main>
  );
}
