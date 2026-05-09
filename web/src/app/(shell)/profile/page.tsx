"use client";

import { LandingScreen } from "@/components/LandingScreen";
import { ListingCard } from "@/components/ListingCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { getMyListings, fetchFavoriteListingsForUser } from "@/lib/listings";
import { FAVORITES_CHANGED_EVENT } from "@/lib/favoriteEvents";
import { renewListingPublication } from "@/lib/listingRenewal";
import { getListingRenewalPriceRub } from "@/lib/runtimeConfig";
import { clearSaveEnigmaContinuationRoute } from "@/lib/saveEnigmaFlow";
import {
  FREE_ACTIVE_LISTINGS_CAP,
  LISTING_EXTRA_SLOT_PACKS,
} from "@/lib/listingSlotPacks";
import { maxAllowedActiveListings } from "@/lib/listingPublishQuota";
import { deleteAccount } from "@/lib/deleteAccount";
import { removeListingImagesFromStorage } from "@/lib/storageUploadWeb";
import { listingEditPath } from "@/lib/mobileRuntime";
import { persistProfileCacheOverlay } from "@/lib/profileLocalCache";
import { supabase } from "@/lib/supabase";
import { isValidRussianPhone, normalizeRussianPhone } from "@/lib/phoneUtils";
import type { ListingRow, UserRow } from "@/lib/types";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";

