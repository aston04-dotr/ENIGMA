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
  const [profile, setProfileState] = useState<UserRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const profileRef = useRef<UserRow | null>(null);
  const profileReqSeq = useRef(0);

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
    const { data, error } = await supabase.auth.getUser();
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
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || isAuthCircuitOpen()) return;
        if (error) {
          console.warn(
            "[auth-bootstrap] getSession error (ignored for hard reset)",
            error.message,
          );
          return;
        }
        const next = data.session ?? null;
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
          if (next?.user) {
            setSession(next);
            setUser(next.user);
          }
          setLoading(false);
          return;
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

    const scheduleSoftRefresh = () => {
      if (debounced !== undefined) {
        window.clearTimeout(debounced);
      }
      debounced = window.setTimeout(() => {
        void (async () => {
          const { data } = await supabase.auth.getUser();
          if (!data.user || data.user.id !== uid) return;
          await refreshProfile();
        })();
      }, 450);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleSoftRefresh();
      }
    };

    const onPageShow = (e: Event) => {
      if ((e as PageTransitionEvent).persisted) {
        scheduleSoftRefresh();
      }
    };

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", scheduleSoftRefresh);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", scheduleSoftRefresh);
      window.removeEventListener("pageshow", onPageShow);
      if (debounced !== undefined) window.clearTimeout(debounced);
    };
  }, [user?.id, refreshProfile]);

  const signOut = useCallback(async () => {
    profileReqSeq.current += 1;
    setSession(null);
    setUser(null);
    assignProfileRow(null);
    setProfileLoading(false);
    setRestAccessToken(null);
    closeAuthCircuit();
    setHardAuthResetInFlight(false);
    resetAuthFaultWindow();
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
      profileForUi,
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
