import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { checkAccessBlocked } from "../lib/bans";
import { getDeviceId, rpcCheckDeviceBanned, rpcCountProfilesForDevice } from "../lib/device";
import { isSchemaNotInCache } from "../lib/postgrestErrors";
import { ensureProfileAndUserRow } from "../lib/profileSync";
import { decreaseTrust, tryDailyTrustRecovery } from "../lib/trust";
import { registerPushTokenForUser } from "../lib/registerPushNotifications";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { UserRow } from "../lib/types";

type AuthCtx = {
  session: Session | null;
  profile: UserRow | null;
  loading: boolean;
  /** false до первого завершения: magic link (если был URL) → getSession → профиль. */
  authResolved: boolean;
  needsPhone: boolean;
  needsName: boolean;
  needsProfileSetup: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

type LoadResult = { row: UserRow | null; needsPhone: boolean };

let isProcessingMagicLink = false;

/** PKCE и query: Linking.parse + new URL + ручной query (custom schemes). */
function extractOAuthCodeFromUrl(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams?.code;
    if (typeof q === "string" && q.length > 0) return q;
  } catch {
    /* fall through */
  }
  try {
    const urlObj = new URL(url);
    const c = urlObj.searchParams.get("code");
    if (c) return c;
  } catch {
    /* custom scheme enigma:// — часто не парсится как URL */
  }
  try {
    const qIndex = url.indexOf("?");
    if (qIndex < 0) return null;
    const queryOnly = url.slice(qIndex + 1).split("#")[0] ?? "";
    const sp = new URLSearchParams(queryOnly);
    return sp.get("code");
  } catch {
    return null;
  }
}

/**
 * Magic link: ?code= → exchangeCodeForSession; #access_token → setSession.
 * Один обработчик за раз (isProcessingMagicLink).
 */
async function processMagicLinkUrl(url: string | null): Promise<void> {
  if (!url?.trim()) return;
  if (isProcessingMagicLink) return;

  isProcessingMagicLink = true;
  console.log("DEEP LINK URL", url);

  try {
    const code = extractOAuthCodeFromUrl(url);
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("MAGIC LINK ERROR", error);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("SESSION AFTER MAGIC LINK", sessionData?.session);
      return;
    }

    const hashIdx = url.indexOf("#");
    if (hashIdx >= 0) {
      const hash = url.slice(hashIdx + 1);
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error("MAGIC LINK setSession ERROR", error);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("SESSION AFTER MAGIC LINK", sessionData?.session);
      }
    }
  } finally {
    isProcessingMagicLink = false;
  }
}

/** Device ban + max 3 accounts per device_id; persists device_id on profiles. */
async function syncDevicePolicy(user: User): Promise<boolean> {
  try {
    const deviceId = await getDeviceId();
    if (await rpcCheckDeviceBanned(deviceId)) {
      console.log("DEVICE BANNED → FORCE LOGOUT");
      await supabase.auth.signOut();
      return false;
    }

    await ensureProfileAndUserRow(user);

    const { data: prof } = await supabase.from("profiles").select("device_id").eq("id", user.id).maybeSingle();
    const count = await rpcCountProfilesForDevice(deviceId);
    if (count >= 3 && prof?.device_id !== deviceId) {
      void decreaseTrust(user.id, 30);
      Alert.alert("Ограничение", "Слишком много аккаунтов с этого устройства");
      await supabase.auth.signOut();
      return false;
    }

    const { error } = await supabase.from("profiles").upsert(
      { id: user.id, email: user.email ?? null, device_id: deviceId },
      { onConflict: "id" }
    );
    if (error && __DEV__) console.warn("profiles device_id upsert", error.message);
    return true;
  } catch (e) {
    console.error("syncDevicePolicy", e);
    return true;
  }
}

async function enforceAccessOrLogout(
  user: User,
  profilePhone: string | null,
  profileDeviceId: string | null
): Promise<boolean> {
  const blocked = await checkAccessBlocked(user.email, profilePhone, profileDeviceId);
  if (blocked) {
    console.log("ACCESS BLOCKED → FORCE LOGOUT");
    await supabase.auth.signOut();
    return true;
  }
  return false;
}

