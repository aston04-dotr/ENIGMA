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

function getErrorStatus(error: unknown): number {
  const status = Number(
    (error as { status?: unknown; code?: unknown } | null)?.status ??
      (error as { status?: unknown; code?: unknown } | null)?.code ??
      0,
  );
  return Number.isFinite(status) ? status : 0;
}

function isRefreshAuthFailure(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== 400 && status !== 401) return false;
  const text = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    text.includes("refresh") ||
    text.includes("jwt") ||
    text.includes("token") ||
    text.includes("session")
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [ready, setReady] = useState(true);
  const [bootstrapKey, setBootstrapKey] = useState(0);
  const profileRequestIdRef = useRef(0);
  const loadingRef = useRef(loading);
  const isSessionFetchInFlightRef = useRef(false);
  const bootstrapRetryInFlightRef = useRef(false);

  const [onboardingResolved] = useState(true);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [needsProfileSetup] = useState(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const hardSignOut = useCallback(async (reason: string) => {
    console.warn("[auth] hard sign-out:", reason);
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileLoading(false);
    setAuthResolved(true);
    setLoading(false);
    setReady(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
        document.cookie = "enigma_signed_out=1; path=/; max-age=30; SameSite=Lax";
      } catch (storageErr) {
        console.warn("[auth] storage clear failed", storageErr);
      }
    }
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // noop
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login?signed_out=1&reason=refresh_failed";
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loading) return;
    const timeout = window.setTimeout(() => {
      if (loadingRef.current) {
        if (isSessionFetchInFlightRef.current) return;
        if (bootstrapRetryInFlightRef.current) return;

        bootstrapRetryInFlightRef.current = true;
        isSessionFetchInFlightRef.current = true;
        void supabase.auth
          .getSession()
          .then(({ data, error }) => {
            if (error && isRefreshAuthFailure(error)) {
              void hardSignOut("bootstrap-timeout getSession 400/401");
              return;
            }
            if (data.session?.user) {
              setSession(data.session);
              setUser(data.session.user);
              setAuthResolved(true);
              setLoading(false);
              setReady(true);
              return;
            }

            const cookie = typeof document !== "undefined" ? document.cookie : "";
            const hasSupabaseCookie =
              cookie.includes("sb-") || cookie.includes("supabase-auth-token");
            if (hasSupabaseCookie) {
              setBootstrapKey((k) => k + 1);
              return;
            }

            console.warn("Session sync timeout; no active session found");
            setAuthResolved(true);
            setLoading(false);
            setReady(true);
          })
          .catch((err) => {
            if (isRefreshAuthFailure(err)) {
              void hardSignOut("bootstrap-timeout getSession catch 400/401");
              return;
            }
            console.warn("Session sync timeout check failed", err);
            setAuthResolved(true);
            setLoading(false);
            setReady(true);
          })
          .finally(() => {
            isSessionFetchInFlightRef.current = false;
            bootstrapRetryInFlightRef.current = false;
          });
      }
    }, 6500);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    console.log("COOKIE SESSION CHECK", document.cookie);
  }, []);

  const ensureProfileExists = useCallback(
    async (userId: string, email?: string | null) => {
      if (!userId) {
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, email: email ?? null }, { onConflict: "id" });
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
    let mounted = true;
    setLoading(true);
    const settledRef = { current: false };
    let initialSessionResolved = false;

    const applySession = (next: Session | null) => {
      setSession(next);
      setUser(next?.user ?? null);
      setAuthResolved(true);
      setLoading(false);
      setReady(true);
    };

    const signedOutGuardMs = 3000;

    const { data: subData } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("[auth] event", event);
      }

      if (event === "INITIAL_SESSION") {
        initialSessionResolved = true;
        settledRef.current = true;
        applySession(nextSession ?? null);
        return;
      }

      if (event === "SIGNED_IN") {
        initialSessionResolved = true;
        void (async () => {
          isSessionFetchInFlightRef.current = true;
          try {
            const { data, error } = await supabase.auth.getSession();
            if (error && isRefreshAuthFailure(error)) {
              void hardSignOut("SIGNED_IN getSession 400/401");
              return;
            }
            if (!mounted) return;
            settledRef.current = true;
            applySession(data.session ?? nextSession ?? null);
          } catch (err) {
            if (isRefreshAuthFailure(err)) {
              void hardSignOut("SIGNED_IN getSession catch 400/401");
              return;
            }
            console.warn("[auth] SIGNED_IN getSession failed", err);
            if (!mounted) return;
            settledRef.current = true;
            applySession(nextSession ?? null);
          } finally {
            isSessionFetchInFlightRef.current = false;
          }
        })();
        return;
      }

      if (event === "SIGNED_OUT") {
        if (!initialSessionResolved) {
          return;
        }
        void (async () => {
          isSessionFetchInFlightRef.current = true;
          try {
            await new Promise((r) => setTimeout(r, signedOutGuardMs));
            const { data, error } = await supabase.auth.getSession();
            if (error && isRefreshAuthFailure(error)) {
              void hardSignOut("SIGNED_OUT guard getSession 400/401");
              return;
            }
            if (!mounted) return;
            if (typeof document !== "undefined") {
              console.log("COOKIE SESSION CHECK", document.cookie);
            }
            if (data.session?.user) {
              applySession(data.session);
              return;
            }
            const hasSupabaseCookie =
              typeof document !== "undefined" &&
              (document.cookie.includes("sb-") ||
                document.cookie.includes("supabase-auth-token"));
            if (hasSupabaseCookie) {
              await new Promise((r) => setTimeout(r, 1200));
              const retry = await supabase.auth.getSession();
              if (retry.error && isRefreshAuthFailure(retry.error)) {
                void hardSignOut("SIGNED_OUT guard getSession retry 400/401");
                return;
              }
              if (!mounted) return;
              if (retry.data.session?.user) {
                applySession(retry.data.session);
                return;
              }
            }
            settledRef.current = true;
            applySession(null);
            setProfile(null);
            setProfileLoading(false);
          } catch (err) {
            if (isRefreshAuthFailure(err)) {
              void hardSignOut("SIGNED_OUT guard getSession catch 400/401");
              return;
            }
            console.warn("[auth] SIGNED_OUT getSession failed", err);
            if (!mounted) return;
            settledRef.current = true;
            applySession(null);
            setProfile(null);
            setProfileLoading(false);
          } finally {
            isSessionFetchInFlightRef.current = false;
          }
        })();
        return;
      }
      settledRef.current = true;
      applySession(nextSession ?? null);
    });

    // Фолбэк: если INITIAL_SESSION задержался, делаем мягкий check один раз.
    const bootstrapTimer = window.setTimeout(() => {
      if (!mounted || settledRef.current) return;
      isSessionFetchInFlightRef.current = true;
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error && isRefreshAuthFailure(error)) {
            void hardSignOut("bootstrap fallback getSession 400/401");
            return;
          }
          if (!mounted || settledRef.current) return;
          applySession(data.session ?? null);
        })
        .catch((err) => {
          if (isRefreshAuthFailure(err)) {
            void hardSignOut("bootstrap fallback getSession catch 400/401");
            return;
          }
          console.warn("[auth] getSession bootstrap fallback", err);
          if (!mounted || settledRef.current) return;
          applySession(null);
        })
        .finally(() => {
          isSessionFetchInFlightRef.current = false;
        });
    }, 900);

    return () => {
      mounted = false;
      window.clearTimeout(bootstrapTimer);
      subData.subscription.unsubscribe();
    };
  }, [bootstrapKey, hardSignOut]);

  const retryBootstrap = useCallback(
    (opts?: { fromUser?: boolean; fromOnline?: boolean }) => {
      void opts;
      setReady(false);
      setLoading(true);
      setAuthResolved(false);
      setBootstrapKey((k) => k + 1);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await hardSignOut("manual signOut");
  }, [hardSignOut]);

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