type ListingPackSelection = { slots: number; priceRub: number };
function formatPrice(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

/** Компонент отображения цены с правильной типографикой */
function PriceDisplay({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: { num: "text-[15px]", rub: "text-[11px]" },
    md: { num: "text-[16px]", rub: "text-[12px]" },
    lg: { num: "text-[18px]", rub: "text-[13px]" },
  };
  return (
    <span className={`inline-flex items-baseline ${sizeClasses[size].num} font-semibold tracking-[-0.4px]`}>
      <span>{formatPrice(value)}</span>
      <span className={`${sizeClasses[size].rub} ml-1 opacity-60`}>₽</span>
    </span>
  );
}

// Micro-animation styles
const cardEntryAnimation = `
  @keyframes card-entry {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .card-animate {
    animation: card-entry 200ms ease-out forwards;
  }
`;

export default function ProfilePage() {
  const { session, profile, signOut, authResolved, loading, refreshProfile } = useAuth();
  const { theme, mounted } = useTheme();
  // Use dark as default for SSR consistency, switch after mount
  const isDark = mounted ? theme === "dark" : true;
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [selectedListingPack, setSelectedListingPack] = useState<ListingPackSelection | null>(
    LISTING_EXTRA_SLOT_PACKS[0] ?? null,
  );
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [guardEnabled, setGuardEnabled] = useState(true);
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(true);
  const [myListingsError, setMyListingsError] = useState<string | null>(null);
  const [listingProfileTab, setListingProfileTab] = useState<"active" | "archive" | "favorites">(
    "active",
  );
  const [favoriteListings, setFavoriteListings] = useState<ListingRow[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [renewingListingId, setRenewingListingId] = useState<string | null>(null);
  const profileNameValue = (profile?.name ?? "").trim();
  const profilePhoneValue = (profile?.phone ?? "").trim();
  const isDirty =
    nameInput.trim() !== profileNameValue ||
    phoneInput.trim() !== profilePhoneValue;
  const { safePush } = useUnsavedChangesGuard(isDirty, { enabled: guardEnabled });

  const reloadMyListings = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setMyListings([]);
      setMyListingsLoading(false);
      setMyListingsError(null);
      return;
    }
    setMyListingsLoading(true);
    setMyListingsError(null);
    try {
      const rows = await getMyListings(uid);
      setMyListings(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error("MY LISTINGS LOAD ERROR", error);
      setMyListings([]);
      setMyListingsError("Не удалось загрузить ваши объявления");
    } finally {
      setMyListingsLoading(false);
    }
  }, [session?.user?.id]);

  const reloadFavorites = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setFavoriteListings([]);
      return;
    }
    setFavoritesLoading(true);
    try {
      const rows = await fetchFavoriteListingsForUser(uid);
      setFavoriteListings(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error("FAVORITES LOAD ERROR", error);
      setFavoriteListings([]);
    } finally {
      setFavoritesLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void reloadFavorites();
  }, [reloadFavorites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFav = () => void reloadFavorites();
    window.addEventListener(FAVORITES_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, onFav);
  }, [reloadFavorites]);

  const activeProfileListings = useMemo(
    () =>
      (myListings || []).filter(
        (listing) =>
          listing &&
          typeof listing === "object" &&
          Boolean(listing.id) &&
          String(listing.status ?? "active") !== "expired",
      ),
    [myListings],
  );

  const archiveProfileListings = useMemo(
    () =>
      (myListings || []).filter(
        (listing) =>
          listing &&
          typeof listing === "object" &&
          Boolean(listing.id) &&
          String(listing.status ?? "") === "expired",
      ),
    [myListings],
  );

  const listingExtraCapacity = useMemo(
    () => Math.max(0, Math.floor(Number(profile?.listing_extra_slot_capacity ?? 0))),
    [profile?.listing_extra_slot_capacity],
  );

  const placementQuota = useMemo(() => {
    const max = maxAllowedActiveListings(profile ?? null);
    const active = activeProfileListings.length;
    const fillPct = max > 0 ? Math.min(100, (active / max) * 100) : 0;
    return { max, active, fillPct };
  }, [profile?.listing_extra_slot_capacity, activeProfileListings.length]);

  const shownProfileListings =
    listingProfileTab === "favorites"
      ? favoriteListings
      : listingProfileTab === "active"
        ? activeProfileListings
        : archiveProfileListings;

  useEffect(() => {
    setNameInput(profile?.name ?? "");
  }, [profile?.name]);

  useEffect(() => {
    setPhoneInput(profile?.phone ?? "");
  }, [profile?.phone]);

  useEffect(() => {
    if (!authResolved || loading) return;
    void reloadMyListings();
  }, [authResolved, loading, reloadMyListings]);

  async function handleRenewListing(listingId: string) {
    const lid = String(listingId ?? "").trim();
    if (!lid) return;
    const priceRub = getListingRenewalPriceRub();
    if (priceRub > 0) {
      safePush(
        router,
        `/payment?type=listing_renew&listingId=${encodeURIComponent(lid)}&amount=${encodeURIComponent(String(priceRub))}&title=${encodeURIComponent("Продление публикации объявления")}`,
      );
      return;
    }
    setRenewingListingId(lid);
    const res = await renewListingPublication(lid);
    setRenewingListingId(null);
    if (!res.ok) {
      if (typeof window !== "undefined") window.alert(res.error ?? "Не удалось продлить публикацию");
      return;
    }
    await reloadMyListings();
  }

  async function handleDelete(id: string) {
    const uid = session?.user?.id;
    if (!uid) return;
    const listingId = String(id ?? "").trim();
    if (!listingId) return;
    if (typeof window !== "undefined" && !window.confirm("Удалить объявление?")) return;

    const { data: listingImages, error: listingImagesError } = await supabase
      .from("images")
      .select("url")
      .eq("listing_id", listingId);
    if (listingImagesError) {
      console.warn("MY LISTING IMAGES LOAD ERROR", listingImagesError);
    }
    const imageUrls = Array.isArray(listingImages)
      ? listingImages
          .map((row) => String((row as { url?: unknown })?.url ?? "").trim())
          .filter(Boolean)
      : [];

    const { error } = await supabase
      .from("listings")
      .delete()
      .eq("id", listingId)
      .eq("user_id", uid);

    if (error) {
      console.error("MY LISTING DELETE ERROR", error);
      if (typeof window !== "undefined") {
        window.alert("Ошибка удаления");
      }
      setMyListingsError("Не удалось удалить объявление");
      return;
    }

    try {
      await removeListingImagesFromStorage(imageUrls);
    } catch (storageError) {
      console.warn("MY LISTING STORAGE DELETE ERROR", storageError);
    }

    setMyListings((prev) => (prev || []).filter((x) => x?.id !== listingId));
  }

  async function onConfirmDelete() {
    setDeleteErr(null);
    setDeleting(true);
    try {
      const res = await deleteAccount();
      if (!res.ok) {
        if (res.error) setDeleteErr(res.error);
        else setDeleteErr("Не удалось удалить аккаунт");
        return;
      }
      setGuardEnabled(false);
      safePush(router, "/login");
    } catch (e) {
      console.error("onConfirmDelete error", e);
      setDeleteErr("Неожиданная ошибка при удалении аккаунта");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  function mapProfilePhoneError(err: { message?: string; code?: string; details?: string }): string {
    const m = (err.message ?? "").toLowerCase();
    const raw = err.message ?? "";
    if (raw.includes("PHONE_CHANGE_TOO_SOON") || m.includes("phone_change_too_soon")) {
      return "Номер недавно меняли. Следующая смена через 60 дней.";
    }
    if (m.includes("duplicate") || m.includes("unique_phone") || m.includes("profiles_phone")) {
      return "Этот номер уже привязан к другому аккаунту.";
    }
    if (m.includes("row-level security") || err.code === "42501") {
      return "Нет прав на сохранение. Выйдите и вернитесь в аккаунт.";
    }
    return raw || "Не удалось сохранить телефон";
  }

  async function savePhone() {
    if (!session?.user?.id) {
      setPhoneMessage("Сессия обновляется. Подождите пару секунд и нажмите снова.");
      return;
    }
    const raw = phoneInput.trim();
    const normalized = raw ? normalizeRussianPhone(phoneInput) : null;
    if (raw && !normalized) {
      setPhoneMessage("Некорректный формат. Нужен мобильный РФ: +7 и 10 цифр.");
      return;
    }
    if (raw && !isValidRussianPhone(phoneInput)) {
      setPhoneMessage("Проверьте номер: должно быть +7 и 10 цифр после кода страны.");
      return;
    }

    setPhoneSaving(true);
    setPhoneMessage(null);
    const uid = session.user.id;
    const now = new Date().toISOString();
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    console.log("[profile] phone:update:start", {
      userId: `${uid.slice(0, 8)}…`,
      digitsLen: normalized?.replace(/\D/g, "").length ?? 0,
    });

    let updated: { id: string; phone: string | null } | null = null;
    let error: { message?: string; code?: string; details?: string } | null = null;
    try {
      const res = await supabase
        .from("profiles")
        .update({
          phone: normalized,
          phone_updated_at: normalized ? now : null,
          updated_at: now,
        })
        .eq("id", uid)
        .select("id, phone")
        .maybeSingle();
      updated = (res.data as { id: string; phone: string | null } | null) ?? null;
      error = res.error as { message?: string; code?: string; details?: string } | null;
    } catch (unexpected) {
      console.error("[profile] phone:update:unexpected", unexpected);
      setPhoneSaving(false);
      setPhoneMessage("Ошибка сети. Проверьте интернет и попробуйте снова.");
      return;
    }

    if (error) {
      console.error("[profile] phone:update:error", error);
      setPhoneSaving(false);
      setPhoneMessage(mapProfilePhoneError(error));
      return;
    }

    if (!updated && normalized) {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!authUser) {
        setPhoneSaving(false);
        setPhoneMessage("Сессия истекла — вернитесь в аккаунт");
        return;
      }
      console.log("UPSERT USER ID:", authUser.id);

      const { error: insErr } = await supabase.from("profiles").upsert(
        {
          id: authUser.id,
          email: authUser.email ?? null,
          phone: normalized,
          phone_updated_at: now,
          updated_at: now,
        },
        { onConflict: "id" }
      );
      if (insErr) {
        console.error("[profile] phone:upsert:error", insErr);
        setPhoneSaving(false);
        setPhoneMessage(mapProfilePhoneError(insErr));
        return;
      }
    }

    console.log("[profile] phone:update:ok", { ms: t0 ? Math.round(performance.now() - t0) : 0 });
    setPhoneSaving(false);
    const email = session.user.email ?? null;
    const overlayRow: UserRow = profile
      ? {
          ...profile,
          phone: normalized,
          phone_updated_at: normalized ? now : null,
        }
      : {
          id: uid,
          phone: normalized,
          phone_updated_at: normalized ? now : null,
          device_id: null,
          name: null,
          email,
          avatar: null,
          public_id: uid,
          created_at: now,
          trust_score: null,
        };
    persistProfileCacheOverlay(uid, overlayRow);
    await refreshProfile();
    setPhoneMessage(normalized ? "Телефон сохранён" : "Телефон очищен");
  }

  async function saveName() {
    const uid = session?.user?.id;
    if (!uid) {
      setNameMessage("Сессия обновляется. Подождите пару секунд и нажмите снова.");
      return;
    }
    setNameSaving(true);
    setNameMessage(null);
    const nextName = nameInput.trim() || null;
    const now = new Date().toISOString();
    let error: { message?: string; code?: string } | null = null;
    let updated: { id: string; name: string | null } | null = null;
    try {
      const res = await supabase
        .from("profiles")
        .update({
          name: nextName,
          updated_at: now,
        })
        .eq("id", uid)
        .select("id, name")
        .maybeSingle();
      updated = (res.data as { id: string; name: string | null } | null) ?? null;
      error = res.error as { message?: string; code?: string } | null;
    } catch (unexpected) {
      console.error("[profile] name:save:unexpected", unexpected);
      setNameSaving(false);
      setNameMessage("Ошибка сети. Проверьте интернет и попробуйте снова.");
      return;
    }

    if (!error && !updated) {
      const upsertRes = await supabase.from("profiles").upsert(
        {
          id: uid,
          name: nextName,
          updated_at: now,
        },
        { onConflict: "id" },
      );
      error = upsertRes.error as { message?: string; code?: string } | null;
    }

    setNameSaving(false);
    if (error) {
      setNameMessage(error.message || "Не удалось сохранить имя");
      return;
    }
    const email = session.user.email ?? null;
    const overlayRow: UserRow = profile
      ? { ...profile, name: nextName }
      : {
          id: uid,
          phone: null,
          phone_updated_at: null,
          device_id: null,
          name: nextName,
          email,
          avatar: null,
          public_id: uid,
          created_at: now,
          trust_score: null,
        };
    persistProfileCacheOverlay(uid, overlayRow);
    await refreshProfile();
    setNameMessage("Имя сохранено");
  }

  if (!session) {
    return <LandingScreen />;
  }

  return (
    <>
      <main className="safe-pt mx-auto w-full max-w-none space-y-6 bg-main px-4 pb-10 pt-10 sm:px-6 lg:px-8">
      <section className="space-y-1.5 pb-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">Профиль</h1>
        {isDirty ? (
          <div className="text-xs text-orange-500">Есть несохранённые изменения</div>
        ) : null}
        {profile?.name ? <p className="text-[20px] font-semibold tracking-tight text-fg">{profile.name}</p> : null}
        <p className="text-sm text-muted/85">{session.user?.email}</p>
        <div className="flex items-center gap-3 text-xs text-muted/80">
          {profile?.public_id ? <p>ID: {profile.public_id}</p> : null}
          {profile?.trust_score != null ? (
            <p>Доверие: {profile.trust_score}</p>
          ) : null}
        </div>
      </section>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
      <div className="space-y-6">
      <div className={`rounded-[16px] border p-4 ${
        !profile?.name
          ? (isDark ? "bg-elevated/78 border-line/20" : "bg-[#fcfdff] border-[rgba(15,23,42,0.05)]")
          : (isDark ? "bg-elevated/78 border-line/20" : "bg-[#fcfdff] border-[rgba(15,23,42,0.05)]")
      }`}>
        <p className={`text-[13px] mb-2 ${isDark ? "text-muted" : "text-muted"}`}>Имя</p>
        <input
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.target.value);
            if (nameMessage) setNameMessage(null);
          }}
          placeholder="Введите имя"
          className="w-full min-h-[48px] rounded-xl border border-line bg-main px-4 text-[16px] text-fg placeholder:text-muted/60 outline-none transition-colors duration-200 focus:ring-2 focus:ring-accent/35"
        />
        <button
          type="button"
          onClick={() => void saveName()}
          disabled={nameSaving}
          className={`mt-3 inline-flex min-h-[43px] w-full items-center justify-center rounded-[12px] border px-3.5 py-2 text-[14px] font-medium transition-all duration-200 hover:brightness-[1.03] active:scale-[0.98] ${
            isDark
              ? "border-[#2f8d6a] bg-[#236f53] text-[#ecfff5] hover:bg-[#2b7d5d]"
              : "border-[#2f996f] bg-[#39a877] text-white hover:bg-[#32996b]"
          } disabled:opacity-50`}
        >
          {nameSaving ? "Сохранение..." : "Сохранить"}
        </button>
        {nameMessage ? (
          <p className={`mt-2 text-sm ${nameMessage === "Имя сохранено" ? "text-accent" : "text-danger"}`}>
            {nameMessage}
          </p>
        ) : null}
      </div>

      {/* Phone block */}
      <div className={`rounded-[16px] border p-4 ${
        !profile?.phone 
          ? (isDark ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200")
          : (isDark ? "bg-elevated/72 border-line/20" : "bg-[#f9fbfd] border-[rgba(15,23,42,0.05)]")
      }`}>
        <p className={`text-[13px] mb-2 ${isDark ? "text-muted" : "text-muted"}`}>Номер телефона</p>
        <input
          value={phoneInput}
          onChange={(e) => {
            setPhoneInput(e.target.value);
            if (phoneMessage) setPhoneMessage(null);
          }}
          placeholder="Введите телефон"
          className="w-full min-h-[48px] rounded-xl border border-line bg-main px-4 text-[16px] text-fg placeholder:text-muted/60 outline-none transition-colors duration-200 focus:ring-2 focus:ring-accent/35"
        />
        <button
          type="button"
          onClick={() => void savePhone()}
          disabled={phoneSaving}
          className={`mt-3 inline-flex min-h-[43px] w-full items-center justify-center rounded-[12px] border px-3.5 py-2 text-[14px] font-medium transition-all duration-200 hover:brightness-[1.03] active:scale-[0.98] ${
            isDark
              ? "border-[#2f8d6a] bg-[#236f53] text-[#ecfff5] hover:bg-[#2b7d5d]"
              : "border-[#2f996f] bg-[#39a877] text-white hover:bg-[#32996b]"
          } disabled:opacity-50`}
        >
          {phoneSaving ? "Сохранение..." : "Сохранить"}
        </button>
        {phoneMessage ? (
          <p className={`mt-2 text-sm ${phoneMessage === "Телефон сохранён" ? "text-accent" : "text-danger"}`}>
            {phoneMessage}
          </p>
        ) : null}
      </div>

      {/* Мои объявления */}
      <section className="pt-0.5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold tracking-tight text-fg">Мои объявления</h2>
          <Link
            href="/create"
            className={`inline-flex min-h-[42px] items-center rounded-[12px] border px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:brightness-[1.02] active:scale-[0.98] ${
              isDark
                ? "border-line bg-elevated text-fg hover:bg-elev-2"
                : "border-[rgba(15,23,42,0.12)] bg-elevated text-fg hover:bg-elev-2"
            }`}
          >
            Создать объявление
          </Link>
        </div>

        {!myListingsLoading && !myListingsError && session?.user?.id ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setListingProfileTab("active")}
              className={`min-h-[40px] rounded-[12px] px-4 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                listingProfileTab === "active"
                  ? "bg-accent text-white shadow-md shadow-accent/25"
                  : isDark
                    ? "border border-line bg-elevated text-fg hover:bg-elev-2"
                    : "border border-[rgba(15,23,42,0.12)] bg-elevated text-fg hover:bg-elev-2"
              }`}
            >
              Активные
              <span className="ml-1.5 font-normal opacity-80">({activeProfileListings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setListingProfileTab("archive")}
              className={`min-h-[40px] rounded-[12px] px-4 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                listingProfileTab === "archive"
                  ? "bg-accent text-white shadow-md shadow-accent/25"
                  : isDark
                    ? "border border-line bg-elevated text-fg hover:bg-elev-2"
                    : "border border-[rgba(15,23,42,0.12)] bg-elevated text-fg hover:bg-elev-2"
              }`}
            >
              Архив
              <span className="ml-1.5 font-normal opacity-80">({archiveProfileListings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setListingProfileTab("favorites")}
              className={`min-h-[40px] rounded-[12px] px-4 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                listingProfileTab === "favorites"
                  ? "bg-accent text-white shadow-md shadow-accent/25"
                  : isDark
                    ? "border border-line bg-elevated text-fg hover:bg-elev-2"
                    : "border border-[rgba(15,23,42,0.12)] bg-elevated text-fg hover:bg-elev-2"
              }`}
            >
              Избранное
              <span className="ml-1.5 font-normal opacity-80">({favoriteListings.length})</span>
            </button>
          </div>
        ) : null}

        {myListingsLoading && listingProfileTab !== "favorites" ? (
          <div className="rounded-card border border-line bg-elevated p-4 text-sm text-muted">Загрузка...</div>
        ) : listingProfileTab === "favorites" && favoritesLoading ? (
          <div className="rounded-card border border-line bg-elevated p-4 text-sm text-muted">Загрузка избранного...</div>
        ) : myListingsError ? (
          <div className="rounded-card border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{myListingsError}</div>
        ) : (myListings || []).length === 0 && listingProfileTab !== "favorites" ? (
          <div className="rounded-card border border-line bg-elevated p-4 text-sm text-muted">У вас пока нет объявлений</div>
        ) : shownProfileListings.length === 0 ? (
          <div className="rounded-card border border-line bg-elevated p-4 text-sm text-muted">
            {listingProfileTab === "active"
              ? "Нет активных объявлений — всё в архиве или ещё не создано."
              : listingProfileTab === "archive"
                ? "В архиве пока пусто."
                : "В избранном пока пусто — нажмите сердечко на карточке в ленте."}
          </div>
        ) : (
          <div className="space-y-4">
            {shownProfileListings.map((safeListing) => {
              const isOwner = safeListing.user_id === session?.user?.id;
              return (
                <div key={safeListing.id} className="rounded-[16px] bg-elevated/28 p-1.5 transition-all duration-200">
                  <ListingCard item={safeListing} compact favoriteRealtime={false} />
                  {isOwner && listingProfileTab !== "favorites" ? (
                    <div className="flex flex-col gap-2 p-2.5 pt-0">
                      {listingProfileTab === "archive" ? (
                        <button
                          type="button"
                          disabled={renewingListingId === safeListing.id}
                          onClick={() => void handleRenewListing(safeListing.id)}
                          className="flex min-h-[46px] w-full items-center justify-center rounded-[12px] bg-gradient-to-r from-[#f59e0b] via-[#ea580c] to-[#dc2626] px-3 text-sm font-bold text-white shadow-[0_6px_20px_rgba(234,88,12,0.35)] transition-all duration-200 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {renewingListingId === safeListing.id ? "Продление…" : "Продлить публикацию"}
                        </button>
                      ) : null}
                      <div className="flex gap-2">
                        <Link
                          href={listingEditPath(String(safeListing.id))}
                          className="flex min-h-[42px] flex-1 items-center justify-center rounded-[12px] border border-line/50 bg-elevated px-3 text-sm font-medium text-fg transition-all duration-200 hover:bg-elev-2 active:scale-[0.98]"
                        >
                          Редактировать
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(safeListing.id)}
                          className="min-h-[42px] rounded-[12px] border border-danger/35 bg-danger/5 px-3.5 text-sm font-medium text-danger transition-all duration-200 hover:bg-danger/10 active:scale-[0.98]"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>

      <div
        className={`mt-6 space-y-3 transition-all duration-200 ease-in-out lg:sticky lg:top-24 lg:mt-0 lg:self-start lg:-translate-y-[2px] ${
          isDark ? "lg:rounded-[20px] lg:bg-[#0f1115] lg:p-3" : ""
        }`}
        style={
          isDark
            ? {
                background:
                  "radial-gradient(circle at 70% 20%, rgba(139,95,255,0.12), transparent 40%), radial-gradient(circle at 30% 80%, rgba(110,231,255,0.08), transparent 50%), #0a0a0f",
              }
            : undefined
        }
      >
      <div
        className={`rounded-[16px] border p-4 transition-all duration-200 ease-in-out ${
          isDark
            ? "border-white/10 bg-white/5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
            : "border-[rgba(15,23,42,0.05)] bg-[#fcfdff] shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
        }`}
      >
        <p className={`text-[16px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>
          Спокойное продвижение
        </p>
        <p className={`mt-1 text-[13px] leading-[1.35] ${isDark ? "text-muted/80" : "text-gray-600/80"}`}>
          Поднятие и приоритет в ленте — по желанию, отдельно от размещения
        </p>
        <Link
          href="#promo-status-panel"
          className={`mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] border px-3 text-[14px] font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
            isDark
              ? "border-white/[0.12] bg-white/[0.05] text-fg/95 hover:bg-white/[0.08]"
              : "border-black/[0.08] bg-white text-[#374151] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#fafafa]"
          }`}
        >
          Выбрать вариант
        </Link>
      </div>

      {/* ПАНЕЛЬ: МОЙ СТАТУС + МОИ ПАКЕТЫ */}
      <div id="promo-status-panel" />
      <div className={`rounded-[18px] border p-4 card-animate ${
        isDark 
          ? "bg-white/5 border-white/10 shadow-[0_6px_16px_rgba(0,0,0,0.10)]" 
          : "bg-[#fbfcfe] border-[rgba(0,0,0,0.04)] shadow-[0_6px_16px_rgba(15,23,42,0.05)]"
      }`}>
        <p className={`mb-2.5 text-[15px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>Мой статус</p>
        <div className="space-y-1.5">
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>Boost</span>
            </div>
            <span className={`text-[12px] font-medium ${isDark ? "text-muted/75" : "text-gray-500"}`}>
              активен
            </span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>VIP</span>
            </div>
            <span className={`text-[12px] font-medium transition-colors duration-200 ${
              isDark ? "text-muted/80 hover:text-fg/70" : "text-[#9ca3af] hover:text-[#6b7280]"
            }`}>не активен</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>TOP</span>
            </div>
            <span className={`text-[12px] font-medium ${isDark ? "text-muted/75" : "text-gray-500"}`}>
              активен
            </span>
          </div>
        </div>
        <div className={`my-3 h-px ${isDark ? "bg-white/[0.08]" : "bg-black/[0.05]"}`} />
        <p className={`mb-2.5 text-[15px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>Балансы</p>
        <div className="space-y-1.5">
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>
              Доп. активных объявлений
            </span>
            <span className={`text-[18px] font-medium tabular-nums ${isDark ? "text-fg/90" : "text-[#374151]"}`}>
              {Math.max(0, Math.floor(Number(profile?.listing_extra_slot_capacity ?? 0)))}
            </span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>VIP дней</span>
            <span className={`text-[18px] font-medium ${isDark ? "text-muted/85" : "text-[#94a3b8]"}`}>0</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>TOP размещений</span>
            <span className={`text-[18px] font-medium ${isDark ? "text-accent/95" : "text-[#6f56cf]"}`}>1</span>
          </div>
        </div>
      </div>

      {/* ПАКЕТЫ И РАЗМЕЩЕНИЕ */}
      <div className={`rounded-[18px] border p-4 card-animate ${
        isDark
          ? "bg-white/5 border-white/10 shadow-[0_6px_16px_rgba(0,0,0,0.10)]"
          : "bg-[#fbfcfe] border-[rgba(0,0,0,0.04)] shadow-[0_6px_16px_rgba(15,23,42,0.05)]"
      }`}>
        <div id="packages-panel" />
        <p className={`text-[16px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>
          Размещение
        </p>

        <div className={`mt-3.5 rounded-xl p-3.5 ${isDark ? "bg-white/5" : "bg-[#f8fafc]"}`}>
          <p className={`text-[14px] font-semibold ${isDark ? "text-white" : "text-[#111]"}`}>
            До {FREE_ACTIVE_LISTINGS_CAP} активных объявлений бесплатно
          </p>
          <p className={`mt-2 text-[13px] leading-[1.45] ${isDark ? "text-muted/85" : "text-gray-600/85"}`}>
            Во всех категориях и городах, без платы за обычное размещение. Enigma помогает спокойно стартовать и
            набрать живую ленту.
          </p>
          <p className={`mt-3 text-[13px] tabular-nums tracking-tight ${isDark ? "text-fg/90" : "text-[#111]/90"}`}>
            {placementQuota.active} из {placementQuota.max} активных объявлений
          </p>
          <div
            className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${
              isDark ? "bg-white/[0.08]" : "bg-black/[0.06]"
            }`}
            role="presentation"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                isDark ? "bg-white/30" : "bg-[#1e293b]/20"
              }`}
              style={{ width: `${placementQuota.fillPct}%` }}
            />
          </div>
          {listingExtraCapacity > 0 ? (
            <p className={`mt-2 text-[12px] leading-relaxed ${isDark ? "text-muted/75" : "text-gray-500"}`}>
              {FREE_ACTIVE_LISTINGS_CAP} бесплатно · +{listingExtraCapacity} по пакету
            </p>
          ) : null}
        </div>

        <div
          className={`mt-4 rounded-xl border p-3.5 ${
            isDark ? "border-white/10 bg-white/[0.03]" : "border-line/60 bg-elevated/40"
          }`}
        >
          <p className={`text-[13px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>
            Нужно больше?
          </p>
          <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? "text-muted/82" : "text-gray-600/85"}`}>
            Пакеты дают дополнительные одновременно активные объявления поверх бесплатных {FREE_ACTIVE_LISTINGS_CAP}.
            Платные продвижения (BOOST / TOP / VIP) — отдельно, как и раньше.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {LISTING_EXTRA_SLOT_PACKS.map((pack) => {
              const selected = selectedListingPack?.slots === pack.slots;
              return (
                <button
                  key={pack.slots}
                  type="button"
                  onClick={() => setSelectedListingPack(pack)}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors duration-200 ${
                    selected
                      ? isDark
                        ? "border-accent/60 bg-accent/10"
                        : "border-accent/50 bg-accent/[0.06]"
                      : isDark
                        ? "border-white/10 hover:bg-white/[0.05]"
                        : "border-line hover:bg-elevated"
                  }`}
                >
                  <span className={`text-[12px] ${isDark ? "text-muted/90" : "text-gray-500"}`}>
                    +{pack.slots} к лимиту
                  </span>
                  <div className="mt-1">
                    <PriceDisplay value={pack.priceRub} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <p className={`mt-4 text-[11px] leading-relaxed ${isDark ? "text-muted/70" : "text-gray-500/90"}`}>
          Мы мягко ограничиваем злоупотребления: уже сейчас аккаунт привязан к почте. Дальше — по мере роста сервиса —
          подтверждение телефона, контекст устройства, лимиты при подозрительной активности — всё очень дозировано,
          чтобы не мешать честным продавцам.
        </p>

        <button
          type="button"
          disabled={!selectedListingPack}
          onClick={() => {
            if (!selectedListingPack) return;
            const title = encodeURIComponent(`Пакет +${selectedListingPack.slots} активных объявлений`);
            safePush(
              router,
              `/payment?promoKind=listing_pack&listingPackSlots=${selectedListingPack.slots}&amount=${selectedListingPack.priceRub}&title=${title}`,
            );
          }}
          className={`mt-4 w-full min-h-[48px] rounded-xl text-[14px] font-semibold transition-all duration-200 ease-out active:scale-[0.99] ${
            selectedListingPack
              ? isDark
                ? "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-[0_8px_26px_rgba(139,95,255,0.28)] hover:brightness-[1.03]"
                : "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-md shadow-purple-500/15 hover:brightness-[1.02]"
              : isDark
                ? "cursor-not-allowed bg-white/10 text-muted"
                : "cursor-not-allowed bg-elev-2 text-muted"
          }`}
        >
          {selectedListingPack
            ? `Оформить ${formatPrice(selectedListingPack.priceRub)} ₽ · +${selectedListingPack.slots} слотов`
            : "Выберите пакет"}
        </button>
      </div>

      <div className="pt-1">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Настройки</p>
        <ThemeToggle />
        <Link
          href="/support"
          className="pressable mt-3 flex w-full min-h-[52px] items-center justify-between rounded-card border border-line bg-elevated px-4 py-3 text-left transition-colors duration-ui hover:bg-elev-2"
        >
          <span className="text-sm font-medium text-fg">Поддержка</span>
          <span className="text-sm text-muted">Открыть</span>
        </Link>
      </div>

      <button
        type="button"
        onClick={() => {
          setDeleteErr(null);
          setConfirmOpen(true);
        }}
        className="mt-3 w-full min-h-[52px] rounded-card border border-danger/40 bg-transparent py-3.5 text-sm font-semibold text-danger transition-all duration-200 hover:bg-danger/5 active:scale-[0.98]"
      >
        Удалить аккаунт
      </button>
      {deleteErr ? <p className="mt-2 text-sm text-danger">{deleteErr}</p> : null}

      <button
        type="button"
        onClick={() => {
          void (async () => {
            clearSaveEnigmaContinuationRoute();
            await signOut();
            router.replace("/login?signed_out=1");
          })();
        }}
        className="mt-3 w-full min-h-[52px] rounded-card border border-line bg-elevated py-3.5 text-sm font-semibold text-fg transition-all duration-200 hover:bg-elev-2 active:scale-[0.98]"
      >
        Выйти
      </button>
      </div>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-main/80 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-sm rounded-card border border-line bg-elevated p-6 shadow-soft">
            <h2 id="delete-account-title" className="text-lg font-semibold text-fg">
              Удалить аккаунт?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Вы уверены? Это действие нельзя отменить. Данные будут удалены; блокировки и ограничения платформы сохраняются.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
                className="pressable min-h-[48px] flex-1 rounded-card border border-line bg-transparent px-4 py-3 text-sm font-medium text-fg disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onConfirmDelete()}
                className="pressable min-h-[48px] flex-1 rounded-card bg-danger px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleting ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </main>
      <style jsx global>{`
        @keyframes card-entry {
          0% {
            transform: translateY(20px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
