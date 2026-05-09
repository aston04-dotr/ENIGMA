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

const SLOT_PACK_TAGLINE: Record<number, string> = {
  25: "Для активных продавцов",
  50: "Для расширенного каталога",
  100: "Для команд и витрины",
};

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
      <main className="safe-pt mx-auto w-full max-w-none space-y-8 bg-main px-4 pb-10 pt-10 sm:px-6 lg:px-8">
      <section className="space-y-2 pb-0.5">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-fg md:text-[28px]">Профиль</h1>
        {isDirty ? (
          <div
            className={`text-[11px] font-medium uppercase tracking-[0.12em] ${isDark ? "text-amber-100/48" : "text-amber-900/75"}`}
          >
            Несохранённые изменения
          </div>
        ) : null}
        {profile?.name ? (
          <p className="text-[19px] font-semibold tracking-[-0.015em] text-fg">{profile.name}</p>
        ) : null}
        <p className="text-[13px] leading-snug text-muted/74">{session.user?.email}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted/62">
          {profile?.public_id ? <span>ID {profile.public_id}</span> : null}
          {profile?.trust_score != null ? <span className="tabular-nums">Доверие {profile.trust_score}</span> : null}
        </div>
      </section>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-7">
      <div className="space-y-5">
      <div className="enigma-glass-sheet-soft px-5 py-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/76">Имя</p>
        <input
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.target.value);
            if (nameMessage) setNameMessage(null);
          }}
          placeholder="Введите имя"
          className="enigma-profile-input px-4 py-3 text-[16px]"
        />
        <button
          type="button"
          onClick={() => void saveName()}
          disabled={nameSaving}
          className="enigma-profile-btn-submit"
        >
          {nameSaving ? "Сохранение…" : "Сохранить"}
        </button>
        {nameMessage ? (
          <p className={`mt-2 text-[13px] leading-snug ${nameMessage === "Имя сохранено" ? "enigma-profile-hint-muted" : "text-danger"}`}>
            {nameMessage}
          </p>
        ) : null}
      </div>

      <div className="enigma-glass-sheet-soft px-5 py-5">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/76">Телефон</p>
          {!profile?.phone ? (
            <span className={`text-[11px] font-medium uppercase tracking-[0.1em] ${isDark ? "text-white/32" : "text-slate-400"}`}>не указан</span>
          ) : null}
        </div>
        <input
          value={phoneInput}
          onChange={(e) => {
            setPhoneInput(e.target.value);
            if (phoneMessage) setPhoneMessage(null);
          }}
          placeholder="Введите телефон"
          className="enigma-profile-input px-4 py-3 text-[16px]"
        />
        <button
          type="button"
          onClick={() => void savePhone()}
          disabled={phoneSaving}
          className="enigma-profile-btn-submit"
        >
          {phoneSaving ? "Сохранение…" : "Сохранить"}
        </button>
        {phoneMessage ? (
          <p className={`mt-2 text-[13px] leading-snug ${phoneMessage === "Телефон сохранён" ? "enigma-profile-hint-muted" : "text-danger"}`}>
            {phoneMessage}
          </p>
        ) : null}
      </div>

      <section className="enigma-glass-sheet-elevated px-5 py-6 sm:px-6 sm:py-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">Мои объявления</h2>
          <Link
            href="/create"
            className={`inline-flex min-h-[42px] items-center rounded-xl border px-3.5 py-2 text-[13px] font-semibold tracking-tight transition-colors active:scale-[0.99] ${
              isDark
                ? "border-[rgba(120,200,255,0.18)] bg-white/[0.05] text-white/92 hover:bg-white/[0.09]"
                : "border-[rgba(29,118,232,0.28)] bg-gradient-to-br from-white to-[#eef5ff] text-[#084298] shadow-[inset_0_1px_0_rgba(255,255,255,1)] hover:border-[rgba(29,118,232,0.45)] hover:shadow-[0_10px_24px_rgba(29,118,232,0.12)]"
            }`}
          >
            Создать
          </Link>
        </div>

        {!myListingsLoading && !myListingsError && session?.user?.id ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setListingProfileTab("active")}
              className={`min-h-[40px] rounded-xl px-4 text-[13px] font-semibold tracking-tight transition-all duration-150 active:scale-[0.99] ${
                listingProfileTab === "active"
                  ? isDark
                    ? "border border-[rgba(120,200,255,0.16)] bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-[rgba(120,200,255,0.22)]"
                    : "border border-[#1d76e8]/35 bg-[#1d76e8] text-white shadow-[0_10px_28px_rgba(29,118,232,0.28)] ring-1 ring-white/35"
                  : isDark
                    ? "border border-white/[0.08] bg-transparent text-white/58 hover:bg-white/[0.04]"
                    : "border border-[rgba(29,118,232,0.22)] bg-white/65 text-slate-700 backdrop-blur-sm hover:bg-[rgba(236,246,255,0.94)]"
              }`}
            >
              Активные
              <span className="ml-1.5 tabular-nums font-medium text-[12px] opacity-[0.65]">({activeProfileListings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setListingProfileTab("archive")}
              className={`min-h-[40px] rounded-xl px-4 text-[13px] font-semibold tracking-tight transition-all duration-150 active:scale-[0.99] ${
                listingProfileTab === "archive"
                  ? isDark
                    ? "border border-[rgba(120,200,255,0.16)] bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-[rgba(120,200,255,0.22)]"
                    : "border border-[#1d76e8]/35 bg-[#1d76e8] text-white shadow-[0_10px_28px_rgba(29,118,232,0.28)] ring-1 ring-white/35"
                  : isDark
                    ? "border border-white/[0.08] bg-transparent text-white/58 hover:bg-white/[0.04]"
                    : "border border-[rgba(29,118,232,0.22)] bg-white/65 text-slate-700 backdrop-blur-sm hover:bg-[rgba(236,246,255,0.94)]"
              }`}
            >
              Архив
              <span className="ml-1.5 tabular-nums font-medium text-[12px] opacity-[0.65]">({archiveProfileListings.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setListingProfileTab("favorites")}
              className={`min-h-[40px] rounded-xl px-4 text-[13px] font-semibold tracking-tight transition-all duration-150 active:scale-[0.99] ${
                listingProfileTab === "favorites"
                  ? isDark
                    ? "border border-[rgba(120,200,255,0.16)] bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-[rgba(120,200,255,0.22)]"
                    : "border border-[#1d76e8]/35 bg-[#1d76e8] text-white shadow-[0_10px_28px_rgba(29,118,232,0.28)] ring-1 ring-white/35"
                  : isDark
                    ? "border border-white/[0.08] bg-transparent text-white/58 hover:bg-white/[0.04]"
                    : "border border-[rgba(29,118,232,0.22)] bg-white/65 text-slate-700 backdrop-blur-sm hover:bg-[rgba(236,246,255,0.94)]"
              }`}
            >
              Избранное
              <span className="ml-1.5 tabular-nums font-medium text-[12px] opacity-[0.65]">({favoriteListings.length})</span>
            </button>
          </div>
        ) : null}

        {myListingsLoading && listingProfileTab !== "favorites" ? (
          <div className="space-y-4">
            {[0, 1, 2].map((sk) => (
              <div
                key={`sk-${sk}`}
                className="overflow-hidden rounded-[22px] border border-black/[0.035] bg-[var(--enigma-surface-3)] shadow-[0_22px_52px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-[2px] ring-1 ring-black/[0.035] dark:border-white/[0.06] dark:bg-[linear-gradient(172deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.025)_52%,transparent_100%)] dark:shadow-[0_28px_56px_rgba(0,0,0,0.42)] dark:ring-white/[0.05]"
              >
                <div className="aspect-[16/11] w-full overflow-hidden rounded-t-[22px] sm:aspect-[16/10]">
                  <div className="enigma-listing-photo-shimmer h-full w-full rounded-none" aria-hidden />
                </div>
                  <div className="space-y-2.5 p-4 pb-5">
                  <div className="h-[14px] w-[68%] max-w-[220px] rounded-[7px] bg-fg/[0.06] animate-skeleton dark:bg-white/[0.07]" />
                  <div className="h-[12px] w-[42%] max-w-[140px] rounded-[6px] bg-fg/[0.04] animate-skeleton dark:bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        ) : listingProfileTab === "favorites" && favoritesLoading ? (
          <div className="rounded-xl border border-black/[0.04] bg-black/[0.025] p-4 text-[13px] text-muted/88 dark:border-white/[0.07] dark:bg-white/[0.03]">
            Загрузка избранного…
          </div>
        ) : myListingsError ? (
          <div className="rounded-xl border border-danger/25 bg-danger/[0.045] p-4 text-[13px] text-danger">{myListingsError}</div>
        ) : (myListings || []).length === 0 && listingProfileTab !== "favorites" ? (
          <div className="rounded-xl border border-black/[0.04] bg-black/[0.02] px-4 py-4 text-[13px] leading-relaxed text-muted/84 dark:border-white/[0.07] dark:bg-white/[0.03]">
            Объявлений нет
          </div>
        ) : shownProfileListings.length === 0 ? (
          <div className="rounded-xl border border-black/[0.04] bg-black/[0.02] px-4 py-4 text-[13px] leading-relaxed text-muted/84 dark:border-white/[0.07] dark:bg-white/[0.03]">
            {listingProfileTab === "active"
              ? "Нет активных объявлений"
              : listingProfileTab === "archive"
                ? "Архив пуст"
                : "Избранное пусто"}
          </div>
        ) : (
          <div className="space-y-4">
            {shownProfileListings.map((safeListing) => {
              const isOwner = safeListing.user_id === session?.user?.id;
              return (
                <div
                  key={safeListing.id}
                  className="overflow-hidden rounded-[22px] border border-black/[0.05] shadow-[0_26px_60px_rgba(0,0,0,0.12),0_3px_10px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.03] backdrop-blur-[3px] dark:border-white/[0.07] dark:shadow-[0_32px_64px_rgba(0,0,0,0.48)] dark:ring-white/[0.04]"
                >
                  <ListingCard item={safeListing} compact favoriteRealtime={false} />
                  {isOwner && listingProfileTab !== "favorites" ? (
                    <div className="flex flex-col gap-2 p-2.5 pt-0">
                      {listingProfileTab === "archive" ? (
                        <button
                          type="button"
                          disabled={renewingListingId === safeListing.id}
                          onClick={() => void handleRenewListing(safeListing.id)}
                            className={`flex min-h-[46px] w-full items-center justify-center rounded-xl border px-3 text-[13px] font-semibold tracking-tight transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-[0.55] ${
                            isDark
                              ? "border-amber-200/22 bg-gradient-to-br from-white/[0.09] via-white/[0.04] to-transparent text-[#fdecd3] hover:border-amber-200/40 hover:bg-white/[0.06]"
                              : "border-slate-300/80 bg-white text-slate-900 hover:border-slate-400 hover:bg-[#fefefe]"
                          }`}
                        >
                          {renewingListingId === safeListing.id ? "Продление…" : "Продлить публикацию"}
                        </button>
                      ) : null}
                      <div className="flex gap-2">
                        <Link
                          href={listingEditPath(String(safeListing.id))}
                          className={`flex min-h-[42px] flex-1 items-center justify-center rounded-xl border px-3 text-[13px] font-semibold tracking-tight transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.985] ${
                            isDark
                              ? "border-white/[0.1] bg-white/[0.04] text-white/88 hover:bg-white/[0.07]"
                              : "border-slate-300/70 bg-white/95 text-slate-800 hover:bg-white"
                          }`}
                        >
                          Редактировать
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(safeListing.id)}
                          className="min-h-[42px] rounded-xl border border-danger/35 bg-transparent px-3.5 text-[13px] font-semibold tracking-tight text-danger/95 transition-colors duration-150 ease-out hover:bg-danger/[0.07] active:scale-[0.985]"
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

      <aside className="mt-8 space-y-4 lg:mt-0 lg:sticky lg:top-24 lg:self-start">
        <div
          className={`rounded-[22px] border p-5 backdrop-blur-xl ${
            isDark
              ? "border-[rgba(120,200,255,0.12)] bg-[linear-gradient(158deg,rgba(22,32,54,0.96)_0%,rgba(12,17,28,0.98)_52%,rgba(8,11,18,1)_100%)] shadow-[0_26px_64px_rgba(0,0,0,0.5),0_0_48px_rgba(84,169,255,0.06)]"
              : "border-[rgba(29,118,232,0.22)] bg-gradient-to-br from-[#f6f9ff] via-[#eaf1fc] to-[#e4edf8] shadow-[0_22px_50px_rgba(15,50,105,0.11),0_0_36px_rgba(29,118,232,0.06)] ring-1 ring-[rgba(29,118,232,0.08)]"
          }`}
        >
          <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${isDark ? "text-[#8ecfff]/72" : "text-[#1d76e8]/75"}`}>
            Продвижение
          </p>
          <p className={`mt-2 text-[17px] font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
            Выше в ленте
          </p>
          <Link
            href="#promo-status-panel"
            className={`mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border px-3 text-[13px] font-semibold tracking-tight transition-[border-color,background-color,transform,opacity] duration-150 ease-out active:scale-[0.985] ${
              isDark
                ? "border-[rgba(120,200,255,0.18)] bg-white/[0.05] text-white/92 hover:bg-white/[0.09]"
                : "border-[rgba(29,118,232,0.35)] bg-white/95 text-[#0b3d8a] shadow-[inset_0_1px_0_rgba(255,255,255,1)] hover:border-[#1d76e8]/55 hover:bg-[#f8fbff]"
            }`}
          >
            Статус продвижений
          </Link>
        </div>

      <div id="promo-status-panel" />
        <div
          className={`rounded-[22px] border p-5 backdrop-blur-xl ${
            isDark
              ? "border-[rgba(120,200,255,0.1)] bg-[linear-gradient(168deg,rgba(18,26,44,0.92)_0%,rgba(10,14,24,0.96)_100%)] shadow-[0_22px_56px_rgba(0,0,0,0.46),0_0_44px_rgba(84,169,255,0.045)]"
              : "border-[rgba(29,118,232,0.2)] bg-gradient-to-b from-white via-[#f3f8ff] to-[#eaf1fb] shadow-[0_18px_44px_rgba(22,52,105,0.1)] ring-1 ring-[rgba(29,118,232,0.07)]"
          }`}
        >
          <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${isDark ? "text-white/48" : "text-slate-500"}`}>Статус</p>
          <div className="mt-3 space-y-2">
            <div
              className={`rounded-[11px] border px-3 py-[11px] ${
                isDark
                  ? "border-[rgba(122,206,255,0.32)] bg-[linear-gradient(152deg,rgba(24,40,72,0.94)_0%,rgba(14,20,36,0.98)_58%,rgba(8,12,22,1)_100%)] shadow-[0_0_28px_rgba(84,169,255,0.14)]"
                  : "border-[rgba(29,118,232,0.42)] bg-[linear-gradient(180deg,#eaf4ff_0%,#ffffff_100%)] shadow-[0_10px_32px_rgba(29,118,232,0.12)] ring-1 ring-[rgba(29,118,232,0.14)]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[11px] font-semibold tracking-[0.18em] ${isDark ? "text-[#b8dcff]" : "text-[#054a9e]"}`}>BOOST</span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums ${isDark ? "text-[#8ecfff]/78" : "text-[#0b63d8]/88"}`}
                >
                  активен
                </span>
              </div>
              <p className={`mt-1 text-[10.5px] leading-[1.35] tracking-wide ${isDark ? "text-white/44" : "text-slate-600"}`}>Больше показов</p>
            </div>
            <div
              className={`rounded-[11px] border px-3 py-[11px] ${
                isDark
                  ? "border-[rgba(200,218,238,0.22)] bg-gradient-to-br from-[#1f283a]/96 via-[#141c2f]/98 to-[#0a101e] shadow-[inset_0_1px_0_rgba(255,255,255,0.048),0_14px_40px_rgba(0,0,0,0.28)]"
                  : "border-slate-500/42 bg-[linear-gradient(168deg,#d9e4f4_0%,#eef3fb_52%,#f9fbfe_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] ring-1 ring-slate-500/22"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-[11px] font-semibold tracking-[0.18em] ${isDark ? "text-[#e2ebfb]" : "text-slate-900"}`}
                >
                  TOP
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums ${isDark ? "text-[#aabdd6]/82" : "text-slate-700"}`}
                >
                  активен
                </span>
              </div>
              <p className={`mt-1 text-[10.5px] leading-[1.35] tracking-wide ${isDark ? "text-slate-400/78" : "text-slate-600"}`}>
                Выше в ленте
              </p>
            </div>
            <div
              className={`rounded-[11px] border px-3 py-[11px] shadow-[inset_0_1px_0_rgba(255,212,148,0.14),inset_0_0_0_1px_rgba(84,169,255,0.06)] ${
                isDark
                  ? "border-[rgba(240,206,138,0.34)] bg-[linear-gradient(168deg,#17130e_0%,#090b0d_52%,#09070b_100%)]"
                  : "border-[rgba(212,168,94,0.42)] bg-[linear-gradient(172deg,#1e2a38_0%,#151d28_48%,#0b1018_100%)] ring-1 ring-[rgba(29,118,232,0.16)]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.18em] text-[#fde7b8]">VIP</span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums ${isDark ? "text-[#f0d088]/76" : "text-[#f5dcbc]/82"}`}
                >
                  не активен
                </span>
              </div>
              <p
                className={`mt-1 text-[10.5px] leading-[1.35] tracking-wide ${
                  isDark ? "text-[rgba(240,206,154,0.58)]" : "text-[rgba(245,218,168,0.76)]"
                }`}
              >
                Максимальный приоритет
              </p>
            </div>
          </div>

          <div className={`my-[18px] h-px ${isDark ? "bg-white/[0.055]" : "bg-slate-200/82"}`} />
          <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${isDark ? "text-white/44" : "text-slate-500"}`}>Слоты</p>
          <div
            className={`mt-3 flex items-baseline justify-between gap-3 rounded-[11px] border px-3.5 py-3 ${
              isDark ? "border-[rgba(120,200,255,0.1)] bg-white/[0.045]" : "border-[rgba(29,118,232,0.22)] bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,1)]"
            }`}
          >
            <span className={`text-[12px] font-medium tracking-tight ${isDark ? "text-white/64" : "text-slate-600"}`}>Дополнительные</span>
            <span className={`text-[28px] font-semibold tabular-nums tracking-[-0.03em] leading-none ${isDark ? "text-[#f2f9ff]" : "text-[#061428]"}`}>{listingExtraCapacity}</span>
          </div>
        </div>

      {/* ПАКЕТЫ И РАЗМЕЩЕНИЕ */}
        <div
          id="packages-panel"
          className={`relative overflow-hidden rounded-[22px] border shadow-[0_28px_64px_rgba(0,0,0,0.38)] backdrop-blur-xl ${
            isDark
              ? "border-[rgba(120,200,255,0.09)] bg-gradient-to-b from-[#121a2e] via-[#0c1220] to-[#080e18] shadow-[0_28px_64px_rgba(0,0,0,0.52),0_0_52px_rgba(84,169,255,0.045)]"
              : "border-[#1e3a5c]/55 bg-gradient-to-b from-[#152033] via-[#101928] to-[#0d1522] shadow-[0_28px_64px_rgba(10,35,72,0.35)] ring-2 ring-[rgba(29,118,232,0.18)]"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_80%_100%_at_50%_0%,rgba(212,175,122,0.16),transparent_65%)]"
            aria-hidden
          />

          <div className="relative px-5 pb-6 pt-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/38">Размещение</p>
            <p className="mt-2 text-[29px] font-semibold tracking-[-0.03em] leading-none text-white/97 tabular-nums">
              {placementQuota.active}<span className="mx-1 align-baseline text-[20px] font-normal text-white/28">/</span>{placementQuota.max}
            </p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-white/32">активных</p>
            <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-white/75 via-amber-200/55 to-amber-100/42 transition-[width] duration-500 ease-out"
                style={{ width: `${placementQuota.fillPct}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] text-white/30">{FREE_ACTIVE_LISTINGS_CAP} бесплатно включено</p>
            {listingExtraCapacity > 0 ? (
              <p className="mt-2 text-[11px] text-amber-200/35">ещё +{listingExtraCapacity} по пакету</p>
            ) : null}
          </div>

          <div className="relative border-t border-white/[0.055] bg-black/30 px-5 py-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/32">
              Ещё слотов
            </p>
            <div className="mt-4 space-y-2.5">
              {LISTING_EXTRA_SLOT_PACKS.map((pack) => {
                const selected = selectedListingPack?.slots === pack.slots;
                return (
                  <button
                    key={pack.slots}
                    type="button"
                    onClick={() => setSelectedListingPack(pack)}
                    className={`flex w-full items-start justify-between gap-4 rounded-[13px] border px-4 py-[15px] text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.995] ${
                      selected
                        ? isDark
                          ? "border-amber-200/52 bg-white/[0.095] shadow-[0_14px_36px_rgba(0,0,0,0.42)]"
                          : "border-amber-200/62 bg-white/[0.12] shadow-[0_16px_44px_rgba(0,0,0,0.38)] ring-1 ring-[rgba(255,232,195,0.22)]"
                        : isDark
                          ? "border-white/[0.06] bg-white/[0.035] hover:border-white/[0.11]"
                          : "border-white/[0.095] bg-white/[0.066] hover:border-white/[0.14]"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-[19px] font-semibold tracking-tight text-white/[0.97] tabular-nums">
                        +{pack.slots} слотов
                      </span>
                      <p className={`mt-1 text-[10.5px] tracking-wide ${isDark ? "text-white/[0.36]" : "text-white/[0.44]"}`}>
                        {SLOT_PACK_TAGLINE[pack.slots] ?? ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 tabular-nums tracking-[-0.025em] ${
                        isDark
                          ? "text-[25px] font-bold text-[#fff6ec] drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
                          : "text-[25px] font-bold text-[#fffdfa] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5),0_0_32px_rgba(255,230,206,0.42)]"
                      }`}
                    >
                      {formatPrice(pack.priceRub)}
                      <span
                        className={`ml-[3px] tabular-nums align-baseline ${
                          isDark ? "text-[14px] font-semibold text-[#ffe8cf]/92" : "text-[14px] font-bold text-[#fff2e6]/94"
                        }`}
                      >
                        ₽
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

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
                  className={`mt-5 min-h-[50px] w-full rounded-xl text-[15px] font-bold tracking-tight transition-all active:scale-[0.99] ${
                selectedListingPack
                  ? "border border-amber-200/45 bg-gradient-to-br from-[#e9d9b6] via-[#d4bf91] to-[#b6945e] text-stone-900 shadow-[0_16px_40px_rgba(0,0,0,0.42)] hover:brightness-[1.05]"
                  : "cursor-not-allowed border border-white/[0.07] bg-white/[0.04] text-white/30"
              }`}
            >
              {selectedListingPack ? `${formatPrice(selectedListingPack.priceRub)} ₽` : "Выберите объём"}
            </button>
          </div>
        </div>

        <div className="enigma-glass-sheet-soft p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Настройки</p>
          <ThemeToggle />
          <Link
            href="/support"
            className={`pressable mt-4 flex min-h-[50px] w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left transition-all hover:bg-black/[0.03] dark:hover:bg-white/[0.04]`}
          >
            <span className="text-sm font-medium text-fg">Поддержка</span>
            <span className="text-sm text-muted">→</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => {
            setDeleteErr(null);
            setConfirmOpen(true);
          }}
          className="w-full rounded-xl border border-danger/35 bg-transparent py-3.5 text-sm font-semibold text-danger transition-all hover:bg-danger/[0.06] active:scale-[0.98]"
        >
          Удалить аккаунт
        </button>
        {deleteErr ? <p className="text-sm text-danger">{deleteErr}</p> : null}

        <button
          type="button"
          onClick={() => {
            void (async () => {
              clearSaveEnigmaContinuationRoute();
              await signOut();
              router.replace("/login?signed_out=1");
            })();
          }}
          className={`w-full rounded-xl border py-3.5 text-sm font-semibold transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.05] active:scale-[0.98] ${
            isDark ? "border-white/[0.1] text-white/90" : "border-slate-300/75 text-fg"
          }`}
        >
          Выйти
        </button>
      </aside>
      </div>
      </main>

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
    </>
  );
}
