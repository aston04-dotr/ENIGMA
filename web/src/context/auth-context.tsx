"use client";

import type { Session } from "@supabase/supabase-js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type UserRow = {
  id: string;
  name?: string | null;
  public_id?: string | null;
  trust_score?: number | null;
  phone?: string | null;
  avatar_url?: string | null;
  device_id?: string | null;
};

type AuthCtx = {
  session: Session | null;
  profile: UserRow | null;
  needsProfileSetup: boolean;
  needsPhone: boolean;
  needsName: boolean;
  loading: boolean;
  authResolved: boolean;
  profileLoading: boolean;
  onboardingResolved: boolean;
  ready: boolean;
  signOut: () => Promise<void>;
  retryBootstrap: (opts?: { fromUser?: boolean; fromOnline?: boolean }) => void;
  refreshProfile: () => Promise<UserRow | null>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [ready, setReady] = useState(true);
  const [bootstrapKey, setBootstrapKey] = useState(0);
  const profileRequestIdRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);

  const [onboardingResolved] = useState(true);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [needsProfileSetup] = useState(false);

  const ensureProfileExists = useCallback(async (userId: string, email?: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log("SKIP UPSERT: no user");
      return;
    }
    console.log("UPSERT USER ID:", user.id);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, email: email ?? null }, { onConflict: "id" });
    if (error) {
      console.warn("profiles upsert", error);
    }
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequestIdRef.current;
    setProfileLoading(true);
    setProfileResolved(false);

    try {
      let { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, phone, trust_score, updated_at, name")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.warn("profiles select", profileError);
      }

      if (!profileData) {
        await ensureProfileExists(userId);
        const retry = await supabase
          .from("profiles")
          .select("id, phone, trust_score, updated_at, name")
          .eq("id", userId)
          .maybeSingle();
        profileData = retry.data;
        profileError = retry.error;

        if (profileError) {
          console.warn("profiles select retry", profileError);
        }
      }

      if (!profileData) {
        if (requestId === profileRequestIdRef.current) {
          setProfile(null);
          setProfileResolved(true);
        }
        return null;
      }

      const mergedProfile: UserRow = {
        id: userId,
        name: profileData?.name ?? null,
        public_id: null,
        avatar_url: null,
        trust_score: profileData?.trust_score ?? null,
        phone: profileData?.phone ?? null,
        device_id: null,
      };

      if (requestId === profileRequestIdRef.current) {
        setProfile(mergedProfile);
        setProfileResolved(true);
      }
      return mergedProfile;
    } catch (e) {
      console.warn("loadProfile unexpected", e);
      if (requestId === profileRequestIdRef.current) {
        setProfile(null);
        setProfileResolved(true);
      }
      return null;
    } finally {
      if (requestId === profileRequestIdRef.current) {
        setProfileLoading(false);
      }
    }
  }, [ensureProfileExists]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth-context] Auth state change:", event);

      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        setProfileResolved(true);
        setProfileLoading(false);
        return;
      }

      // Иногда приходят transient-события без session — не сбрасываем живую сессию.
      if (!s?.user?.id) {
        return;
      }

      setSession(s);

      // Не блокируем внутреннюю очередь Supabase: профиль — фоном после навигации.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const uid = s.user.id;
        const mail = s.user.email ?? null;
        queueMicrotask(() => {
          void (async () => {
            const p0 = performance.now();
            console.log("[auth-context] profileFetch:start", { event, userId: uid.slice(0, 8) + "…" });
            await ensureProfileExists(uid, mail);
            await loadProfile(uid);
            console.log("[auth-context] profileFetch:end", { ms: Math.round(performance.now() - p0) });
          })();
        });
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [bootstrapKey, loadProfile, ensureProfileExists]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const boot0 = typeof performance !== "undefined" ? performance.now() : 0;
      try {
        console.log("[auth-context] getSession:start");
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        console.log("[auth-context] getSession:end", { ms: boot0 ? Math.round(performance.now() - boot0) : 0, hasUser: Boolean(s?.user?.id) });

        if (s?.user?.id) {
          setSession(s);
          // Сразу считаем auth готовым; профиль догружается в фоне (не блокируем UI).
          void (async () => {
            const p0 = performance.now();
            console.log("[auth-context] bootstrap profileFetch:start", { userId: s.user.id.slice(0, 8) + "…" });
            await ensureProfileExists(s.user.id, s.user.email ?? null);
            await loadProfile(s.user.id);
            console.log("[auth-context] bootstrap profileFetch:end", { ms: Math.round(performance.now() - p0) });
          })();
        } else if (!sessionRef.current?.user?.id) {
          // Чистим профиль только если и раньше сессии не было.
          setSession(null);
          setProfile(null);
          setProfileResolved(true);
          setProfileLoading(false);
        }
      } catch (err) {
        console.error("[auth-context] Session load error:", err);
      } finally {
        if (mounted) {
          setAuthResolved(true);
          setLoading(false);
          setReady(true);
          console.log("[auth-context] auth ready (profile may still load)", {
            ms: boot0 ? Math.round(performance.now() - boot0) : 0,
          });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [bootstrapKey, ensureProfileExists, loadProfile]);

  const retryBootstrap = useCallback((opts?: { fromUser?: boolean; fromOnline?: boolean }) => {
    void opts;
    setReady(false);
    setLoading(true);
    setAuthResolved(false);
    setBootstrapKey((k) => k + 1);
  }, []);

  const signOut = useCallback(async () => {
    // Оптимистично чистим UI-сессию сразу, чтобы не было «мигания» профиля.
    setSession(null);
    setProfile(null);
    setProfileResolved(true);
    setProfileLoading(false);
    setAuthResolved(true);
    setLoading(false);
    setReady(true);

    try {
      // Сначала global: чтобы все вкладки/устройства этой сессии вышли.
      await supabase.auth.signOut({ scope: "global" });
    } catch (e) {
      console.warn("[auth-context] signOut global failed, fallback to local", e);
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (localErr) {
        console.warn("[auth-context] signOut local failed", localErr);
      }
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const keys = Object.keys(window.localStorage);
        for (const key of keys) {
          if (key.startsWith("sb-")) {
            window.localStorage.removeItem(key);
          }
        }
      }
    } catch (e) {
      console.warn("[auth-context] localStorage clear failed", e);
    }

    if (typeof window !== "undefined") {
      window.location.replace("/login?signed_out=1");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      return loadProfile(session.user.id);
    }
    return null;
  }, [session?.user?.id, loadProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      authResolved,
      profileLoading,
      onboardingResolved,
      ready,
      signOut,
      retryBootstrap,
      refreshProfile,
    }),
    [
      session,
      profile,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      authResolved,
      profileLoading,
      onboardingResolved,
      ready,
      signOut,
      retryBootstrap,
      refreshProfile,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
