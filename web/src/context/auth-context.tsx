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
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, email: email ?? null }, { onConflict: "id" });
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
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
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

      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        await ensureProfileExists(s.user.id, s.user.email ?? null);
        await loadProfile(s.user.id);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [bootstrapKey, loadProfile, ensureProfileExists]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        if (!mounted) return;

        if (s?.user?.id) {
          setSession(s);
          await ensureProfileExists(s.user.id, s.user.email ?? null);
          await loadProfile(s.user.id);
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
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [bootstrapKey]);

  const retryBootstrap = useCallback((opts?: { fromUser?: boolean; fromOnline?: boolean }) => {
    void opts;
    setReady(false);
    setLoading(true);
    setAuthResolved(false);
    setBootstrapKey((k) => k + 1);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
