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
import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
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

  const [onboardingResolved] = useState(true);
  const [needsPhone] = useState(false);
  const [needsName] = useState(false);
  const [needsProfileSetup] = useState(false);

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
  }, [user?.id, user?.email, ensureProfileExists, loadProfile]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const init = async () => {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionErr) {
        console.warn("[auth] getSession", sessionErr);
      }

      if (!mounted) return;
      setSession(sessionData.session);
      setUser(sessionData.session?.user ?? null);
      setAuthResolved(true);
      setLoading(false);
      setReady(true);

      if (sessionData.session) {
        void (async () => {
          try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();
            if (!mounted) return;
            if (userErr) {
              console.warn("[auth] getUser (refresh in background)", userErr);
            } else if (userData.user) {
              setUser(userData.user);
            }
          } catch (e) {
            console.error("[auth] getUser unexpected", e);
          }
        })();
      }
    };

    void init().catch((err) => {
      console.error("[auth-context] init", err);
      if (!mounted) return;
      setSession(null);
      setUser(null);
      setAuthResolved(true);
      setLoading(false);
      setReady(true);
    });

    const { data: subData } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("[auth] event", event);
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      setAuthResolved(true);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      mounted = false;
      subData.subscription.unsubscribe();
    };
  }, [bootstrapKey]);

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
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileLoading(false);
    setAuthResolved(true);
    setLoading(false);
    setReady(true);

    try {
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

  if (loading) {
    return <AuthLoadingScreen />;
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
