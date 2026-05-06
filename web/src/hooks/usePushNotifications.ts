"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSessionGuarded, getSupabaseRestWithSession, supabase } from "@/lib/supabase";
import {
  isBackoffSkipped,
  isSupabaseReachable,
  withPostgrestBackoff,
} from "@/lib/supabaseHealth";
import type { Json } from "@/lib/supabase.types";

type UsePushNotificationsOptions = {
  enabled: boolean;
  userId: string | null;
};

type PushState =
  | "idle"
  | "unsupported"
  | "registering"
  | "granted"
  | "denied"
  | "error";

export type PushStatus = {
  state: PushState;
  permission: NotificationPermission | "unsupported";
  supported: boolean;
  subscribed: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  unsubscribe: () => Promise<void>;
};

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";

const STORAGE_RETRY_KEY = "enigma:web-push:last-attempt-at";
const RETRY_INTERVAL_MS = 60_000;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function getPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function base64UrlToUint8Array(input: string): ArrayBuffer {
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output.buffer.slice(0);
}

function safeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function hasValidAccessToken(): Promise<boolean> {
  const { session } = await getSessionGuarded("push-has-token", {
    allowRefresh: false,
  });
  return Boolean(session?.access_token?.trim());
}

async function upsertWebPushSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<boolean> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || !isUuid(normalizedUserId)) return false;
  const { session } = await getSessionGuarded("push-upsert-subscription", {
    allowRefresh: false,
  });
  if (!session?.user?.id || session.user.id !== normalizedUserId) {
    return false;
  }

  const endpoint = subscription.endpoint?.trim();
  if (!endpoint) return false;

  const rest = getSupabaseRestWithSession();
  if (!rest) return false;

  type PushTokenPayload = {
    user_id: string;
    token: string;
    provider: "webpush";
    subscription: Json;
    user_agent: string | null;
    last_seen_at: string;
  };

  const fullPayload: PushTokenPayload = {
    user_id: normalizedUserId,
    token: endpoint,
    provider: "webpush" as const,
    subscription: safeJson(subscription.toJSON()) as Json,
    user_agent:
      typeof navigator !== "undefined" ? (navigator.userAgent ?? null) : null,
    last_seen_at: new Date().toISOString(),
  };
  const out = await withPostgrestBackoff({
    checkSession: hasValidAccessToken,
    checkHealth: isSupabaseReachable,
    logLabel: "web push upsert",
    run: (signal) =>
      rest
        .from("push_tokens")
        .upsert([fullPayload], { onConflict: "user_id" })
        .abortSignal(signal),
  });
  if (isBackoffSkipped(out)) return false;
  if (out.result.error) {
    console.error("SUPABASE ERROR: push_tokens upsert", out.result.error);
    return false;
  }
  return true;
}

async function removeWebPushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || !isUuid(normalizedUserId)) return;
  const trimmed = endpoint?.trim() ?? "";
  if (!trimmed) return;

  const { session } = await getSessionGuarded("push-remove-subscription", {
    allowRefresh: false,
  });
  if (!session?.user?.id) {
    return;
  }
  if (session.user.id !== normalizedUserId) {
    return;
  }

  const rest = getSupabaseRestWithSession();
  if (!rest) return;

  const out = await withPostgrestBackoff({
    checkSession: hasValidAccessToken,
    checkHealth: isSupabaseReachable,
    logLabel: "web push delete",
    run: (signal) =>
      rest
        .from("push_tokens")
        .delete()
        .eq("user_id", normalizedUserId)
        .abortSignal(signal),
  });
  if (isBackoffSkipped(out)) return;
  if (out.result.error) {
    console.error("SUPABASE ERROR: push_tokens delete", out.result.error);
  }
}

function shouldThrottlePrompt(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_RETRY_KEY);
    const lastAttempt = raw ? Number(raw) : 0;
    if (!Number.isFinite(lastAttempt) || lastAttempt <= 0) return false;
    return Date.now() - lastAttempt < RETRY_INTERVAL_MS;
  } catch {
    return false;
  }
}

