"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { useAuth } from "@/context/auth-context";
import { checkAccessBlocked } from "@/lib/bans";
import { 
  formatRussianPhoneInput, 
  normalizeRussianPhone, 
  isValidRussianPhone,
  formatPhoneForDisplay 
} from "@/lib/phoneUtils";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

const inputClass =
  "w-full min-h-[56px] rounded-card border border-line bg-elevated px-4 text-[18px] text-fg placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/35 transition-all duration-200 font-medium tracking-wide";

export default function PhonePage() {
  const { session, profile, authResolved, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  // Load existing phone with formatting
  useEffect(() => {
    if (profile?.phone) {
      setRaw(formatPhoneForDisplay(profile.phone));
    }
  }, [profile?.phone]);

  useEffect(() => {
    if (!authResolved || loading) return;
    if (!session) router.replace("/login");
  }, [authResolved, loading, session, router]);

  async function save() {
    if (!session?.user) return;
    setErr("");
    setSuccess(false);
    
    const normalized = normalizeRussianPhone(raw);
    if (!normalized || !isValidRussianPhone(raw)) {
      setErr("Введите корректный российский номер");
      return;
    }
    
    if (await checkAccessBlocked(session.user.email, normalized, profile?.device_id ?? null)) {
      setErr("Аккаунт заблокирован");
      return;
    }
    
    setSaving(true);
    
    // Save to profiles only
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: session.user.id,
          email: session.user.email ?? null,
          phone: normalized,
          phone_updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    
    if (error && error.code === "23505") {
      setErr("Номер уже используется другим пользователем");
      setSaving(false);
      return;
    }
    
    if (error) {
      setErr("Не удалось сохранить номер. Попробуйте позже.");
      setSaving(false);
      return;
    }
    
    // Refresh profile in context
    await refreshProfile();
    
    // Navigate immediately
    router.replace("/profile");
  }

  // Handle input change with smart formatting
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const formatted = formatRussianPhoneInput(value);
    setRaw(formatted);
  }

  if (!session) {
    return <AuthLoadingScreen />;
  }

  return (
    <main className="safe-pt space-y-5 bg-main px-6 pb-12 pt-10">
      <h1 className="text-[26px] font-bold tracking-tight text-fg">Телефон</h1>
      <p className="text-sm leading-relaxed text-muted">
        Нужен для связи по объявлениям. Добавьте номер, чтобы покупатели могли звонить вам.
      </p>
      
      <div className="space-y-2">
        <input
          value={raw}
          onChange={handleInputChange}
          className={inputClass}
          placeholder="+7 (999) 123-45-67"
          inputMode="tel"
          disabled={saving}
          maxLength={18}
        />
        <p className="text-xs text-muted">Введите 11 цифр российского номера</p>
      </div>
      
      {err ? (
        <div className="rounded-xl bg-danger/10 px-4 py-3">
          <p className="text-sm font-medium text-danger">{err}</p>
        </div>
      ) : null}
      
      {success ? (
        <div className="rounded-xl bg-[#22c55e]/10 px-4 py-3">
          <p className="text-sm font-medium text-[#22c55e]">✓ Номер сохранён</p>
        </div>
      ) : null}
      
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="w-full min-h-[56px] rounded-card bg-accent py-4 text-[16px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-accent/20"
      >
        {saving ? "Сохранение…" : "Сохранить номер"}
      </button>
      
      <button
        type="button"
        onClick={() => router.push("/profile")}
        className="w-full min-h-[48px] rounded-card border border-line py-3 text-[14px] font-medium text-muted transition-all duration-200 hover:bg-elevated"
      >
        Отмена
      </button>
    </main>
  );
}
