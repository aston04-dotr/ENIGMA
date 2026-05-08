"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  closeAuthCircuit,
  isAuthCircuitOpen,
  resetAuthFaultWindow,
  setHardAuthResetInFlight,
} from "@/lib/authCircuitState";
import { hardSignOutAndRedirectToLogin } from "@/lib/authHardRecovery";
import { subscribeEnigmaAuthSingleton } from "@/lib/supabaseAuthSingleton";
import { setRestAccessToken, supabase } from "@/lib/supabase";

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
  user: User | null;
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
  refreshProfile: () => Promise<UserRow | null>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep API shape stable for existing feature consumers.
  const [profile] = useState<UserRow | null>(null);
  const [profileLoading] = useState(false);
  const [needsProfileSetup] = useState(false);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [onboardingResolved] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || isAuthCircuitOpen()) return;
        if (error) {
          void hardSignOutAndRedirectToLogin(`auth-bootstrap:get-session:${error.message}`);
          return;
        }
        const next = data.session ?? null;
        setSession(next);
        setUser(next?.user ?? null);
        setRestAccessToken(next);
        if (next) {
          closeAuthCircuit();
          setHardAuthResetInFlight(false);
          resetAuthFaultWindow();
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = subscribeEnigmaAuthSingleton(
      (event: AuthChangeEvent, nextSession) => {
        if (!active) return;
        if (isAuthCircuitOpen() && event !== "SIGNED_OUT") {
          return;
        }
        const next = nextSession ?? null;
        setRestAccessToken(next);
        if (event === "TOKEN_REFRESHED") {
          /** Do not setSession: avoids render churn; JWT still in REST cache + ChatUnread singleton ref. */
          setLoading(false);
          return;
        }
        setSession(next);
        setUser(next?.user ?? null);
        setLoading(false);
        if (
          event === "SIGNED_IN" ||
          (event === "INITIAL_SESSION" && next?.user?.id)
        ) {
          closeAuthCircuit();
          setHardAuthResetInFlight(false);
          resetAuthFaultWindow();
        }
        if (event === "SIGNED_OUT") {
          setHardAuthResetInFlight(false);
          closeAuthCircuit();
          resetAuthFaultWindow();
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    setUser(null);
    setRestAccessToken(null);
    closeAuthCircuit();
    setHardAuthResetInFlight(false);
    resetAuthFaultWindow();
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // noop
    }
  }, []);

  const refreshProfile = useCallback(async () => null, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      session,
      profile,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      authResolved: !loading,
      profileLoading,
      onboardingResolved,
      ready: !loading,
      signOut,
      refreshProfile,
    }),
    [
      user,
      session,
      profile,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      profileLoading,
      onboardingResolved,
      signOut,
      refreshProfile,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
