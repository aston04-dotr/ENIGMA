"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { ListingCard } from "@/components/ListingCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { getMyListings } from "@/lib/listings";
import { deleteAccount } from "@/lib/deleteAccount";
import { removeListingImagesFromStorage } from "@/lib/storageUploadWeb";
import { supabase } from "@/lib/supabase";
import { isValidRussianPhone, normalizeRussianPhone } from "@/lib/phoneUtils";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ListingRow } from "@/lib/types";

type PackageSize = "small" | "base" | "pro";

type PackageInfo = {
  count: number;
  price: number;
  perAd: number;
};

/** Форматирование цены с пробелами и разделителем */
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

const packageInfo: Record<string, Record<PackageSize, PackageInfo>> = {
  general: {
    small: { count: 10, price: 1500, perAd: 150 },
    base: { count: 25, price: 3500, perAd: 140 },
    pro: { count: 50, price: 6000, perAd: 120 },
  },
  realty: {
    small: { count: 3, price: 2000, perAd: 667 },
    base: { count: 7, price: 4000, perAd: 571 },
    pro: { count: 15, price: 9000, perAd: 600 },
  },
  auto: {
    small: { count: 3, price: 1500, perAd: 500 },
    base: { count: 7, price: 3900, perAd: 557 },
    pro: { count: 15, price: 7900, perAd: 527 },
  },
};

/** Расчет цены за кастомное количество - ТОЛЬКО цены из пакетов, без дробей */
function calculateCustomPrice(type: string, quantity: number): { total: number; perAd: number } {
  const packages = packageInfo[type];
  if (!packages) return { total: 0, perAd: 0 };

  // ЖЁСТКИЕ ЦЕНЫ ПАКЕТОВ (без расчётов)
  if (type === "general") {
    if (quantity <= 10) return { total: 1500, perAd: 150 }; // small
    if (quantity <= 25) return { total: 3500, perAd: 140 }; // base
    return { total: 6000, perAd: 120 }; // pro
  }

  if (type === "auto") {
    if (quantity <= 3) return { total: 1500, perAd: 500 }; // small
    if (quantity <= 7) return { total: 3900, perAd: 557 }; // base
    return { total: 7900, perAd: 527 }; // pro
  }

  if (type === "realty") {
    if (quantity <= 3) return { total: 2000, perAd: 667 }; // small
    if (quantity <= 7) return { total: 4000, perAd: 571 }; // base
    return { total: 9000, perAd: 600 }; // pro
  }

  return { total: 0, perAd: 0 };
}

