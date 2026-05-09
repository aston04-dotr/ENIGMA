"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
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
  closeAuthCircuit,
  isAuthCircuitOpen,
  resetAuthFaultWindow,
  setHardAuthResetInFlight,
} from "@/lib/authCircuitState";
import {
  preferMobileSoftAuthPath,
  recoverSessionAfterTransientFault,
  clearClientAuthAfterInvalidRefresh,
  isInvalidLocalRefreshTokenError,
  peekAuthApiErrorParts,
} from "@/lib/authHardRecovery";
import { loadProfileSnapshot } from "@/lib/postLoginSync";
import {
  bootstrapProfileFromCache,
  mergeServerProfileWithCache,
  persistProfileCacheOverlay,
  profileCacheHasPersistedIdentity,
  profileRowHasPersistedIdentity,
} from "@/lib/profileLocalCache";
import { subscribeEnigmaAuthSingleton } from "@/lib/supabaseAuthSingleton";
import type { UserRow } from "@/lib/types";
import { setRestAccessToken, supabase } from "@/lib/supabase";
import { bumpEnigmaCounter } from "@/lib/enigmaDebugCounters";
import { diagWarn, enigmaDiagEnabled } from "@/lib/enigmaDiag";
import { markUserReadyForPwaInstall, clearUserReadyForPwaInstall } from "@/lib/pwaInstallEligibility";

const PROFILE_SYNC_TIMEOUT_MS = 24_000;