function touchPromptAttempt(): void {
  try {
    window.localStorage.setItem(STORAGE_RETRY_KEY, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

export function usePushNotifications({
  enabled,
  userId,
}: UsePushNotificationsOptions): PushStatus {
  const [state, setState] = useState<PushState>(() => {
    if (!enabled) return "idle";
    return isPushSupported() && VAPID_PUBLIC_KEY ? "idle" : "unsupported";
  });
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(getPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inflightRef = useRef<Promise<void> | null>(null);

  const supported = enabled && isPushSupported() && Boolean(VAPID_PUBLIC_KEY);

  const syncExistingSubscription = useCallback(async () => {
    if (!supported || !userId) {
      if (mountedRef.current) {
        setSubscribed(false);
      }
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    if (!existing) {
      if (mountedRef.current) {
        setSubscribed(false);
        setState("idle");
      }
      return;
    }

    const synced = await upsertWebPushSubscription(userId, existing);
    if (!synced) {
      if (mountedRef.current) {
        setSubscribed(false);
        setState("idle");
      }
      return;
    }

    if (!mountedRef.current) return;
    setSubscribed(true);
    setState("granted");
    setError(null);
  }, [supported, userId]);

  const subscribeInternal = useCallback(async () => {
    if (!enabled) return;

    if (!supported) {
      if (!mountedRef.current) return;
      setPermission(getPermission());
      setState(isPushSupported() && VAPID_PUBLIC_KEY ? "idle" : "unsupported");
      setSubscribed(false);
      return;
    }

    if (!userId) {
      if (!mountedRef.current) return;
      setSubscribed(false);
      setState("idle");
      return;
    }

    setState("registering");
    setError(null);

    const nextPermission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (!mountedRef.current) return;
    setPermission(nextPermission);

    if (nextPermission !== "granted") {
      setSubscribed(false);
      setState(nextPermission === "denied" ? "denied" : "idle");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const registered = await upsertWebPushSubscription(userId, subscription);
    if (!registered) {
      if (!mountedRef.current) return;
      setSubscribed(false);
      setState("idle");
      return;
    }

    if (!mountedRef.current) return;
    setSubscribed(true);
    setState("granted");
    setError(null);
    touchPromptAttempt();
  }, [enabled, supported, userId]);

  const refresh = useCallback(async () => {
    if (inflightRef.current) {
      return inflightRef.current;
    }

    const job = (async () => {
      try {
        setPermission(getPermission());

        if (!enabled) {
          setState("idle");
          setSubscribed(false);
          setError(null);
          return;
        }

        if (!supported) {
          setState(
            isPushSupported() && VAPID_PUBLIC_KEY ? "idle" : "unsupported",
          );
          setSubscribed(false);
          return;
        }

        if (!userId) {
          setState("idle");
          setSubscribed(false);
          setError(null);
          return;
        }

        if (Notification.permission === "granted") {
          await syncExistingSubscription();
          return;
        }

        if (Notification.permission === "denied") {
          setState("denied");
          setSubscribed(false);
          return;
        }

        if (shouldThrottlePrompt()) {
          setState("idle");
          return;
        }

        touchPromptAttempt();
        await subscribeInternal();
      } catch {
        if (!mountedRef.current) return;
        setState("idle");
        setError(null);
        setSubscribed(false);
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = job;
    return job;
  }, [enabled, supported, subscribeInternal, syncExistingSubscription, userId]);

  const unsubscribe = useCallback(async () => {
    if (!isPushSupported()) {
      if (mountedRef.current) {
        setSubscribed(false);
      }
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        const endpoint = existing.endpoint?.trim() ?? "";
        const unsubscribed = await existing.unsubscribe();

        if (endpoint && userId) {
          await removeWebPushSubscription(userId, endpoint);
        }

        if (!unsubscribed) {
          // локальный отказ браузера — тоже без error UI для пушей
        }
      }

      if (!mountedRef.current) return;
      setSubscribed(false);
      setState(Notification.permission === "denied" ? "denied" : "idle");
      setError(null);
    } catch {
      if (!mountedRef.current) return;
      setSubscribed(false);
      setState("idle");
      setError(null);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !supported || !userId) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, supported, userId, refresh]);

  return useMemo(
    () => ({
      state,
      permission,
      supported,
      subscribed,
      error,
      refresh,
      unsubscribe,
    }),
    [state, permission, supported, subscribed, error, refresh, unsubscribe],
  );
}

export default usePushNotifications;