export default function ProfilePage() {
  const { session, profile, signOut, authResolved, loading, refreshProfile } = useAuth();
  const { theme, mounted } = useTheme();
  // Use dark as default for SSR consistency, switch after mount
  const isDark = mounted ? theme === "dark" : true;
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<{ type: string; size: PackageSize } | null>({ type: "general", size: "base" });
  const [customQuantity, setCustomQuantity] = useState<string>("");
  const [customType, setCustomType] = useState<string>("general");
  const [isCustom, setIsCustom] = useState<boolean>(false);
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
  const profileNameValue = (profile?.name ?? "").trim();
  const profilePhoneValue = (profile?.phone ?? "").trim();
  const isDirty =
    nameInput.trim() !== profileNameValue ||
    phoneInput.trim() !== profilePhoneValue;
  const { safePush } = useUnsavedChangesGuard(isDirty, { enabled: guardEnabled });

  useEffect(() => {
    if (!authResolved || loading) return;
    if (!session) router.replace("/login");
  }, [session, router, authResolved, loading]);

  useEffect(() => {
    setNameInput(profile?.name ?? "");
  }, [profile?.name]);

  useEffect(() => {
    setPhoneInput(profile?.phone ?? "");
  }, [profile?.phone]);

  useEffect(() => {
    if (!authResolved || loading) return;
    const uid = session?.user?.id;
    if (!uid) {
      setMyListings([]);
      setMyListingsLoading(false);
      return;
    }

    let cancelled = false;
    setMyListingsLoading(true);
    setMyListingsError(null);

    void (async () => {
      try {
        const rows = await getMyListings(uid);
        if (cancelled) return;
        setMyListings(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (cancelled) return;
        console.error("MY LISTINGS LOAD ERROR", error);
        setMyListings([]);
        setMyListingsError("Не удалось загрузить ваши объявления");
      } finally {
        if (!cancelled) setMyListingsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, authResolved, loading]);

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
      return "Нет прав на сохранение. Выйдите и войдите снова.";
    }
    return raw || "Не удалось сохранить телефон";
  }

  async function savePhone() {
    if (!session?.user?.id) return;
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

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        phone: normalized,
        phone_updated_at: normalized ? now : null,
        updated_at: now,
      })
      .eq("id", uid)
      .select("id, phone")
      .maybeSingle();

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
        setPhoneMessage("Сессия истекла. Войдите снова");
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
    await refreshProfile();
    setPhoneMessage(normalized ? "Телефон сохранён" : "Телефон очищен");
  }

  async function saveName() {
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) return;
    console.log("UPSERT USER ID:", authUser.id);
    setNameSaving(true);
    setNameMessage(null);
    const { error } = await supabase.from("profiles").upsert(
      {
        id: authUser.id,
        name: nameInput.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    setNameSaving(false);
    if (error) {
      setNameMessage(error.message || "Не удалось сохранить имя");
      return;
    }
    await refreshProfile();
    setNameMessage("Имя сохранено");
  }

  if (!session) {
    return <AuthLoadingScreen />;
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
        <div className="mb-4 flex items-center justify-between gap-3">
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

        {myListingsLoading ? (
          <div className="rounded-card border border-line bg-elevated p-4 text-sm text-muted">Загрузка...</div>
        ) : myListingsError ? (
          <div className="rounded-card border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{myListingsError}</div>
        ) : (myListings || []).length === 0 ? (
          <div className="rounded-card border border-line bg-elevated p-4 text-sm text-muted">У вас пока нет объявлений</div>
        ) : (
          <div className="space-y-4">
            {(myListings || [])
              .filter(
                (listing) =>
                  listing && typeof listing === "object" && Boolean(listing.id),
              )
              .map((safeListing) => {
              const isOwner = safeListing.user_id === session?.user?.id;
              return (
                <div key={safeListing.id} className="rounded-[16px] bg-elevated/28 p-1.5 transition-all duration-200">
                  <ListingCard item={safeListing} compact />
                  {isOwner ? (
                    <div className="flex gap-2 p-2.5 pt-0">
                      <Link
                        href={`/listing/edit/${safeListing.id}`}
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
        <p className={`text-[16px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>Увеличьте просмотры</p>
        <p className={`mt-1 text-[13px] leading-[1.35] ${isDark ? "text-muted/80" : "text-gray-600/80"}`}>
          Продвигайте объявления и получайте больше откликов
        </p>
        <Link
          href="#packages-panel"
          className={`mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] border px-3 text-[14px] font-medium transition-all duration-200 ease-in-out hover:brightness-105 active:scale-[0.98] ${
            isDark
              ? "border-[rgba(139,95,255,0.35)] bg-[rgba(139,95,255,0.12)] text-white hover:bg-[rgba(139,95,255,0.18)]"
              : "border-[rgba(139,95,255,0.35)] bg-[rgba(139,95,255,0.10)] text-[#2d2159] hover:bg-[rgba(139,95,255,0.16)]"
          }`}
        >
          <span className="mr-1" aria-hidden>
            ⚡
          </span>
          Продвинуть объявление
        </Link>
      </div>

      {/* ПАНЕЛЬ: МОЙ СТАТУС + МОИ ПАКЕТЫ */}
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
            <div className="flex items-center gap-3">
              <span className="text-[18px]">🔥</span>
              <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>Boost</span>
            </div>
            <span className={`text-[12px] font-medium transition-colors duration-200 ${
              isDark ? "text-accent" : "text-[#22c55e] hover:text-[#16a34a]"
            }`}>АКТИВЕН</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-[18px]">💎</span>
              <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>VIP</span>
            </div>
            <span className={`text-[12px] font-medium transition-colors duration-200 ${
              isDark ? "text-muted/80 hover:text-fg/70" : "text-[#9ca3af] hover:text-[#6b7280]"
            }`}>не активен</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-[18px]">🚀</span>
              <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>TOP</span>
            </div>
            <span className={`text-[12px] font-medium transition-colors duration-200 ${
              isDark ? "text-accent" : "text-[#22c55e] hover:text-[#16a34a]"
            }`}>АКТИВЕН</span>
          </div>
        </div>
        <div className={`my-3 h-px ${isDark ? "bg-white/[0.08]" : "bg-black/[0.05]"}`} />
        <p className={`mb-2.5 text-[15px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>Мои пакеты</p>
        <div className="space-y-1.5">
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[14px] font-medium ${isDark ? "text-white" : "text-[#111]"}`}>Поднятий</span>
            <span className={`text-[18px] font-medium ${isDark ? "text-accent/95" : "text-[#6f56cf]"}`}>3</span>
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
        <p className={`text-[16px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>Пакеты и размещение</p>

        {/* Бесплатные размещения */}
        <div className={`mt-3.5 rounded-xl p-3.5 ${isDark ? "bg-white/5" : "bg-[#f8fafc]"}`}>
          <p className={`text-[14px] font-semibold ${isDark ? "text-white" : "text-[#111]"}`}>
            Бесплатные размещения
          </p>
          <p className={`mt-1.5 text-[13px] leading-[1.35] ${isDark ? "text-muted/80" : "text-gray-600/80"}`}>
            До 2 объявлений бесплатно во всех категориях, кроме Авто и Недвижимости.
          </p>
          <p className={`mt-1.5 text-[13px] leading-[1.35] ${isDark ? "text-muted/80" : "text-gray-600/80"}`}>
            В Авто и Недвижимости - по 1 бесплатному объявлению.
          </p>
          <p className={`mt-3 text-[12px] ${isDark ? "text-accent/90" : "text-[#7c3aed]/90"}`}>
            Следующее бесплатное в недвижимости - через 3 месяца.
          </p>
        </div>

        {/* Якорь цены */}
        <div className={`mt-3.5 rounded-xl border-l-4 p-3 ${isDark ? "bg-white/5 border-l-accent/50" : "bg-gray-50 border-l-[#8B5FFF]/50"}`}>
          <p className={`text-[12px] ${isDark ? "text-muted/80" : "text-gray-500/85"}`}>Размещение по одному</p>
          <div className="mt-1">
            <span className={`inline-flex items-baseline text-[18px] font-semibold tracking-tight ${isDark ? "text-white" : "text-[#111]"}`}>
              <span>200</span>
              <span className="text-[14px] ml-1 opacity-60">₽</span>
            </span>
            <span className={`ml-1 text-[12px] ${isDark ? "text-muted/80" : "text-gray-500/85"}`}>/ объявление</span>
          </div>
        </div>

        {/* Пакеты: 3 понятных блока без смешивания категорий */}
        <div className="mt-5 rounded-2xl bg-elevated p-4">
          {[
            { type: "realty", title: "Недвижимость" },
            { type: "auto", title: "Авто" },
            { type: "general", title: "Общие пакеты" },
          ].map((section) => (
            <div
              key={section.type}
              className={`rounded-2xl border border-line bg-elevated p-3 ${section.type === "realty" ? "" : "mt-5"}`}
            >
              <h3 className="text-[16px] font-semibold tracking-tight text-fg">
                {section.title}
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2.5 xl:grid-cols-2">
                {(Object.entries(packageInfo[section.type] || {}) as [PackageSize, PackageInfo][])
                  .map(([size, info]) => {
                    const selected =
                      !isCustom &&
                      selectedPackage?.type === section.type &&
                      selectedPackage?.size === size;
                    const isHitPackage =
                      size === "base" &&
                      (section.type === "general" ||
                        section.type === "realty" ||
                        section.type === "auto");
                    return (
                      <article
                        key={`${section.type}-${size}`}
                        className={`overflow-hidden rounded-xl border bg-elevated p-2.5 transition-all duration-200 ease-in-out hover:-translate-y-[2px] ${
                          selected
                            ? "border-accent shadow-md shadow-accent/20"
                            : "border-line"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm text-muted">{info.count} объявлений</span>
                          {isHitPackage ? (
                            <span className="badge-hit shrink-0">🔥 Хит</span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-fg">
                          <PriceDisplay value={info.price} size="lg" />
                        </div>
                        <p className="mt-1 text-[12px] text-muted">
                          Выгоднее, чем поштучно
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPackage({ type: section.type, size });
                            setIsCustom(false);
                            setCustomQuantity("");
                          }}
                          className={`pressable mt-3 min-h-[42px] w-full rounded-lg border text-[13px] font-semibold transition-all duration-200 hover:-translate-y-[1px] active:scale-[0.97] ${
                            selected
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-accent bg-accent text-white"
                          }`}
                        >
                          {selected ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden>✔</span>
                              <span>Выбрано</span>
                            </span>
                          ) : (
                            "Выбрать"
                          )}
                        </button>
                      </article>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/* Свое количество */}
        <div className="mt-5 border-t border-dashed border-gray-300/50 pt-4 dark:border-gray-600/30">
          <p className={`mb-4 text-[15px] font-semibold ${isDark ? "text-fg" : "text-[#111]"}`}>Свое количество</p>
          
          {/* Тип категории */}
          <div className="mb-3 flex gap-2">
            {[
              { id: "general", label: "Общие" },
              { id: "auto", label: "Авто" },
              { id: "realty", label: "Недвижимость" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setCustomType(t.id);
                  setIsCustom(true);
                  setSelectedPackage(null);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200 hover:brightness-105 active:scale-[0.98] ${
                  isCustom && customType === t.id
                    ? (isDark ? "bg-accent/20 text-accent border border-accent/30" : "bg-[#f3f0ff] text-[#7c3aed] border border-[#8B5FFF]/30")
                    : (isDark ? "bg-white/5 text-muted border border-transparent hover:bg-white/10" : "bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200")
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          
          {/* Input */}
          <div className="relative">
            <input
              type="number"
              min={1}
              max={500}
              value={customQuantity}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 500)) {
                  setCustomQuantity(val);
                  if (val && parseInt(val) > 0) {
                    setIsCustom(true);
                    setSelectedPackage(null);
                  }
                }
              }}
              onFocus={() => {
                setIsCustom(true);
                setSelectedPackage(null);
              }}
              placeholder="Введите количество"
              className={`h-[46px] w-full rounded-xl px-4 text-[14px] font-medium outline-none transition-all duration-200 ${
                isDark
                  ? "bg-white/5 border border-white/10 text-white placeholder:text-muted/80 focus:border-accent/50 focus:bg-white/[0.07]"
                  : "bg-elev-2 border border-line text-fg placeholder:text-muted/70 focus:border-accent/40 focus:bg-elevated"
              }`}
            />
            <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-[13px] ${isDark ? "text-muted/60" : "text-gray-400"}`}>шт</span>
          </div>
          
          {/* Расчет цены */}
          {customQuantity && parseInt(customQuantity) > 0 && (
            <div className="mt-3.5 rounded-xl border border-[#8B5FFF]/10 bg-gradient-to-br from-[#8B5FFF]/5 to-[#22d3ee]/5 p-3.5">
              <div className="flex items-baseline gap-1">
                <span className={`text-[12px] ${isDark ? "text-muted/80" : "text-gray-500/85"}`}>Итого:</span>
                <span className={`text-[18px] font-semibold ${isDark ? "text-fg" : "text-[#111]"}`}>
                  {formatPrice(calculateCustomPrice(customType, parseInt(customQuantity)).total)}
                </span>
                <span className={`text-[14px] ml-1 opacity-60 ${isDark ? "text-fg" : "text-[#111]"}`}>₽</span>
              </div>
              <p className={`mt-1 text-[12px] ${isDark ? "text-muted/75" : "text-gray-500/85"}`}>
                {formatPrice(calculateCustomPrice(customType, parseInt(customQuantity)).perAd)} ₽ за размещение
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => {
            if (isCustom && customQuantity && parseInt(customQuantity) > 0) {
              const qty = parseInt(customQuantity);
              const { total } = calculateCustomPrice(customType, qty);
              console.log("BUY CUSTOM", { type: customType, quantity: qty, total });
              safePush(router, `/payment?type=${customType}&qty=${qty}&amount=${total}`);
            } else if (selectedPackage) {
              const pkg = packageInfo[selectedPackage.type]?.[selectedPackage.size as PackageSize];
              const count = pkg?.count ?? 0;
              const price = pkg?.price ?? 0;
              console.log("BUY PACKAGE", { type: selectedPackage.type, size: selectedPackage.size, count, price });
              safePush(
                router,
                `/payment?type=${selectedPackage.type}&size=${selectedPackage.size}&qty=${count}&amount=${price}`,
              );
            }
          }}
          className={`enigma-final-cta mt-5 w-full min-h-[48px] rounded-xl text-[14px] font-semibold transition-all duration-200 ease-in-out hover:brightness-105 active:scale-[0.98] ${
            (selectedPackage || (isCustom && customQuantity && parseInt(customQuantity) > 0))
              ? (isDark
                  ? "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-[0_8px_30px_rgba(139,95,255,0.35),0_0_40px_rgba(110,231,255,0.12)]"
                  : "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-md shadow-purple-500/20")
              : (isDark
                  ? "bg-white/10 text-muted hover:bg-white/15 border border-line/30"
                  : "bg-elev-2 text-muted border border-line")
          }`}
        >
          {(() => {
            if (isCustom && customQuantity && parseInt(customQuantity) > 0) {
              const qty = parseInt(customQuantity);
              const { total } = calculateCustomPrice(customType, qty);
              const label = customType === "realty" ? "размещений в недвижимости" : customType === "auto" ? "размещений в авто" : "размещений";
              return `Купить ${qty} ${label} - ${formatPrice(total)} ₽`;
            }
            if (selectedPackage) {
              const pkg = packageInfo[selectedPackage.type]?.[selectedPackage.size as PackageSize];
              const count = pkg?.count ?? 0;
              const price = pkg?.price ?? 0;
              const label = selectedPackage.type === "realty" ? "размещений в недвижимости" : selectedPackage.type === "auto" ? "размещений в авто" : "размещений";
              return `Купить ${count} ${label} - ${formatPrice(price)} ₽`;
            }
            return "Выбрать пакет";
          })()}
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
        onClick={() => void signOut()}
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
