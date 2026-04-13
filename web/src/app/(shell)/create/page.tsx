"use client";

import { useAuth } from "@/context/auth-context";
import { CATEGORIES } from "@/lib/categories";
import { insertListingRow } from "@/lib/listings";
import { getListingPublishBlockMessage } from "@/lib/trustPublishGate";
import { canEditListingsAndListingPhotos, getTrustLevel } from "@/lib/trustLevels";
import { registerRapidListingCreated } from "@/lib/trust";
import { uploadListingPhotoWeb } from "@/lib/storageUploadWeb";
import { supabase } from "@/lib/supabase";
import { logRlsIfBlocked } from "@/lib/postgrestErrors";
import { parseNonNegativePrice } from "@/lib/validate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

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

export default function CreatePage() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const uid = session?.user?.id;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("Москва");
  const [category, setCategory] = useState("other");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    setBusy(true);
    try {
      const res = await insertListingRow({
        user_id: uid,
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        category,
        city: city.trim() || "Не указан",
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
      for (let i = 0; i < files.length; i++) {
        const url = await uploadListingPhotoWeb(uid, lid, files[i]!, i);
        const { error: ie } = await supabase
          .schema("public")
          .from("images")
          .insert({ user_id: uid, listing_id: lid, url, sort_order: i });
        logRlsIfBlocked(ie);
        if (ie) throw ie;
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
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
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
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Город" className={`mt-2 ${inputClass}`} />
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
      <button
        type="button"
        disabled={busy}
        onClick={() => void publish()}
        className="pressable w-full min-h-[52px] rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "…" : "Опубликовать"}
      </button>
    </main>
  );
}
