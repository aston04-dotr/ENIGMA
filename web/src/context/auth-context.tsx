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
  disableAuthRefresh,
  getSessionGuarded,
  hardResetSupabaseAuthState,
  supabase,
} from "@/lib/supabase";
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
let authListenerRegistrations = 0;

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
  return status === 400 || status === 401;
}

function isStaleRefreshTokenError(error: unknown): boolean {
  const msg = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return msg.includes("already used") || msg.includes("invalid refresh token");
}

function tokenSuffix(value: string | null | undefined): string {
  const token = String(value ?? "").trim();
  if (!token) return "";
  return token.slice(-8);
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
  const authEventDebounceRef = useRef<{ event: string; at: number }>({ event: "", at: 0 });
  const refreshRejectedRef = useRef(false);
  const hardSignOutInFlightRef = useRef(false);
  const lastSessionSignatureRef = useRef<string>("");

  const [onboardingResolved] = useState(true);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [needsProfileSetup] = useState(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const hardSignOut = useCallback(
    async (opts: { reason: string; redirectTo?: string; markRefreshRejected?: boolean }) => {
      if (hardSignOutInFlightRef.current) return;
      hardSignOutInFlightRef.current = true;
      if (opts.markRefreshRejected) {
        refreshRejectedRef.current = true;
        disableAuthRefresh(opts.reason);
      }
      console.warn("[auth] hard sign-out:", opts.reason);
      setSession(null);
      setUser(null);
      setProfile(null);
      setProfileLoading(false);
      setAuthResolved(true);
      setLoading(false);
      setReady(true);
      await hardResetSupabaseAuthState(opts.reason);
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        // noop
      }
      if (typeof window !== "undefined") {
        try {
          document.cookie = "enigma_signed_out=1; path=/; max-age=30; SameSite=Lax";
        } catch {
          // noop
        }
        window.location.href = opts.redirectTo ?? "/login?signed_out=1";
      }
    },
    [],
  );

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
          .then(async ({ data, error }) => {
            if (error && isRefreshAuthFailure(error)) {
              void hardSignOut({
                reason: isStaleRefreshTokenError(error)
                  ? "bootstrap-timeout stale refresh token"
                  : "bootstrap-timeout getSession 400/401",
                redirectTo: "/login?reason=stale_refresh_token",
                markRefreshRejected: true,
              });
              return;
            }
            let effectiveSession = data.session ?? null;
            if (!effectiveSession) {
              const guarded = await getSessionGuarded("auth-bootstrap-timeout", {
                allowRefresh: true,
              });
              if (guarded.error && isRefreshAuthFailure(guarded.error)) {
                void hardSignOut({
                  reason: isStaleRefreshTokenError(guarded.error)
                    ? "bootstrap-timeout guarded stale refresh token"
                    : "bootstrap-timeout guarded getSession 400/401",
                  redirectTo: "/login?reason=stale_refresh_token",
                  markRefreshRejected: true,
                });
                return;
              }
              effectiveSession = guarded.session;
            }
            if (effectiveSession?.user) {
              setSession(effectiveSession);
              setUser(effectiveSession.user);
              setAuthResolved(true);
              setLoading(false);
              setReady(true);
              return;
            }

            const cookie = typeof document !== "undefined" ? document.cookie : "";
            const hasSupabaseCookie =
              cookie.includes("sb-") || cookie.includes("supabase-auth-token");
            if (hasSupabaseCookie) {
              if (refreshRejectedRef.current) {
                return;
              }
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
              void hardSignOut({
                reason: "bootstrap-timeout getSession catch 400/401",
                redirectTo: "/login?reason=stale_refresh_token",
                markRefreshRejected: true,
              });
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
      const guestIdentity = getOrCreateGuestIdentity();
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            email: email ?? null,
            device_id: guestIdentity.fingerprint,
          },
          { onConflict: "id" },
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
      const signature = next
        ? `${next.user?.id ?? "no-user"}:${tokenSuffix(next.refresh_token)}:${tokenSuffix(next.access_token)}`
        : "null";
      if (signature !== lastSessionSignatureRef.current) {
        console.log("[auth] session replacement", {
          prev: lastSessionSignatureRef.current || "none",
          next: signature,
        });
        lastSessionSignatureRef.current = signature;
      }
      setSession(next);
      setUser(next?.user ?? null);
      setAuthResolved(true);
      setLoading(false);
      setReady(true);
    };

    const signedOutGuardMs = 3000;

    const { data: subData } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (refreshRejectedRef.current && event !== "SIGNED_OUT") return;
      const now = Date.now();
      if (
        authEventDebounceRef.current.event === event &&
        now - authEventDebounceRef.current.at < 350
      ) {
        return;
      }
      authEventDebounceRef.current = { event, at: now };
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("[auth] event", event, {
          uid: nextSession?.user?.id ?? null,
          refreshSuffix: tokenSuffix(nextSession?.refresh_token),
          accessSuffix: tokenSuffix(nextSession?.access_token),
        });
      }

      if (event === "TOKEN_REFRESH_REJECTED") {
        void hardSignOut({
          reason: "TOKEN_REFRESH_REJECTED event",
          redirectTo: "/login?reason=stale_refresh_token",
          markRefreshRejected: true,
        });
        return;
      }

      if (event === "INITIAL_SESSION") {
        initialSessionResolved = true;
        settledRef.current = true;
        applySession(nextSession ?? null);
        return;
      }

      if (event === "SIGNED_IN") {
        if (isSessionFetchInFlightRef.current) return;
        initialSessionResolved = true;
        void (async () => {
          isSessionFetchInFlightRef.current = true;
          try {
            const guarded = await getSessionGuarded("auth-signed-in", {
              allowRefresh: true,
            });
            if (guarded.error && isRefreshAuthFailure(guarded.error)) {
              void hardSignOut({
                reason: "SIGNED_IN getSession 400/401",
                redirectTo: "/login?reason=stale_refresh_token",
                markRefreshRejected: true,
              });
              return;
            }
            if (!mounted) return;
            settledRef.current = true;
            applySession(guarded.session ?? nextSession ?? null);
            if (guarded.session?.user?.id) {
              void mergeGuestStateAfterSignIn(guarded.session.user.id);
            }
          } catch (err) {
            if (isRefreshAuthFailure(err)) {
              void hardSignOut({
                reason: "SIGNED_IN getSession catch 400/401",
                redirectTo: "/login?reason=stale_refresh_token",
                markRefreshRejected: true,
              });
              return;
            }
            console.warn("[auth] SIGNED_IN getSession failed", err);
            if (!mounted) return;
            settledRef.current = true;
            applySession(nextSession ?? null);
            if (nextSession?.user?.id) {
              void mergeGuestStateAfterSignIn(nextSession.user.id);
            }
          } finally {
            isSessionFetchInFlightRef.current = false;
          }
        })();
        return;
      }

      if (event === "SIGNED_OUT") {
        if (isSessionFetchInFlightRef.current) return;
        if (!initialSessionResolved) {
          return;
        }
        void (async () => {
          isSessionFetchInFlightRef.current = true;
          try {
            await new Promise((r) => setTimeout(r, signedOutGuardMs));
            const guarded = await getSessionGuarded("auth-signed-out", {
              allowRefresh: true,
            });
            if (guarded.error && isRefreshAuthFailure(guarded.error)) {
              void hardSignOut({
                reason: "SIGNED_OUT guard getSession 400/401",
                redirectTo: "/login?reason=stale_refresh_token",
                markRefreshRejected: true,
              });
              return;
            }
            if (!mounted) return;
            if (typeof document !== "undefined") {
              console.log("COOKIE SESSION CHECK", document.cookie);
            }
            if (guarded.session?.user) {
              applySession(guarded.session);
              return;
            }
            const hasSupabaseCookie =
              typeof document !== "undefined" &&
              (document.cookie.includes("sb-") ||
                document.cookie.includes("supabase-auth-token"));
            if (hasSupabaseCookie) {
              await new Promise((r) => setTimeout(r, 1200));
              const retry = await getSessionGuarded("auth-signed-out-retry", {
                allowRefresh: true,
              });
              if (retry.error && isRefreshAuthFailure(retry.error)) {
                void hardSignOut({
                  reason: "SIGNED_OUT guard getSession retry 400/401",
                  redirectTo: "/login?reason=stale_refresh_token",
                  markRefreshRejected: true,
                });
                return;
              }
              if (!mounted) return;
              if (retry.session?.user) {
                applySession(retry.session);
                return;
              }
            }
            settledRef.current = true;
            applySession(null);
            setProfile(null);
            setProfileLoading(false);
          } catch (err) {
            if (isRefreshAuthFailure(err)) {
              void hardSignOut({
                reason: "SIGNED_OUT guard getSession catch 400/401",
                redirectTo: "/login?reason=stale_refresh_token",
                markRefreshRejected: true,
              });
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
    authListenerRegistrations += 1;
    console.log("[auth] listener registered", {
      count: authListenerRegistrations,
      bootstrapKey,
    });

    // Фолбэк: если INITIAL_SESSION задержался, делаем мягкий check один раз.
    const bootstrapTimer = window.setTimeout(() => {
      if (!mounted || settledRef.current) return;
      isSessionFetchInFlightRef.current = true;
      void getSessionGuarded("auth-bootstrap-fallback", {
        allowRefresh: true,
      })
        .then(({ session, error }) => {
          if (error && isRefreshAuthFailure(error)) {
            void hardSignOut({
              reason: "bootstrap fallback getSession 400/401",
              redirectTo: "/login?reason=stale_refresh_token",
              markRefreshRejected: true,
            });
            return;
          }
          if (!mounted || settledRef.current) return;
          applySession(session ?? null);
        })
        .catch((err) => {
          if (isRefreshAuthFailure(err)) {
            void hardSignOut({
              reason: "bootstrap fallback getSession catch 400/401",
              redirectTo: "/login?reason=stale_refresh_token",
              markRefreshRejected: true,
            });
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
      authListenerRegistrations = Math.max(0, authListenerRegistrations - 1);
      console.log("[auth] listener unregistered", {
        count: authListenerRegistrations,
        bootstrapKey,
      });
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
    refreshRejectedRef.current = false;
    await hardSignOut({ reason: "manual signOut", redirectTo: "/login?signed_out=1" });
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
