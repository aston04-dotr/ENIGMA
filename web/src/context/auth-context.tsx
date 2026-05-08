"use client";

import type { Session, User } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getSessionGuarded,
  supabase,
} from "@/lib/supabase";
import { isLocalMobileBundleRuntime } from "@/lib/mobileRuntime";
import { getOrCreateGuestIdentity } from "@/lib/guestIdentity";
import { mergeGuestStateAfterSignIn } from "@/lib/guestUpgrade";

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
  retryBootstrap: (opts?: { fromUser?: boolean; fromOnline?: boolean }) => void;
  refreshProfile: () => Promise<UserRow | null>;
};

const Ctx = createContext<AuthCtx | null>(null);
const SIGNED_OUT_STABILIZE_MS = 280;
const AUTH_STEP_TIMEOUT_MS = 10_000;
const AUTH_WATCHDOG_MS = 15_000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label}:timeout:${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [ready, setReady] = useState(true);
  const profileRequestIdRef = useRef(0);
  const hydrateInFlightRef = useRef<Promise<Session | null> | null>(null);
  const signedOutTimerRef = useRef<number | null>(null);
  const mergedGuestForUserRef = useRef<string | null>(null);
  const hadSessionRef = useRef(false);
  const authListenerAttachedRef = useRef(false);
  const recoverListenersAttachedRef = useRef(false);
  const loadingRef = useRef(loading);
  const authResolvedRef = useRef(authResolved);
  const sessionUserRef = useRef<User | null>(user);
  const retryBootstrapRef = useRef<((opts?: { fromUser?: boolean; fromOnline?: boolean }) => void) | null>(null);
  const mobileRuntimeRef = useRef(false);

  const [onboardingResolved] = useState(true);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [needsProfileSetup] = useState(false);

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setUser(next?.user ?? null);
    if (!next?.user) {
      setProfile(null);
      setProfileLoading(false);
      mergedGuestForUserRef.current = null;
    }
    setAuthResolved(true);
    setLoading(false);
    setReady(true);
  }, []);

  const hydrateSession = useCallback(
    async (reason: string, allowRefresh = true): Promise<Session | null> => {
      if (hydrateInFlightRef.current) {
        return hydrateInFlightRef.current;
      }
      const startedAt = Date.now();
      const run = (async () => {
        const { session: guardedSession } = await withTimeout(
          getSessionGuarded(`auth-hydrate:${reason}`, { allowRefresh }),
          AUTH_STEP_TIMEOUT_MS,
          `auth-hydrate:${reason}`,
        ).catch((error) => {
          console.warn("[auth] hydrate timeout/error", { reason, error });
          return { session: null };
        });
        let settledSession = guardedSession ?? null;
        if (!settledSession && reason === "mount") {
          // Capacitor can recreate activity during OTP finalize; give storage one more tick.
          await new Promise((resolve) => setTimeout(resolve, 350));
          const retry = await withTimeout(
            getSessionGuarded("auth-hydrate:mount-retry", { allowRefresh }),
            AUTH_STEP_TIMEOUT_MS,
            "auth-hydrate:mount-retry",
          ).catch((error) => {
            console.warn("[auth] hydrate mount-retry timeout/error", { error });
            return { session: null };
          });
          settledSession = retry.session ?? null;
        }
        applySession(settledSession);
        if (mobileRuntimeRef.current) {
          console.log("[mobile-session] hydrate_done", {
            reason,
            hasSession: Boolean(settledSession?.user),
          });
        }
        console.debug("[auth] hydrate done", {
          reason,
          elapsedMs: Date.now() - startedAt,
          hasSession: Boolean(settledSession?.user),
        });
        return settledSession;
      })().finally(() => {
        hydrateInFlightRef.current = null;
      });
      hydrateInFlightRef.current = run;
      return run;
    },
    [applySession],
  );

  const ensureProfileExists = useCallback(
    async (userId: string, email?: string | null) => {
      if (!userId) {
        return;
      }
      const guestIdentity = getOrCreateGuestIdentity();
      const { error } = await withTimeout(
        supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              email: email ?? null,
              device_id: guestIdentity.fingerprint,
            },
            { onConflict: "id" },
          ),
        AUTH_STEP_TIMEOUT_MS,
        "ensureProfileExists:upsert",
      );
      if (error) {
        console.warn("profiles upsert", error);
      }
    },
    [],
  );

  const loadProfile = useCallback(
    async (userId: string) => {
      const requestId = ++profileRequestIdRef.current;
      setProfileLoading(true);

      try {
        let { data: profileData, error: profileError } = await withTimeout(
          supabase
            .from("profiles")
            .select("id, phone, trust_score, updated_at, name")
            .eq("id", userId)
            .maybeSingle(),
          AUTH_STEP_TIMEOUT_MS,
          "loadProfile:select",
        );

        if (profileError) {
          console.warn("profiles select", profileError);
        }

        if (!profileData) {
          await ensureProfileExists(userId);
          const retry = await withTimeout(
            supabase
              .from("profiles")
              .select("id, phone, trust_score, updated_at, name")
              .eq("id", userId)
              .maybeSingle(),
            AUTH_STEP_TIMEOUT_MS,
            "loadProfile:retry",
          );
          profileData = retry.data;
          profileError = retry.error;

          if (profileError) {
            console.warn("profiles select retry", profileError);
          }
        }

        if (!profileData) {
          if (requestId === profileRequestIdRef.current) {
            setProfile(null);
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
        }
        return mergedProfile;
      } catch (e) {
        console.warn("loadProfile unexpected", e);
        if (requestId === profileRequestIdRef.current) {
          setProfile(null);
        }
        return null;
      } finally {
        if (requestId === profileRequestIdRef.current) {
          setProfileLoading(false);
        }
      }
    },
    [ensureProfileExists],
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      mobileRuntimeRef.current = isLocalMobileBundleRuntime();
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      hadSessionRef.current = true;
    }
  }, [session?.user]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    authResolvedRef.current = authResolved;
  }, [authResolved]);

  useEffect(() => {
    sessionUserRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!authResolved || loading) {
      return;
    }
    const uid = user?.id ?? null;
    if (!uid) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    const email = user?.email ?? null;
    void (async () => {
      await ensureProfileExists(uid, email);
      await loadProfile(uid);
    })();
  }, [authResolved, loading, user?.id, user?.email, ensureProfileExists, loadProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loading && authResolved) return;
    const timer = window.setTimeout(() => {
      if (!loading && authResolved) return;
      console.error("[auth] watchdog forced release", {
        loading,
        authResolved,
        hasSession: Boolean(session?.user),
      });
      setLoading(false);
      setAuthResolved(true);
      setReady(true);
    }, AUTH_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [authResolved, loading, session?.user]);

  useEffect(() => {
    if (authListenerAttachedRef.current) {
      console.debug("[auth] listener already attached; skip duplicate attach");
      return;
    }
    authListenerAttachedRef.current = true;
    console.debug("[auth] listener attach");
    let mounted = true;
    setLoading(true);
    setAuthResolved(false);
    setReady(false);

    void hydrateSession("mount", true);

    const { data: subData } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      if (mobileRuntimeRef.current) {
        console.log("[mobile-session] auth_event", {
          event,
          hasSession: Boolean(nextSession?.user),
        });
      }
      if (signedOutTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(signedOutTimerRef.current);
        signedOutTimerRef.current = null;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        applySession(nextSession ?? null);
        const mergedUserId = nextSession?.user?.id ?? null;
        if (
          event === "SIGNED_IN" &&
          mergedUserId &&
          mergedGuestForUserRef.current !== mergedUserId
        ) {
          mergedGuestForUserRef.current = mergedUserId;
          void mergeGuestStateAfterSignIn(mergedUserId);
        }
        return;
      }

      if (event === "TOKEN_REFRESH_REJECTED") {
        await hydrateSession("token-refresh-rejected", false);
        return;
      }

      if (event === "SIGNED_OUT" && typeof window !== "undefined") {
        signedOutTimerRef.current = window.setTimeout(() => {
          signedOutTimerRef.current = null;
          void hydrateSession("signed-out-stabilize", true);
        }, SIGNED_OUT_STABILIZE_MS);
      }
    });

    return () => {
      mounted = false;
      if (signedOutTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(signedOutTimerRef.current);
        signedOutTimerRef.current = null;
      }
      subData.subscription.unsubscribe();
      authListenerAttachedRef.current = false;
      console.debug("[auth] listener detach");
    };
  }, [applySession, hydrateSession]);

  const retryBootstrap = useCallback(
    async (opts?: { fromUser?: boolean; fromOnline?: boolean }) => {
      void opts;
      await hydrateSession("manual-retry", true);
    },
    [hydrateSession],
  );

  useEffect(() => {
    retryBootstrapRef.current = retryBootstrap;
  }, [retryBootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (recoverListenersAttachedRef.current) {
      console.debug("[auth] recover listeners already attached; skip duplicate");
      return;
    }
    recoverListenersAttachedRef.current = true;
    console.debug("[auth] recover listeners attach");
    const onRecover = () => {
      const p = String(window.location.pathname || "");
      if (
        p === "/login" ||
        p.startsWith("/auth/verify") ||
        p.startsWith("/auth/confirm") ||
        p.startsWith("/auth/callback")
      ) {
        return;
      }
      if (loadingRef.current) return;
      if (!authResolvedRef.current) return;
      if (sessionUserRef.current) return;
      if (!hadSessionRef.current) return;
      void retryBootstrapRef.current?.({ fromOnline: true });
    };
    window.addEventListener("online", onRecover);
    window.addEventListener("pageshow", onRecover);
    window.addEventListener("focus", onRecover);
    return () => {
      window.removeEventListener("online", onRecover);
      window.removeEventListener("pageshow", onRecover);
      window.removeEventListener("focus", onRecover);
      recoverListenersAttachedRef.current = false;
      console.debug("[auth] recover listeners detach");
    };
  }, []);

  const signOut = useCallback(async () => {
    applySession(null);
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (error) {
      console.warn("[auth] signOut failed", error);
    }
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      return loadProfile(user.id);
    }
    return null;
  }, [user?.id, loadProfile]);

  const value = useMemo(
    () => ({
      user,
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
      user,
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
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
