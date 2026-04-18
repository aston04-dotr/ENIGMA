"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { supabase } from "@/lib/supabase";
import { isValidRussianPhone, normalizeRussianPhone } from "@/lib/phoneUtils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    <span className={`inline-flex items-baseline ${sizeClasses[size].num} font-semibold tracking-tight`}>
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
    small: { count: 10, price: 1800, perAd: 180 },
    base: { count: 25, price: 4000, perAd: 160 },
    pro: { count: 50, price: 7000, perAd: 140 },
  },
  realty: {
    small: { count: 3, price: 4000, perAd: 1333 },
    base: { count: 7, price: 8500, perAd: 1214 },
    pro: { count: 15, price: 16500, perAd: 1100 },
  },
  auto: {
    small: { count: 3, price: 2500, perAd: 833 },
    base: { count: 7, price: 5500, perAd: 786 },
    pro: { count: 15, price: 10500, perAd: 700 },
  },
};

/** Расчет цены за кастомное количество - ТОЛЬКО цены из пакетов, без дробей */
function calculateCustomPrice(type: string, quantity: number): { total: number; perAd: number } {
  const packages = packageInfo[type];
  if (!packages) return { total: 0, perAd: 0 };

  // ЖЁСТКИЕ ЦЕНЫ ПАКЕТОВ (без расчётов)
  if (type === "general") {
    if (quantity <= 10) return { total: 1800, perAd: 180 }; // small
    if (quantity <= 25) return { total: 4000, perAd: 160 }; // base
    return { total: 7000, perAd: 140 }; // pro
  }

  if (type === "auto") {
    if (quantity <= 3) return { total: 2500, perAd: 833 }; // small
    if (quantity <= 7) return { total: 5500, perAd: 786 }; // base
    return { total: 10500, perAd: 700 }; // pro
  }

  if (type === "realty") {
    if (quantity <= 3) return { total: 4000, perAd: 1333 }; // small
    if (quantity <= 7) return { total: 8500, perAd: 1214 }; // base
    return { total: 16500, perAd: 1100 }; // pro
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

  async function onConfirmDelete() {
    setDeleteErr(null);
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        console.error("delete_my_account error", error);
        setDeleteErr(error.message ?? "Не удалось удалить аккаунт");
        return;
      }
      await supabase.auth.signOut();
      router.push('/login');
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
      <main className="safe-pt space-y-2 bg-main px-5 pb-8 pt-8">
      <h1 className="text-[26px] font-bold tracking-tight text-fg">Профиль</h1>
      <p className="text-sm text-muted">{session.user?.email}</p>
      {profile?.name ? <p className="text-lg font-semibold text-fg">{profile.name}</p> : null}
      {profile?.public_id ? <p className="text-xs text-muted">ID: {profile.public_id}</p> : null}
      {profile?.trust_score != null ? (
        <p className="text-sm text-muted">Доверие: {profile.trust_score}</p>
      ) : null}

      <div className={`mt-4 rounded-[16px] p-4 border ${
        !profile?.name
          ? (isDark ? "bg-elevated border-line/30" : "bg-white border-[rgba(0,0,0,0.06)] shadow-[0_4px_20px_rgba(0,0,0,0.04)]")
          : (isDark ? "bg-elevated border-line/30" : "bg-white border-[rgba(0,0,0,0.06)] shadow-[0_4px_20px_rgba(0,0,0,0.04)]")
      }`}>
        <p className={`text-[13px] mb-2 ${isDark ? "text-muted" : "text-gray-500"}`}>Имя</p>
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
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-accent-hover disabled:opacity-50"
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
      <div className={`mt-4 rounded-[16px] p-4 border ${
        !profile?.phone 
          ? (isDark ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200")
          : (isDark ? "bg-elevated border-line/30" : "bg-white border-[rgba(0,0,0,0.06)] shadow-[0_4px_20px_rgba(0,0,0,0.04)]")
      }`}>
        <p className={`text-[13px] mb-2 ${isDark ? "text-muted" : "text-gray-500"}`}>Номер телефона</p>
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
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-accent-hover disabled:opacity-50"
        >
          {phoneSaving ? "Сохранение..." : "Сохранить"}
        </button>
        {phoneMessage ? (
          <p className={`mt-2 text-sm ${phoneMessage === "Телефон сохранён" ? "text-accent" : "text-danger"}`}>
            {phoneMessage}
          </p>
        ) : null}
      </div>

      {/* МОЙ СТАТУС */}
      <div className={`mt-6 rounded-[20px] p-[18px] border card-animate ${
        isDark 
          ? "bg-gradient-to-br from-[#1a1f2e] to-[#0f1419] border-line/30" 
          : "bg-white border-[rgba(0,0,0,0.06)] shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      }`}>
        <p className={`text-[15px] font-bold mb-3 ${isDark ? "text-fg" : "text-[#111]"}`}>Мой статус</p>
        <div className="space-y-2">
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-[18px]">🔥</span>
              <span className={`text-[15px] ${isDark ? "text-fg" : "text-[#111]"}`}>Boost</span>
            </div>
            <span className={`text-[13px] font-semibold transition-colors duration-200 ${
              isDark ? "text-accent" : "text-[#22c55e] hover:text-[#16a34a]"
            }`}>АКТИВЕН</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-[18px]">💎</span>
              <span className={`text-[15px] ${isDark ? "text-fg" : "text-[#111]"}`}>VIP</span>
            </div>
            <span className={`text-[13px] font-semibold transition-colors duration-200 ${
              isDark ? "text-muted hover:text-fg/70" : "text-[#9ca3af] hover:text-[#6b7280]"
            }`}>не активен</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-[18px]">🚀</span>
              <span className={`text-[15px] ${isDark ? "text-fg" : "text-[#111]"}`}>TOP</span>
            </div>
            <span className={`text-[13px] font-semibold transition-colors duration-200 ${
              isDark ? "text-accent" : "text-[#22c55e] hover:text-[#16a34a]"
            }`}>АКТИВЕН</span>
          </div>
        </div>
      </div>

      {/* МОИ ПАКЕТЫ */}
      <div className={`mt-4 rounded-[20px] p-[18px] border card-animate ${
        isDark 
          ? "bg-elevated border-line/30" 
          : "bg-white border-[rgba(0,0,0,0.06)] shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      }`}>
        <p className={`text-[15px] font-bold mb-3 ${isDark ? "text-fg" : "text-[#111]"}`}>Мои пакеты</p>
        <div className="space-y-2">
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[15px] ${isDark ? "text-fg" : "text-[#111]"}`}>Поднятий</span>
            <span className={`text-[20px] font-bold ${isDark ? "text-accent" : "text-[#7c3aed]"}`}>3</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[15px] ${isDark ? "text-fg" : "text-[#111]"}`}>VIP дней</span>
            <span className={`text-[20px] font-bold ${isDark ? "text-muted" : "text-[#9ca3af]"}`}>0</span>
          </div>
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-200 ${
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
          }`}>
            <span className={`text-[15px] ${isDark ? "text-fg" : "text-[#111]"}`}>TOP размещений</span>
            <span className={`text-[20px] font-bold ${isDark ? "text-accent" : "text-[#7c3aed]"}`}>1</span>
          </div>
        </div>
      </div>

      {/* ПАКЕТЫ И РАЗМЕЩЕНИЕ */}
      <div className={`mt-6 rounded-[20px] p-6 border card-animate ${
        isDark
          ? "bg-elevated border-line/30"
          : "bg-white border-[rgba(0,0,0,0.06)] shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      }`}>
        <p className={`text-[17px] font-bold ${isDark ? "text-fg" : "text-[#111]"}`}>Пакеты и размещение</p>

        {/* Бесплатные размещения */}
        <div className={`mt-6 rounded-xl p-4 ${isDark ? "bg-white/5" : "bg-[#f8fafc]"}`}>
          <p className={`text-[15px] font-semibold ${isDark ? "text-fg" : "text-[#111]"}`}>
            Бесплатные размещения
          </p>
          <p className={`text-[14px] mt-2 ${isDark ? "text-muted" : "text-gray-600"}`}>
            До 2 объявлений бесплатно во всех категориях, кроме Авто и Недвижимости.
          </p>
          <p className={`text-[14px] mt-2 ${isDark ? "text-muted" : "text-gray-600"}`}>
            В Авто и Недвижимости - по 1 бесплатному объявлению.
          </p>
          <p className={`text-[13px] mt-3 ${isDark ? "text-accent" : "text-[#7c3aed]"}`}>
            Следующее бесплатное в недвижимости - через 3 месяца.
          </p>
        </div>

        {/* Якорь цены */}
        <div className={`mt-6 rounded-xl p-3 border-l-4 ${isDark ? "bg-white/5 border-l-accent/50" : "bg-gray-50 border-l-[#8B5FFF]/50"}`}>
          <p className={`text-[13px] ${isDark ? "text-muted" : "text-gray-500"}`}>Размещение по одному</p>
          <div className="mt-1">
            <span className={`inline-flex items-baseline text-[20px] font-bold tracking-tight ${isDark ? "text-fg" : "text-[#111]"}`}>
              <span>200</span>
              <span className="text-[14px] ml-1 opacity-60">₽</span>
            </span>
            <span className={`text-[13px] ml-1 ${isDark ? "text-muted" : "text-gray-500"}`}>/ объявление</span>
          </div>
        </div>

        {/* Пакеты размещений */}
        <div className="mt-8">
          <p className={`text-[15px] font-semibold ${isDark ? "text-fg" : "text-[#111]"}`}>Пакеты размещений</p>
          <div className="mt-4 grid grid-cols-3 gap-3 items-stretch">
            {/* SMALL */}
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "general", size: "small" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "general" && selectedPackage?.size === "small"
                  ? (isDark ? "bg-white/10 border border-accent/50 shadow-md opacity-100" : "bg-gray-50 border border-[#8B5FFF]/40 shadow-sm opacity-100")
                  : (isDark ? "bg-white/[0.03] border-0 opacity-60 hover:opacity-80 hover:scale-[1.02]" : "bg-gray-50/50 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <p className={`text-[14px] font-medium ${isDark ? "text-muted" : "text-gray-600"}`}>10</p>
              <div className="mt-1">
                <PriceDisplay value={1800} size="sm" />
              </div>
              <p className={`text-[10px] mt-1 ${isDark ? "text-muted/60" : "text-gray-400"}`}>
                <span className="inline-flex items-baseline">
                  <span>180</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>

            {/* BASE - выделенный */}
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "general", size: "base" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "general" && selectedPackage?.size === "base"
                  ? (isDark ? "bg-accent/10 border-2 border-accent/50 shadow-lg opacity-100 scale-[1.02]" : "bg-[#f3f0ff] border-2 border-[#8B5FFF]/50 shadow-md opacity-100 scale-[1.02]")
                  : (isDark ? "bg-accent/5 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]" : "bg-[#f3f0ff]/60 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${isDark ? "bg-accent/80 text-white" : "bg-[#8B5FFF] text-white"}`}>Оптимальный</span>
              <p className={`text-[16px] font-bold ${isDark ? "text-accent" : "text-[#7c3aed]"}`}>25</p>
              <div className="mt-0.5">
                <PriceDisplay value={4000} size="md" />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-accent/70" : "text-[#7c3aed]/80"}`}>
                <span className="inline-flex items-baseline">
                  <span>160</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>

            {/* PRO */}
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "general", size: "pro" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "general" && selectedPackage?.size === "pro"
                  ? (isDark ? "bg-white/10 border border-accent/40 shadow-md opacity-100" : "bg-white border border-[#8B5FFF]/30 shadow-sm opacity-100")
                  : (isDark ? "bg-white/5 border-0 opacity-60 hover:opacity-80 hover:scale-[1.02]" : "bg-white/80 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${isDark ? "bg-white/20 text-white/90" : "bg-gray-100 text-gray-600"}`}>Максимум выгоды 🔥🔥🔥</span>
              <p className={`text-[15px] font-bold ${isDark ? "text-fg" : "text-[#111]"}`}>50</p>
              <div className="mt-1">
                <PriceDisplay value={7000} size="sm" />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-accent/60" : "text-[#7c3aed]/70"}`}>
                <span className="inline-flex items-baseline">
                  <span>140</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
          </div>
        </div>

        {/* Пакеты для недвижимости */}
        <div className="mt-8">
          <p className={`text-[15px] font-semibold ${isDark ? "text-fg" : "text-[#111]"}`}>Пакеты для недвижимости</p>
          <div className="mt-4 grid grid-cols-3 gap-3 items-stretch">
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "realty", size: "small" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "realty" && selectedPackage?.size === "small"
                  ? (isDark ? "bg-white/10 border border-accent/50 shadow-md opacity-100" : "bg-gray-50 border border-[#8B5FFF]/40 shadow-sm opacity-100")
                  : (isDark ? "bg-white/[0.03] border-0 opacity-60 hover:opacity-80 hover:scale-[1.02]" : "bg-gray-50/50 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <p className={`text-[14px] font-medium ${isDark ? "text-muted" : "text-gray-600"}`}>3</p>
              <div className="mt-1">
                <PriceDisplay value={4000} size="sm" />
              </div>
              <p className={`text-[10px] mt-1 ${isDark ? "text-muted/60" : "text-gray-400"}`}>
                <span className="inline-flex items-baseline">
                  <span>1 333</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "realty", size: "base" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "realty" && selectedPackage?.size === "base"
                  ? (isDark ? "bg-accent/10 border-2 border-accent/50 shadow-lg opacity-100 scale-[1.02]" : "bg-[#f3f0ff] border-2 border-[#8B5FFF]/50 shadow-md opacity-100 scale-[1.02]")
                  : (isDark ? "bg-accent/5 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]" : "bg-[#f3f0ff]/60 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${isDark ? "bg-accent/80 text-white" : "bg-[#8B5FFF] text-white"}`}>Оптимальный</span>
              <p className={`text-[16px] font-bold ${isDark ? "text-accent" : "text-[#7c3aed]"}`}>7</p>
              <div className="mt-0.5">
                <PriceDisplay value={8500} size="md" />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-accent/70" : "text-[#7c3aed]/80"}`}>
                <span className="inline-flex items-baseline">
                  <span>1 214</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "realty", size: "pro" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "realty" && selectedPackage?.size === "pro"
                  ? (isDark ? "bg-white/10 border border-accent/40 shadow-md opacity-100" : "bg-white border border-[#8B5FFF]/30 shadow-sm opacity-100")
                  : (isDark ? "bg-white/5 border-0 opacity-60 hover:opacity-80 hover:scale-[1.02]" : "bg-white/80 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${isDark ? "bg-white/20 text-white/90" : "bg-gray-100 text-gray-600"}`}>Максимум выгоды 🔥🔥🔥</span>
              <p className={`text-[15px] font-bold ${isDark ? "text-fg" : "text-[#111]"}`}>15</p>
              <div className="mt-1">
                <PriceDisplay value={16500} size="sm" />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-accent/60" : "text-[#7c3aed]/70"}`}>
                <span className="inline-flex items-baseline">
                  <span>1 100</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
          </div>
        </div>

        {/* Пакеты для авто */}
        <div className="mt-8">
          <p className={`text-[15px] font-semibold ${isDark ? "text-fg" : "text-[#111]"}`}>Пакеты для авто</p>
          <div className="mt-4 grid grid-cols-3 gap-3 items-stretch">
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "auto", size: "small" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "auto" && selectedPackage?.size === "small"
                  ? (isDark ? "bg-white/10 border border-accent/50 shadow-md opacity-100" : "bg-gray-50 border border-[#8B5FFF]/40 shadow-sm opacity-100")
                  : (isDark ? "bg-white/[0.03] border-0 opacity-60 hover:opacity-80 hover:scale-[1.02]" : "bg-gray-50/50 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <p className={`text-[14px] font-medium ${isDark ? "text-muted" : "text-gray-600"}`}>3</p>
              <div className="mt-1">
                <PriceDisplay value={2500} size="sm" />
              </div>
              <p className={`text-[10px] mt-1 ${isDark ? "text-muted/60" : "text-gray-400"}`}>
                <span className="inline-flex items-baseline">
                  <span>833</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "auto", size: "base" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "auto" && selectedPackage?.size === "base"
                  ? (isDark ? "bg-accent/10 border-2 border-accent/50 shadow-lg opacity-100 scale-[1.02]" : "bg-[#f3f0ff] border-2 border-[#8B5FFF]/50 shadow-md opacity-100 scale-[1.02]")
                  : (isDark ? "bg-accent/5 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]" : "bg-[#f3f0ff]/60 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${isDark ? "bg-accent/80 text-white" : "bg-[#8B5FFF] text-white"}`}>Оптимальный</span>
              <p className={`text-[16px] font-bold ${isDark ? "text-accent" : "text-[#7c3aed]"}`}>7</p>
              <div className="mt-0.5">
                <PriceDisplay value={5500} size="md" />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-accent/70" : "text-[#7c3aed]/80"}`}>
                <span className="inline-flex items-baseline">
                  <span>786</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPackage({ type: "auto", size: "pro" });
                setIsCustom(false);
                setCustomQuantity("");
              }}
              className={`relative rounded-xl py-4 px-3 text-center transition-all duration-200 ${
                !isCustom && selectedPackage?.type === "auto" && selectedPackage?.size === "pro"
                  ? (isDark ? "bg-white/10 border border-accent/40 shadow-md opacity-100" : "bg-white border border-[#8B5FFF]/30 shadow-sm opacity-100")
                  : (isDark ? "bg-white/5 border-0 opacity-60 hover:opacity-80 hover:scale-[1.02]" : "bg-white/80 border-0 opacity-70 hover:opacity-90 hover:scale-[1.02]")
              }`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${isDark ? "bg-white/20 text-white/90" : "bg-gray-100 text-gray-600"}`}>Максимум выгоды 🔥🔥🔥</span>
              <p className={`text-[15px] font-bold ${isDark ? "text-fg" : "text-[#111]"}`}>15</p>
              <div className="mt-1">
                <PriceDisplay value={10500} size="sm" />
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-accent/60" : "text-[#7c3aed]/70"}`}>
                <span className="inline-flex items-baseline">
                  <span>700</span>
                  <span className="ml-0.5 opacity-60">₽</span>
                </span>
                <span className="opacity-50">/шт</span>
              </p>
            </button>
          </div>
        </div>

        {/* Свое количество */}
        <div className="mt-8 pt-6 border-t border-dashed border-gray-300/50 dark:border-gray-600/30">
          <p className={`text-[15px] font-semibold mb-4 ${isDark ? "text-fg" : "text-[#111]"}`}>Свое количество</p>
          
          {/* Тип категории */}
          <div className="flex gap-2 mb-3">
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
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
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
              className={`w-full h-[48px] px-4 rounded-xl text-[15px] font-medium outline-none transition-all duration-200 ${
                isDark
                  ? "bg-white/5 border border-white/10 text-fg placeholder:text-muted/50 focus:border-accent/50 focus:bg-white/[0.07]"
                  : "bg-gray-50 border border-gray-200 text-[#111] placeholder:text-gray-400 focus:border-[#8B5FFF]/40 focus:bg-white"
              }`}
            />
            <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-[13px] ${isDark ? "text-muted/60" : "text-gray-400"}`}>шт</span>
          </div>
          
          {/* Расчет цены */}
          {customQuantity && parseInt(customQuantity) > 0 && (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#8B5FFF]/5 to-[#22d3ee]/5 border border-[#8B5FFF]/10">
              <div className="flex items-baseline gap-1">
                <span className={`text-[13px] ${isDark ? "text-muted" : "text-gray-500"}`}>Итого:</span>
                <span className={`text-[20px] font-bold ${isDark ? "text-fg" : "text-[#111]"}`}>
                  {formatPrice(calculateCustomPrice(customType, parseInt(customQuantity)).total)}
                </span>
                <span className={`text-[14px] ml-1 opacity-60 ${isDark ? "text-fg" : "text-[#111]"}`}>₽</span>
              </div>
              <p className={`text-[13px] mt-1 ${isDark ? "text-muted/70" : "text-gray-500"}`}>
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
              router.push(`/payment?type=${customType}&qty=${qty}&amount=${total}`);
            } else if (selectedPackage) {
              const pkg = packageInfo[selectedPackage.type]?.[selectedPackage.size as PackageSize];
              const count = pkg?.count ?? 0;
              const price = pkg?.price ?? 0;
              console.log("BUY PACKAGE", { type: selectedPackage.type, size: selectedPackage.size, count, price });
              router.push(`/payment?type=${selectedPackage.type}&size=${selectedPackage.size}&qty=${count}&amount=${price}`);
            }
          }}
          className={`mt-8 w-full min-h-[56px] rounded-xl text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] ${
            (selectedPackage || (isCustom && customQuantity && parseInt(customQuantity) > 0))
              ? (isDark
                  ? "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-lg shadow-purple-500/25"
                  : "bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-white shadow-md shadow-purple-500/20")
              : (isDark
                  ? "bg-white/10 text-muted hover:bg-white/15 border border-line/30"
                  : "bg-gray-100 text-gray-500 border border-gray-200")
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

      <div className="pt-6">
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