async function loadProfile(userId: string): Promise<LoadResult> {
  await tryDailyTrustRecovery();
  const { data: u, error: uErr } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (uErr && isSchemaNotInCache(uErr)) return { row: null, needsPhone: false };
  if (uErr) {
    if (__DEV__) console.warn("loadProfile users", uErr.message);
    return { row: null, needsPhone: false };
  }

  let { data: p, error: pErr } = await supabase
    .from("profiles")
    .select("phone,email,phone_updated_at,device_id,trust_score")
    .eq("id", userId)
    .maybeSingle();

  if (pErr && !isSchemaNotInCache(pErr) && __DEV__) console.warn("loadProfile profiles", pErr.message);

  if (!p && !pErr) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      await ensureProfileAndUserRow(auth.user);
      const retry = await supabase
        .from("profiles")
        .select("phone,email,phone_updated_at,device_id,trust_score")
        .eq("id", userId)
        .maybeSingle();
      p = retry.data;
      pErr = retry.error;
    }
  }

  if (!u) return { row: null, needsPhone: false };

  const row = u as UserRow;
  const merged: UserRow = {
    ...row,
    phone: p?.phone ?? row.phone,
    email: p?.email ?? row.email,
    phone_updated_at: p?.phone_updated_at ?? null,
    device_id: p?.device_id ?? null,
    trust_score: p?.trust_score ?? row.trust_score ?? null,
  };
  const needsPhone = !p?.phone?.trim();
  return { row: merged, needsPhone };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);

  const refreshProfile = useCallback(async () => {
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!uid) {
      setProfile(null);
      setNeedsPhone(false);
      return;
    }
    try {
      const { row, needsPhone: np } = await loadProfile(uid);
      setProfile(row);
      setNeedsPhone(np);
    } catch {
      setProfile(null);
      setNeedsPhone(false);
    }
  }, []);

  useEffect(() => {
    console.log("SESSION", session);
  }, [session]);

  useEffect(() => {
    console.log("PROFILE STATE", profile);
  }, [profile]);

  useEffect(() => {
    console.log("AUTH RESOLVED", authResolved);
  }, [authResolved]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setAuthResolved(true);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        // 1) cold start URL → magic link (один проход, guard внутри processMagicLinkUrl)
        const initialUrl = await Linking.getInitialURL();
        await processMagicLinkUrl(initialUrl);
        if (!mounted) return;

        // 2) только после обработки ссылки — актуальная сессия
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(s);
        if (s?.user?.id) {
          const deviceOk = await syncDevicePolicy(s.user);
          if (!mounted) return;
          if (!deviceOk) {
            setSession(null);
            setProfile(null);
            setNeedsPhone(false);
            return;
          }
          const { row, needsPhone: np } = await loadProfile(s.user.id);
          if (!mounted) return;
          if (await enforceAccessOrLogout(s.user, row?.phone ?? null, row?.device_id ?? null)) {
            setSession(null);
            setProfile(null);
            setNeedsPhone(false);
            Alert.alert("Доступ", "Аккаунт заблокирован.");
            return;
          }
          setProfile(row);
          setNeedsPhone(np);
        } else {
          setProfile(null);
          setNeedsPhone(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setAuthResolved(true);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (!s?.user?.id) {
        setProfile(null);
        setNeedsPhone(false);
        return;
      }
      if (event === "TOKEN_REFRESHED") return;

      const deviceOk = await syncDevicePolicy(s.user);
      if (!deviceOk) {
        setSession(null);
        setProfile(null);
        setNeedsPhone(false);
        return;
      }
      const { row, needsPhone: np } = await loadProfile(s.user.id);
      if (await enforceAccessOrLogout(s.user, row?.phone ?? null, row?.device_id ?? null)) {
        setSession(null);
        setProfile(null);
        setNeedsPhone(false);
        Alert.alert("Доступ", "Аккаунт заблокирован.");
        return;
      }
      setProfile(row);
      setNeedsPhone(np);
    });

    const linkSub = Linking.addEventListener("url", (e) => {
      void processMagicLinkUrl(e.url);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    void registerPushTokenForUser(uid);
  }, [session?.user?.id]);

  const needsName = Boolean(
    session?.user && (!profile || !profile.name || String(profile.name).trim().length === 0)
  );

  const needsProfileSetup = Boolean(session?.user && (needsPhone || needsName));

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setNeedsPhone(false);
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      authResolved,
      needsPhone,
      needsName,
      needsProfileSetup,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, authResolved, needsPhone, needsName, needsProfileSetup, refreshProfile, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
