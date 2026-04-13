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
  ready: boolean;
  signOut: () => Promise<void>;
  retryBootstrap: (opts?: { fromUser?: boolean; fromOnline?: boolean }) => void;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [ready, setReady] = useState(true); // UI renders immediately
  const [bootstrapKey, setBootstrapKey] = useState(0);
  const startTimeRef = useRef<number>(0);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, public_id, trust_score, phone, avatar_url, device_id')
        .eq('id', userId)
        .single();
      setProfile(profileData as UserRow | null);
      return profileData as UserRow | null;
    } catch {
      setProfile(null);
      return null;
    }
  }, []);

  const getSessionOnce = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    
    // Load profile if user exists
    if (data.session?.user?.id) {
      await loadProfile(data.session.user.id);
    } else {
      setProfile(null);
    }
    
    return data.session;
  }, [loadProfile])

  const retryBootstrap = useCallback((opts?: { fromUser?: boolean; fromOnline?: boolean }) => {
    void opts;
    setReady(false);
    setLoading(true);
    setAuthResolved(false);
    setBootstrapKey((k) => k + 1);
  }, []);

  // ФОНОВАЯ ЗАГРУЗКА: не блокирует UI
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await getSessionOnce();
        if (mounted) {
          setAuthResolved(true);
          setLoading(false);
        }
      } catch (err) {
        console.error("[auth-context] Session load error:", err);
        if (mounted) {
          setAuthResolved(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [bootstrapKey, getSessionOnce]);

  // Handle auth state changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth-context] Auth state change:", event);
      setSession(s);
      
      // After sign in, load profile
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && s?.user?.id) {
        console.log("[auth-context] Session event - loading profile for:", s.user.id);
        void loadProfile(s.user.id);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }, [session?.user?.id, loadProfile]);

  const needsPhone = Boolean(session?.user && authResolved && !loading && !profile?.phone?.trim());
  const needsName = Boolean(session?.user && authResolved && !loading && !profile?.name?.trim());
  const needsProfileSetup = Boolean(session?.user && authResolved && !loading && !profile?.name?.trim());

  const value = useMemo(
    () => ({
      session,
      profile,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      authResolved,
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
      ready,
      signOut,
      retryBootstrap,
      refreshProfile,
    ]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
