"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const inputClass =
  "w-full min-h-[52px] rounded-card border border-line bg-elevated px-4 text-fg placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/35";

export default function ProfileSetupPage() {
  const { session, profile, refreshProfile, needsProfileSetup, loading, authResolved } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);

  useEffect(() => {
    if (!authResolved || loading) return;
    if (!session) router.replace("/login");
  }, [authResolved, loading, session, router]);

  useEffect(() => {
    if (!authResolved || loading) return;
    if (session && !needsProfileSetup) router.replace("/");
  }, [authResolved, loading, session, needsProfileSetup, router]);

  async function save() {
    const n = name.trim();
    if (n.length < 2) return;
    if (!session?.user) return;
    setErr("");
    setSaving(true);
    const { error } = await supabase.from("users").upsert(
      { id: session.user.id, email: session.user.email ?? null, name: n },
      { onConflict: "id" }
    );
    if (error) {
      console.error("PROFILE SETUP ERROR", error);
      setErr(error.message);
      setSaving(false);
      return;
    }
    await refreshProfile();
    router.replace("/");
    setSaving(false);
  }

  if (!session) {
    return <AuthLoadingScreen />;
  }

  return (
    <main className="safe-pt space-y-5 bg-main px-6 pb-12 pt-10">
      <h1 className="text-[26px] font-bold tracking-tight text-fg">Как вас зовут?</h1>
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Имя" />
      {err ? <p className="text-sm font-medium text-danger">{err}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="pressable w-full min-h-[52px] rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? "…" : "Продолжить"}
      </button>
    </main>
  );
}