async function loadProfileRowWithTimeout(user: User): Promise<UserRow | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, rej) => {
    timeoutHandle = setTimeout(
      () => rej(new Error("profile_sync_timeout")),
      PROFILE_SYNC_TIMEOUT_MS,
    );
  });
  try {
    const { profile } = await Promise.race([
      loadProfileSnapshot(user),
      timeoutPromise,
    ]);
    return profile;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auth] profile fetch timeout or error", e);
    }
    return null;
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: UserRow | null;
  needsProfileSetup: boolean;
  needsPhone: boolean;
  needsName: boolean;
  loading: boolean;
  authResolved: boolean;
  /** Мягкое восстановление сессии (singleton / wake) — не считать UX «вышел». */
  authSessionRecovering: boolean;
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
  const [sessionRecovering, setSessionRecovering] = useState(false);
  const [profile, setProfileState] = useState<UserRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const profileRef = useRef<UserRow | null>(null);
  const profileReqSeq = useRef(0);
  const lastTokenRefreshDiagAtRef = useRef(0);
  const lastAuthRefreshOkLogRef = useRef(0);
  const lastProfileRefreshDiagAtRef = useRef(0);
  const lastWakeProfileSyncAtRef = useRef(0);

  const assignProfileRow = useCallback((row: UserRow | null) => {
    profileRef.current = row;
    setProfileState(row);
  }, []);

  const [needsProfileSetup] = useState(false);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [onboardingResolved] = useState(true);

  const loadProfileForUser = useCallback(
    async (nextUser: User | null) => {
      if (!nextUser) {
        profileReqSeq.current += 1;
        assignProfileRow(null);
        setProfileLoading(false);
        return;
      }

      const seq = ++profileReqSeq.current;
      const uid = nextUser.id;
      const email = nextUser.email ?? null;
      const boot = bootstrapProfileFromCache(uid, email);
      const prevSnapshot = profileRef.current;
      const switchingUser = prevSnapshot != null && prevSnapshot.id !== uid;

      if (switchingUser) {
        assignProfileRow(boot);
        setProfileLoading(!boot);
      } else if (boot) {
        const live = profileRef.current;
        if (live?.id === uid) {
          assignProfileRow(mergeServerProfileWithCache(live, uid));
        } else {
          assignProfileRow(boot);
        }
        setProfileLoading(false);
      } else if (
        prevSnapshot?.id === uid &&
        profileRowHasPersistedIdentity(prevSnapshot)
      ) {
        setProfileLoading(false);
      } else {
        setProfileLoading(true);
      }

      try {
        const snapshot = await loadProfileRowWithTimeout(nextUser);
        if (seq !== profileReqSeq.current) return;

        if (!snapshot) {
          const rescue = bootstrapProfileFromCache(uid, email);
          const live = profileRef.current;
          if (rescue) {
            if (live?.id === uid && live) {
              assignProfileRow(mergeServerProfileWithCache(live, uid));
            } else {
              assignProfileRow(rescue);
            }
          } else if (!(live?.id === uid && profileRowHasPersistedIdentity(live))) {
            if (!profileCacheHasPersistedIdentity(uid)) {
              assignProfileRow(null);
            }
          }
          return;
        }

        const merged = mergeServerProfileWithCache(snapshot, uid);
        persistProfileCacheOverlay(uid, merged);
        assignProfileRow(merged);
      } catch (e) {
        if (seq !== profileReqSeq.current) return;
        console.warn("[auth] profile sync failed", e);
        const rescue = bootstrapProfileFromCache(uid, email);
        const live = profileRef.current;
        if (rescue) {
          if (live?.id === uid && live) {
            assignProfileRow(mergeServerProfileWithCache(live, uid));
          } else {
            assignProfileRow(rescue);
          }
        }
      } finally {
        if (seq === profileReqSeq.current) {
          setProfileLoading(false);
        }
      }
    },
    [assignProfileRow],
  );

  const refreshProfile = useCallback(async (): Promise<UserRow | null> => {
    bumpEnigmaCounter("profileDiagRefreshAttempts");
    if (enigmaDiagEnabled()) {
      const now = Date.now();
      if (now - lastProfileRefreshDiagAtRef.current > 2500) {
        lastProfileRefreshDiagAtRef.current = now;
        diagWarn("PROFILE_REFRESH", { phase: "start" });
      }
    }
    const { data, error } = await supabase.auth.getUser();
    if (error && isInvalidLocalRefreshTokenError(error)) {
      console.warn("[AUTH_REFRESH]", {
        stage: "refreshProfile_fatal_refresh",
        ...peekAuthApiErrorParts(error),
      });
      await clearClientAuthAfterInvalidRefresh("refreshProfile:getUser");
      return null;
    }
    if (error || !data.user) return null;
    const u = data.user;
    const seq = ++profileReqSeq.current;
    const email = u.email ?? null;
    const boot = bootstrapProfileFromCache(u.id, email);
    const liveBefore = profileRef.current;

    if (boot && (!liveBefore || liveBefore.id !== u.id)) {
      assignProfileRow(boot);
    } else if (boot && liveBefore?.id === u.id) {
      assignProfileRow(mergeServerProfileWithCache(liveBefore, u.id));
    }

    const live = profileRef.current;
    const hadLocal = Boolean(
      live &&
        live.id === u.id &&
        (profileRowHasPersistedIdentity(live) ||
          profileCacheHasPersistedIdentity(u.id)),
    );

    if (!hadLocal) {
      setProfileLoading(true);
    }

    try {
      const snapshot = await loadProfileRowWithTimeout(u);
      if (seq !== profileReqSeq.current) return profileRef.current;
      if (!snapshot) return profileRef.current;

      const merged = mergeServerProfileWithCache(snapshot, u.id);
      persistProfileCacheOverlay(u.id, merged);
      assignProfileRow(merged);
      return merged;
    } catch (e) {
      console.warn("[auth] refreshProfile failed", e);
      return profileRef.current;
    } finally {
      if (seq === profileReqSeq.current) {
        setProfileLoading(false);
      }
    }
  }, [assignProfileRow]);

  const profileForUi = useMemo(() => {
    const uid = user?.id ?? null;
    if (!uid || !profile || profile.id !== uid) return profile;
    return mergeServerProfileWithCache(profile, uid);
  }, [user?.id, profile]);

  useEffect(() => {
    const fn = (e: Event) => {
      try {
        const active = Boolean((e as CustomEvent<{ active?: boolean }>).detail?.active);
        setSessionRecovering(active);
      } catch {
        setSessionRecovering(false);
      }
    };
    window.addEventListener("enigma-auth-session-recovery", fn as EventListener);
    return () =>
      window.removeEventListener(
        "enigma-auth-session-recovery",
        fn as EventListener,
      );
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const first = await supabase.auth.getSession();
        if (!active || isAuthCircuitOpen()) return;

        if (first.error && isInvalidLocalRefreshTokenError(first.error)) {
          console.warn("[AUTH_REFRESH]", {
            stage: "bootstrap_fatal_refresh_skip_recover",
            ...peekAuthApiErrorParts(first.error),
          });
          await clearClientAuthAfterInvalidRefresh("bootstrap:getSession");
          if (!active) return;
          setSession(null);
          setUser(null);
          setRestAccessToken(null);
          void loadProfileForUser(null);
          return;
        }

        let next: Session | null = null;
        if (first.error) {
          console.warn("[AUTH_NULL_SESSION_SOFT]", {
            phase: "bootstrap_getSession_error",
            message: first.error.message,
          });
          next = await recoverSessionAfterTransientFault("bootstrap:getSession_error");
          if (!active || isAuthCircuitOpen()) return;
        } else {
          next = first.data.session ?? null;
          if (!next && preferMobileSoftAuthPath()) {
            console.warn("[AUTH_NULL_SESSION_SOFT]", {
              phase: "bootstrap_null_session",
            });
            next = await recoverSessionAfterTransientFault("bootstrap:null_session_mobile");
            if (!active || isAuthCircuitOpen()) return;
          }
        }

        setSession(next);
        setUser(next?.user ?? null);
        setRestAccessToken(next);
        if (next?.user) {
          closeAuthCircuit();
          setHardAuthResetInFlight(false);
          resetAuthFaultWindow();
          void loadProfileForUser(next.user);
        } else {
          void loadProfileForUser(null);
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
          bumpEnigmaCounter("sessionDiagRefreshAttempts");
          const nw = Date.now();
          if (nw - lastAuthRefreshOkLogRef.current > 90_000) {
            lastAuthRefreshOkLogRef.current = nw;
            console.warn("[AUTH_REFRESH]", {
              stage: "TOKEN_REFRESHED_ok",
              t: nw,
              hasUser: Boolean(next?.user?.id),
            });
          }
          if (enigmaDiagEnabled()) {
            const now = Date.now();
            if (now - lastTokenRefreshDiagAtRef.current > 4000) {
              lastTokenRefreshDiagAtRef.current = now;
              diagWarn("SESSION_REFRESH", { phase: "TOKEN_REFRESHED" });
            }
          }
          if (next?.user) {
            setSession(next);
            setUser(next.user);
          }
          setLoading(false);
          return;
        }
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          bumpEnigmaCounter("authFlowDiagCount");
          if (enigmaDiagEnabled()) {
            diagWarn("AUTH_FLOW", {
              event,
              hasUser: Boolean(next?.user?.id),
            });
          }
        }
        setSession(next);
        setUser(next?.user ?? null);
        setLoading(false);

        if (next?.user) {
          if (
            event === "SIGNED_IN" ||
            event === "INITIAL_SESSION" ||
            event === "USER_UPDATED"
          ) {
            void loadProfileForUser(next.user);
          }
        } else if (event === "SIGNED_OUT") {
          void loadProfileForUser(null);
        }

        if (
          event === "SIGNED_IN" ||
          (event === "INITIAL_SESSION" && next?.user?.id)
        ) {
          closeAuthCircuit();
          setHardAuthResetInFlight(false);
          resetAuthFaultWindow();
        }
        if (event === "SIGNED_OUT") {
          if (enigmaDiagEnabled()) {
            bumpEnigmaCounter("authFlowDiagCount");
            diagWarn("AUTH_FLOW", {
              event: "SIGNED_OUT",
              transient: false,
            });
          }
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
  }, [loadProfileForUser]);

  useEffect(() => {
    const uid = user?.id;
    if (typeof window === "undefined" || !uid) return;

    let debounced: number | undefined;
    const wakeCoalesceMs = preferMobileSoftAuthPath() ? 850 : 450;
    const wakeProfileMinIntervalMs = preferMobileSoftAuthPath() ? 28_000 : 12_000;
    let pendingWakeTriggers: string[] = [];

    const scheduleSoftRefresh = (trigger: string) => {
      pendingWakeTriggers.push(trigger);
      if (debounced !== undefined) {
        window.clearTimeout(debounced);
      }
      debounced = window.setTimeout(() => {
        const triggers = Array.from(new Set(pendingWakeTriggers));
        pendingWakeTriggers = [];
        void (async () => {
          bumpEnigmaCounter("sessionDiagRefreshAttempts");
          const wakeId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID().slice(0, 8)
              : String(Date.now()).slice(-8);
          console.warn("[AUTH_MOBILE_WAKE]", {
            phase: "wake_coalesced",
            wakeId,
            triggers,
            userId: uid,
          });
          if (enigmaDiagEnabled()) {
            diagWarn("SESSION_REFRESH", {
              phase: "wake_getSession",
              wakeId,
              triggers,
            });
          }
          const { data: gs, error: ge } = await supabase.auth.getSession();
          if (ge && isInvalidLocalRefreshTokenError(ge)) {
            console.warn("[AUTH_REFRESH]", {
              stage: "wake_getSession_fatal_refresh",
              wakeId,
              triggers,
              ...peekAuthApiErrorParts(ge),
            });
            await clearClientAuthAfterInvalidRefresh(
              `wake:getSession:${triggers.join(",")}`,
            );
            return;
          }
          if (!gs.session?.user || gs.session.user.id !== uid) {
            console.warn("[AUTH_MOBILE_WAKE]", {
              phase: "wake_session_mismatch_or_empty",
              wakeId,
              triggers,
              hasSession: Boolean(gs.session?.user?.id),
            });
            return;
          }

          setSession(gs.session);
          setUser(gs.session.user);
          setRestAccessToken(gs.session);

          const now = Date.now();
          if (
            now - lastWakeProfileSyncAtRef.current >=
            wakeProfileMinIntervalMs
          ) {
            lastWakeProfileSyncAtRef.current = now;
            void loadProfileForUser(gs.session.user);
          }
        })();
      }, wakeCoalesceMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        console.warn("[AUTH_MOBILE_WAKE]", {
          phase: "visibility_visible",
          userId: uid,
        });
        scheduleSoftRefresh("visibilitychange");
      }
    };

    const onPageShow = (e: Event) => {
      const pe = e as PageTransitionEvent;
      if (pe.persisted) {
        console.warn("[AUTH_MOBILE_WAKE]", {
          phase: "pageshow_bfcache",
          userId: uid,
        });
        scheduleSoftRefresh("pageshow_bfcache");
        return;
      }
      if (preferMobileSoftAuthPath()) {
        console.warn("[AUTH_MOBILE_WAKE]", {
          phase: "pageshow_resume",
          userId: uid,
        });
        scheduleSoftRefresh("pageshow_resume");
      }
    };

    const onWindowFocus = () => {
      if (document.visibilityState !== "visible") return;
      console.warn("[AUTH_MOBILE_WAKE]", { phase: "window_focus", userId: uid });
      scheduleSoftRefresh("window_focus");
    };

    const onOnline = () => {
      console.warn("[AUTH_MOBILE_WAKE]", { phase: "online", userId: uid });
      scheduleSoftRefresh("online");
    };

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onWindowFocus);
      if (debounced !== undefined) window.clearTimeout(debounced);
    };
  }, [user?.id, loadProfileForUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const uid = session?.user?.id;
    if (!uid || loading || profileLoading || !profile) return;
    markUserReadyForPwaInstall();
  }, [session?.user?.id, profile, loading, profileLoading]);

  const signOut = useCallback(async () => {
    profileReqSeq.current += 1;
    setSessionRecovering(false);
    setSession(null);
    setUser(null);
    assignProfileRow(null);
    setProfileLoading(false);
    setRestAccessToken(null);
    closeAuthCircuit();
    setHardAuthResetInFlight(false);
    resetAuthFaultWindow();
    clearUserReadyForPwaInstall();
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // noop
    }
  }, [assignProfileRow]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      session,
      profile: profileForUi,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      authResolved: !loading && !sessionRecovering,
      authSessionRecovering: sessionRecovering,
      profileLoading,
      onboardingResolved,
      ready: !loading && !sessionRecovering,
      signOut,
      refreshProfile,
    }),
    [
      user,
      session,
      profileForUi,
      needsProfileSetup,
      needsPhone,
      needsName,
      loading,
      sessionRecovering,
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
