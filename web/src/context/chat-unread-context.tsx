"use client";

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
  getRestAccessToken,
  getSupabaseRestWithSession,
  setRestAccessToken,
  supabase,
} from "@/lib/supabase";
import { isSupabaseReachable, withPostgrestBackoff } from "@/lib/supabaseHealth";
import { useAuth } from "@/context/auth-context";
import { bumpEnigmaCounter, getEnigmaDebugCounters } from "@/lib/enigmaDebugCounters";
import { isAuthCircuitOpen } from "@/lib/authCircuitState";
import { reportEnigmaIllegalState } from "@/lib/enigmaIllegalState";
import { subscribeEnigmaAuthSingleton } from "@/lib/supabaseAuthSingleton";
import {
  setTransportRealtimeChannelProbe,
  setTransportTokenProbe,
} from "@/lib/supabaseTransportInstrument";

type CrossTabEvent =
  | { type: "chat-refresh" }
  | { type: "chat-read"; chatId: string }
  | { type: "chat-active"; chatId: string | null };

type ChatUnreadContextValue = {
  rows: ChatListRow[];
  totalUnread: number;
  loading: boolean;
  ready: boolean;
  hydrated: boolean;
  realtimeReady: boolean;
  error: string | null;
  activeChatId: string | null;
  refreshChats: (opts?: { silent?: boolean }) => Promise<void>;
  markChatRead: (
    chatId: string,
    upToMessageId?: string | null,
  ) => Promise<void>;
  setActiveChatId: (chatId: string | null) => void;
  getChatRow: (chatId: string) => ChatListRow | null;
  setChats: React.Dispatch<React.SetStateAction<ChatListRow[]>>;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

const CHANNEL_NAME = "enigma-chat-sync";
const STORAGE_KEY = "enigma:chat-sync";
const PRESENCE_HEARTBEAT_MS = 30_000;
const CHAT_REFRESH_POLL_MS = 8_000;
const REALTIME_EVENT_TTL_MS = 15_000;
const UNREAD_RECONCILE_DEBOUNCE_MS = 1_200;
const UNREAD_RECONCILE_POLL_MS = 35_000;
const REALTIME_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
const REALTIME_FAILURE_LIMIT = 5;
const FALLBACK_POLL_MS = 25_000;
const AUTH_STABILIZE_DELAY_MS = 800;
/** Foreground/resume: only coalesced silent list refresh — never bumps realtime teardown. */
const FOREGROUND_SILENT_REFRESH_DEBOUNCE_MS = 3_500;
/** Rate-limit [CHAT_STORM_SOURCE] presence logs (heartbeats stay enabled). */
const PRESENCE_STORM_LOG_MIN_INTERVAL_MS = 20_000;
/** Bundle DB presence + push last_seen REST calls — avoids REST JWT getter storms. */
const REST_PRESENCE_BUNDLE_INTERVAL_MS = 120_000;
const DEV_CHAT_DEBUG = process.env.NODE_ENV === "development";

function chatStormSource(source: string, payload?: Record<string, unknown>) {
  console.warn("[CHAT_STORM_SOURCE]", source, payload ?? {});
}

function chatDebugLog(event: string, payload?: Record<string, unknown>) {
  if (!DEV_CHAT_DEBUG) return;
  if (payload) {
    console.debug(`[chat-unread][dev] ${event}`, payload);
    return;
  }
  console.debug(`[chat-unread][dev] ${event}`);
}

function chatRealtimeLog(
  level: "info" | "warn" | "error",
  event: "subscribe" | "error" | "retry" | "disabled",
  payload?: Record<string, unknown>,
) {
  const serialized = (() => {
    try {
      return JSON.stringify(payload ?? {}, null, 2);
    } catch {
      return "{}";
    }
  })();
  const message = `[chat-realtime] ${event}`;
  if (level === "error") {
    console.error(message, serialized);
    return;
  }
  if (level === "warn") {
    console.warn(message, serialized);
    return;
  }
  console.info(message, serialized);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeChatRow(
  raw: Record<string, unknown>,
  viewerId: string | null,
): ChatListRow {
  const chatId = String(raw.chat_id ?? raw.id ?? "");
  const buyerId = raw.buyer_id != null ? String(raw.buyer_id) : null;
  const sellerId = raw.seller_id != null ? String(raw.seller_id) : null;
  const createdAt = raw.created_at
    ? String(raw.created_at)
    : new Date(0).toISOString();

  let otherUserId = raw.other_user_id ? String(raw.other_user_id) : null;
  if (!otherUserId && viewerId && buyerId && sellerId) {
    if (viewerId === buyerId) otherUserId = sellerId;
    else if (viewerId === sellerId) otherUserId = buyerId;
  }

  const lastMessageAt = raw.last_message_at
    ? String(raw.last_message_at)
    : null;
  const lastMessageCreatedAt = raw.last_message_created_at
    ? String(raw.last_message_created_at)
    : null;
  const derivedLastAt = lastMessageAt || lastMessageCreatedAt || createdAt;

  return {
    chat_id: chatId,
    buyer_id: buyerId,
    seller_id: sellerId,
    created_at: createdAt,
    listing_id: raw.listing_id != null ? String(raw.listing_id) : null,
    listing_image: raw.listing_image != null ? String(raw.listing_image) : null,
    is_group: Boolean(raw.is_group),
    title: raw.title != null ? String(raw.title) : null,
    other_user_id: otherUserId,
    other_name: raw.other_name != null ? String(raw.other_name) : null,
    other_avatar: raw.other_avatar != null ? String(raw.other_avatar) : null,
    other_public_id:
      raw.other_public_id != null ? String(raw.other_public_id) : null,
    last_message_id:
      raw.last_message_id != null ? String(raw.last_message_id) : null,
    last_message_text:
      raw.last_message_text != null ? String(raw.last_message_text) : null,
    last_message_sender_id: raw.last_message_sender_id
      ? String(raw.last_message_sender_id)
      : null,
    last_message_created_at: lastMessageCreatedAt,
    last_message_image_url: raw.last_message_image_url
      ? String(raw.last_message_image_url)
      : null,
    last_message_voice_url: raw.last_message_voice_url
      ? String(raw.last_message_voice_url)
      : null,
    last_message_deleted:
      typeof raw.last_message_deleted === "boolean"
        ? raw.last_message_deleted
        : null,
    last_message_at: lastMessageAt ?? derivedLastAt,
    unread_count: Number.isFinite(Number(raw.unread_count))
      ? Math.max(0, Number(raw.unread_count))
      : 0,
  };
}


function computeTotalUnread(rows: ChatListRow[]): number {
  return rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.unread_count || 0)),
    0,
  );
}

function createCrossTabBus() {
  let bc: BroadcastChannel | null = null;
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    bc = new BroadcastChannel(CHANNEL_NAME);
  }

  return {
    post(event: CrossTabEvent) {
      if (typeof window === "undefined") return;
      try {
        bc?.postMessage(event);
      } catch {
        // noop
      }
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...event, nonce: Date.now() + Math.random() }),
        );
      } catch {
        // noop
      }
    },
    subscribe(listener: (event: CrossTabEvent) => void) {
      if (typeof window === "undefined") return () => {};

      const onMessage = (evt: MessageEvent) => {
        if (evt?.data && typeof evt.data === "object") {
          listener(evt.data as CrossTabEvent);
        }
      };

      const onStorage = (evt: StorageEvent) => {
        if (evt.key !== STORAGE_KEY || !evt.newValue) return;
        try {
          const parsed = JSON.parse(evt.newValue) as CrossTabEvent;
          listener(parsed);
        } catch {
          // noop
        }
      };

      bc?.addEventListener("message", onMessage);
      window.addEventListener("storage", onStorage);

      return () => {
        bc?.removeEventListener("message", onMessage);
        window.removeEventListener("storage", onStorage);
      };
    },
    close() {
      bc?.close();
    },
  };
}

function listSortKey(row: ChatListRow): string {
  return (
    row.last_message_at ||
    row.last_message_created_at ||
    row.created_at ||
    ""
  );
}

function sortByLastMessageDesc(rows: ChatListRow[]): ChatListRow[] {
  return [...rows].sort((a, b) => {
    const tb = new Date(listSortKey(b)).getTime();
    const ta = new Date(listSortKey(a)).getTime();
    if (tb !== ta) return tb - ta;
    return b.chat_id.localeCompare(a.chat_id);
  });
}

function messageTimestampMs(row: ChatListRow): number {
  const ts = Date.parse(
    row.last_message_created_at || row.last_message_at || row.created_at || "",
  );
  return Number.isFinite(ts) ? ts : 0;
}

function mergeServerRowsWithLocal(
  _prev: ChatListRow[],
  next: ChatListRow[],
): ChatListRow[] {
  return sortByLastMessageDesc(next);
}

type MessageSnapshotRow = {
  id?: string | null;
  chat_id?: string | null;
  sender_id?: string | null;
  text?: string | null;
  image_url?: string | null;
  voice_url?: string | null;
  created_at?: string | null;
  deleted?: boolean | null;
  read_at?: string | null;
};

function hydrateRowsFromMessagesSnapshot(
  rows: ChatListRow[],
  messages: MessageSnapshotRow[],
  viewerId: string,
): ChatListRow[] {
  const latestByChat = new Map<string, MessageSnapshotRow>();
  const unreadByChat = new Map<string, number>();

  for (const msg of messages) {
    const chatId = String(msg.chat_id ?? "").trim();
    if (!chatId) continue;
    if (!latestByChat.has(chatId)) {
      latestByChat.set(chatId, msg);
    }
    const senderId = String(msg.sender_id ?? "").trim();
    const readAt = String(msg.read_at ?? "").trim();
    if (senderId && senderId !== viewerId && !readAt) {
      unreadByChat.set(chatId, (unreadByChat.get(chatId) ?? 0) + 1);
    }
  }

  const hydrated = rows.map((row) => {
    const latest = latestByChat.get(row.chat_id);
    const snapshotUnread = unreadByChat.get(row.chat_id) ?? 0;
    if (!latest) {
      return {
        ...row,
        unread_count: Math.max(0, Number(row.unread_count || 0), snapshotUnread),
      };
    }

    const latestCreatedAt = String(latest.created_at ?? "").trim();
    const serverCreatedAt = String(
      row.last_message_created_at || row.last_message_at || row.created_at || "",
    ).trim();
    const latestTs = Date.parse(latestCreatedAt);
    const serverTs = Date.parse(serverCreatedAt);
    const shouldTakeLatest =
      Number.isFinite(latestTs) &&
      (!Number.isFinite(serverTs) || latestTs > serverTs);

    return {
      ...row,
      last_message_id: shouldTakeLatest
        ? String(latest.id ?? "").trim() || row.last_message_id
        : row.last_message_id,
      last_message_text: shouldTakeLatest
        ? String(latest.text ?? "")
        : row.last_message_text,
      last_message_sender_id: shouldTakeLatest
        ? String(latest.sender_id ?? "").trim() || row.last_message_sender_id
        : row.last_message_sender_id,
      last_message_created_at: shouldTakeLatest
        ? latestCreatedAt || row.last_message_created_at
        : row.last_message_created_at,
      last_message_at: shouldTakeLatest
        ? latestCreatedAt || row.last_message_at
        : row.last_message_at,
      last_message_image_url: shouldTakeLatest
        ? String(latest.image_url ?? "").trim() || null
        : row.last_message_image_url,
      last_message_voice_url: shouldTakeLatest
        ? String(latest.voice_url ?? "").trim() || null
        : row.last_message_voice_url,
      last_message_deleted: shouldTakeLatest
        ? Boolean(latest.deleted)
        : row.last_message_deleted,
      unread_count: Math.max(0, Number(row.unread_count || 0), snapshotUnread),
    };
  });

  return sortByLastMessageDesc(hydrated);
}

function rowMatchesChatId(row: ChatListRow, messageChatId: string): boolean {
  if (row.chat_id === messageChatId) return true;
  const withId = row as ChatListRow & { id?: string };
  return String(withId.id ?? "").trim() === messageChatId;
}

function isChatForegroundForId(chatId: string, activeChatId: string | null): boolean {
  if (!chatId || !activeChatId || chatId !== activeChatId) return false;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const routeChatId =
    String(window.location.pathname || "").match(/^\/chat\/([0-9a-f-]{36})$/i)?.[1] ?? null;
  if (!routeChatId || routeChatId !== chatId) return false;
  if (document.visibilityState !== "visible") return false;
  if (document.hidden) return false;
  return true;
}

const G_CHAT_RT_PROBE = globalThis as typeof globalThis & {
  __ENIGMA_CHAT_RT_EFFECT_PROBE__?: { lastUserId: string | null; lastAt: number };
};

/** Dev Strict Mode mounts effects twice rapidly — tag so logs are not confused with prod churn. */
function probeChatRealtimeEffectStrictDuplicate(userId: string | null) {
  if (process.env.NODE_ENV === "production" || typeof userId !== "string" || !userId) return;
  const now = Date.now();
  const prev = G_CHAT_RT_PROBE.__ENIGMA_CHAT_RT_EFFECT_PROBE__;
  if (
    prev &&
    prev.lastUserId === userId &&
    now - prev.lastAt < 120
  ) {
    bumpEnigmaCounter("strictModeDuplicateCount");
    console.warn("[STRICT_MODE_DUPLICATE_EFFECT]", {
      realm: "chat-realtime-setup",
      userId,
      deltaMs: now - prev.lastAt,
    });
  }
  G_CHAT_RT_PROBE.__ENIGMA_CHAT_RT_EFFECT_PROBE__ = { lastUserId: userId, lastAt: now };
}

export function ChatUnreadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    session,
    loading,
    authResolved,
    profileLoading,
    onboardingResolved,
    ready: authReady,
  } = useAuth();
  const userId = user?.id ?? null;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const authLifecycleReady =
    authResolved &&
    !loading &&
    (!userId || (!profileLoading && onboardingResolved && authReady));

  const [rows, setRows] = useState<ChatListRow[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [hydratedState, setHydratedState] = useState(false);
  const [realtimeReadyState, setRealtimeReadyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);
  const [realtimeDisabledState, setRealtimeDisabledState] = useState(false);
  const [realtimeMode, setRealtimeMode] = useState<"realtime" | "polling" | "disabled">(
    "disabled",
  );
  const [authStabilizedState, setAuthStabilizedState] = useState(false);
  const processedRealtimeEventsRef = useRef<Map<string, number>>(new Map());

  const statusRef = useRef<{
    refreshTimer: number | null;
    reconcileTimer: number | null;
    reconnectTimer: number | null;
    reconnectAttempt: number;
    listChannel: ReturnType<typeof supabase.channel> | null;
    activeChatId: string | null;
  }>({
    refreshTimer: null,
    reconcileTimer: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    listChannel: null,
    activeChatId: null,
  });
  const rowsRef = useRef<ChatListRow[]>([]);
  const authLifecycleReadyRef = useRef(authLifecycleReady);
  const lastForegroundSilentRefreshAtRef = useRef(0);
  const realtimeDisabledRef = useRef(false);
  const maxRealtimeFailuresRef = useRef(0);
  const hasLoggedRealtimeDisabledRef = useRef(false);
  const realtimeModeRef = useRef<"realtime" | "polling" | "disabled">(realtimeMode);
  const authStabilizedRef = useRef(false);
  const authReadyRef = useRef(false);
  const stableSessionRef = useRef<typeof session | null>(session ?? null);

  useEffect(() => {
    stableSessionRef.current = session ?? null;
    setRestAccessToken(session ?? null);
  }, [session]);
  const lastPresenceStormLogAtRef = useRef(0);
  const realtimeConnectOwnerRef = useRef(0);
  const realtimeListChannelReadyRef = useRef(false);
  const bootstrapCompletedRef = useRef(false);
  const authStabilizeTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const reconcileInFlightRef = useRef<Promise<void> | null>(null);
  const lastReconcileScheduledAtRef = useRef(0);
  const pendingSilentRefreshAfterCurrentRef = useRef(false);
  const reconcileDeferredReasonRef = useRef<string | null>(null);
  const lastRestPresenceBundleAtRef = useRef(0);
  const scheduleRefreshRef = useRef<(delayMs?: number, opts?: { silent?: boolean }) => void>(() => {});
  const scheduleReconcileRef = useRef<(reason: string, delayMs?: number) => void>(() => {});
  const singletonSignedInUidRef = useRef<string | null>(null);
  /** realtime tryBootstrap freeze: duplicate path same user already live */
  const realtimeBootstrapPathPrevUidRef = useRef<string | null>(null);

  const refreshChatsRef = useRef<
    ((opts?: { silent?: boolean }) => Promise<void>) | null
  >(null);
  const reconcileUnreadSnapshotRef = useRef<
    ((reason: string) => Promise<void>) | null
  >(null);

  /** List channel lifecycle — gate reconnect storms (idle | connecting | subscribed). */
  const realtimeListConnectionStateRef = useRef<"idle" | "connecting" | "subscribed">(
    "idle",
  );
  /** Suppress stale Realtime callbacks after newer connect(); bump only when opening a subscribe. */
  const subscribeGenerationRef = useRef(0);
  /** user id aligned with LIST SUBSCRIBED (cleared when channel torn down). */
  const realtimeListSubscribedForUserRef = useRef<string | null>(null);

  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const authResolvedRef = useRef(authResolved);
  authResolvedRef.current = authResolved;
  useEffect(() => {
    console.warn("[CHAT_PROVIDER_MOUNT]");
    return () => {
      console.warn("[CHAT_PROVIDER_UNMOUNT]");
    };
  }, []);

  useEffect(() => {
    setTransportTokenProbe(() => ({
      hasRestToken: Boolean(getRestAccessToken()?.trim()),
      hasSessionToken: Boolean(stableSessionRef.current?.access_token?.trim()),
    }));
  }, []);

  useEffect(() => {
    setTransportRealtimeChannelProbe(() =>
      Boolean(statusRef.current.listChannel),
    );
    return () => setTransportRealtimeChannelProbe(() => false);
  }, []);

  useEffect(() => {
    return subscribeEnigmaAuthSingleton((event, sessionSnap) => {
      if (sessionSnap) {
        stableSessionRef.current = sessionSnap;
        setRestAccessToken(sessionSnap);
      } else if (event === "SIGNED_OUT") {
        stableSessionRef.current = null;
        setRestAccessToken(null);
      }

      const uid = sessionSnap?.user?.id ?? null;

      if (event === "INITIAL_SESSION") {
        if (uid) singletonSignedInUidRef.current = uid;
        /* No list/realtime reschedule — INITIAL_SESSION mirrors uid only */
        return;
      }
      if (event === "TOKEN_REFRESHED") {
        if (uid) singletonSignedInUidRef.current = uid;
        /* No reconcile storm on token churn */
        return;
      }
      if (event === "SIGNED_OUT") {
        singletonSignedInUidRef.current = null;
        return;
      }
      if (event === "SIGNED_IN") {
        const prevUid = singletonSignedInUidRef.current;
        if (prevUid !== null && prevUid === uid && uid !== null) {
          /* Duplicate SIGNED_IN same user — Realtime gated by subscribed list channel */
          return;
        }
        singletonSignedInUidRef.current = uid ?? null;
      }
    });
  }, []);

  useEffect(() => {
    authLifecycleReadyRef.current = authLifecycleReady;
  }, [authLifecycleReady]);

  useEffect(() => {
    realtimeDisabledRef.current = realtimeDisabledState;
  }, [realtimeDisabledState]);

  useEffect(() => {
    realtimeModeRef.current = realtimeMode;
  }, [realtimeMode]);

  useEffect(() => {
    authStabilizedRef.current = authStabilizedState;
    authReadyRef.current = authStabilizedState;
  }, [authStabilizedState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authStabilizeTimerRef.current) {
      window.clearTimeout(authStabilizeTimerRef.current);
      authStabilizeTimerRef.current = null;
    }
    if (!userId) {
      authStabilizedRef.current = true;
      authReadyRef.current = true;
      setAuthStabilizedState(true);
      return;
    }
    if (!authLifecycleReady) {
      authStabilizedRef.current = false;
      authReadyRef.current = false;
      setAuthStabilizedState(false);
      return;
    }
    authStabilizedRef.current = false;
    authReadyRef.current = false;
    setAuthStabilizedState(false);
    authStabilizeTimerRef.current = window.setTimeout(() => {
      authStabilizeTimerRef.current = null;
      authStabilizedRef.current = true;
      authReadyRef.current = true;
      setAuthStabilizedState(true);
      chatDebugLog("auth:stabilized", { userId });
    }, AUTH_STABILIZE_DELAY_MS);
    return () => {
      if (authStabilizeTimerRef.current) {
        window.clearTimeout(authStabilizeTimerRef.current);
        authStabilizeTimerRef.current = null;
      }
    };
  }, [authLifecycleReady, userId]);

  const busRef = useRef<ReturnType<typeof createCrossTabBus> | null>(null);
  const presenceInFlightRef = useRef(false);
  const presenceIntervalRef = useRef<number | null>(null);
  const chatListAuthRetryRef = useRef(0);
  /** Сбрасывается при смене userId; без спама в консоль по одной теме. */
  const logOnceRef = useRef({
    presenceNoToken: false,
    presenceOnlineUpsert: false,
    listNoToken: false,
    markNoToken: false,
  });

  useEffect(() => {
    logOnceRef.current = {
      presenceNoToken: false,
      presenceOnlineUpsert: false,
      listNoToken: false,
      markNoToken: false,
    };
    chatListAuthRetryRef.current = 0;
    lastRestPresenceBundleAtRef.current = 0;
    realtimeListChannelReadyRef.current = false;
    realtimeListConnectionStateRef.current = "idle";
    realtimeListSubscribedForUserRef.current = null;
    realtimeBootstrapPathPrevUidRef.current = null;
    const gListCreate = globalThis as typeof globalThis & {
      __ENIGMA_LIST_CREATE_LAST__?: unknown;
    };
    delete gListCreate.__ENIGMA_LIST_CREATE_LAST__;
    pendingSilentRefreshAfterCurrentRef.current = false;
    reconcileDeferredReasonRef.current = null;
    setHydratedState(false);
    setRealtimeReadyState(false);
    maxRealtimeFailuresRef.current = 0;
    bootstrapCompletedRef.current = false;
    refreshInFlightRef.current = null;
    reconcileInFlightRef.current = null;
    realtimeDisabledRef.current = false;
    hasLoggedRealtimeDisabledRef.current = false;
    setRealtimeDisabledState(false);
    setRealtimeMode(userId ? "realtime" : "disabled");
  }, [userId]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const refreshChats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!authReadyRef.current && userId) {
        chatDebugLog("refreshChats:blocked:auth-not-stabilized", {
          silent: Boolean(opts?.silent),
          userId,
        });
        return;
      }
      if (refreshInFlightRef.current) {
        if (opts?.silent) pendingSilentRefreshAfterCurrentRef.current = true;
        chatDebugLog("refreshChats:join-inflight", {
          silent: Boolean(opts?.silent),
        });
        return refreshInFlightRef.current;
      }

      const sessionAccess = stableSessionRef.current?.access_token?.trim() ?? "";
      const restReady = Boolean(getRestAccessToken()?.trim());
      if (!sessionAccess || !restReady) {
        bumpEnigmaCounter("refreshChatsSkipNoTokenCount");
        return;
      }

      chatStormSource("refreshChats", {
        silent: Boolean(opts?.silent),
        userId: userId ?? null,
      });
      const run = (async () => {
      chatDebugLog("refreshChats:start", {
        silent: Boolean(opts?.silent),
        userId: userId ?? null,
      });
      if (!authLifecycleReadyRef.current) {
        chatDebugLog("refreshChats:blocked:auth-not-ready", {
          userId: userId ?? null,
        });
        if (!opts?.silent) setLoadingState(false);
        return;
      }
      if (!userId) {
        setRows([]);
        setError(null);
        setLoadingState(false);
        chatDebugLog("refreshChats:skip:no-user");
        return;
      }

      if (!opts?.silent) setLoadingState(true);
      setError(null);

      try {
        const accessToken = stableSessionRef.current?.access_token?.trim() ?? "";
        const restTokenReady = Boolean(getRestAccessToken()?.trim());
        if (!accessToken || !restTokenReady) {
          if (!logOnceRef.current.listNoToken) {
            logOnceRef.current.listNoToken = true;
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[list_my_chats] нет access_token, запрос пропущен (один раз за сессию)",
              );
            }
          }
          if (!opts?.silent) setLoadingState(false);
          bumpEnigmaCounter("refreshChatsSkipNoTokenCount");
          chatDebugLog("refreshChats:skip:no-token");
          return;
        }
        chatListAuthRetryRef.current = 0;

        const rest = getSupabaseRestWithSession();
        if (!rest) {
          console.error("[list_my_chats] Supabase URL/key не настроены");
          if (!opts?.silent) setLoadingState(false);
          return;
        }
        bumpEnigmaCounter("refreshChatsStartCount");
        if (reconcileInFlightRef.current) {
          reportEnigmaIllegalState("refreshStartedRpcWhileReconcileInflight", {
            userId: userId ?? null,
          });
        }
        const res = await rest.rpc("list_my_chats", {
          p_limit: 100,
        });
        if (res.error) {
          console.error("list_my_chats RPC error", {
            message: res.error.message,
            code: res.error.code,
            details: res.error.details,
            hint: res.error.hint,
          });
          setError(res.error.message || "Не удалось загрузить чаты");
          chatDebugLog("refreshChats:error", {
            message: res.error.message ?? null,
            code: res.error.code ?? null,
          });
          return;
        }

        if (res.data == null) {
          console.warn(
            "list_my_chats: data is null, keeping previous rows (no RLS/empty result edge case)",
          );
          return;
        }

        if (!Array.isArray(res.data)) {
          console.warn("list_my_chats: unexpected data type", typeof res.data);
          return;
        }

        const nextRows = res.data
          .map((row) =>
            normalizeChatRow(row as Record<string, unknown>, userId),
          )
          .filter((row) => isUuid(row.chat_id));

        const missingNameUserIds = Array.from(
          new Set(
            nextRows
              .filter(
                (row) =>
                  !row.is_group &&
                  !String(row.other_name ?? "").trim() &&
                  isUuid(String(row.other_user_id ?? "")),
              )
              .map((row) => String(row.other_user_id)),
          ),
        );

        let enrichedRows = nextRows;
        if (missingNameUserIds.length > 0) {
          const profileRes = await (rest.from("profiles") as any)
            .select("id,name")
            .in("id", missingNameUserIds);
          if (profileRes.error) {
            console.error("SUPABASE ERROR: profiles list for chats", profileRes.error);
          } else if (Array.isArray(profileRes.data)) {
            const namesById = new Map<string, string>();
            for (const profile of profileRes.data as Array<Record<string, unknown>>) {
              const id = String(profile.id ?? "").trim();
              if (!id) continue;
              const name = String(profile.name ?? "").trim();
              const resolved = name;
              if (resolved) {
                namesById.set(id, resolved);
              }
            }
            enrichedRows = nextRows.map((row) => {
              if (row.is_group || String(row.other_name ?? "").trim()) {
                return row;
              }
              const otherId = String(row.other_user_id ?? "").trim();
              if (!otherId) return row;
              const resolved = namesById.get(otherId);
              if (!resolved) return row;
              return { ...row, other_name: resolved };
            });
          }
        }

        const listingIdsNeedingImage = Array.from(
          new Set(
            enrichedRows
              .filter(
                (row) =>
                  isUuid(String(row.listing_id ?? "")) &&
                  !String(row.listing_image ?? "").trim(),
              )
              .map((row) => String(row.listing_id)),
          ),
        );

        let finalRows = enrichedRows;
        if (listingIdsNeedingImage.length > 0) {
          const imagesRes = await rest
            .from("images")
            .select("listing_id,url,sort_order")
            .in("listing_id", listingIdsNeedingImage)
            .order("sort_order", { ascending: true });
          if (imagesRes.error) {
            console.error("SUPABASE ERROR: listing images for chats", imagesRes.error);
          } else if (Array.isArray(imagesRes.data)) {
            const firstImageByListing = new Map<string, string>();
            for (const row of imagesRes.data as Array<Record<string, unknown>>) {
              const listingId = String(row.listing_id ?? "").trim();
              const url = String(row.url ?? "").trim();
              if (!listingId || !url || firstImageByListing.has(listingId)) continue;
              firstImageByListing.set(listingId, url);
            }
            finalRows = enrichedRows.map((row) => {
              if (String(row.listing_image ?? "").trim()) return row;
              const listingId = String(row.listing_id ?? "").trim();
              if (!listingId) return row;
              const listingImage = firstImageByListing.get(listingId);
              if (!listingImage) return row;
              return { ...row, listing_image: listingImage };
            });
          }
        }

        setRows((prev) => mergeServerRowsWithLocal(prev, finalRows));
        setHydratedState(true);
        chatDebugLog("refreshChats:done", {
          rows: finalRows.length,
          totalUnread: computeTotalUnread(finalRows),
          silent: Boolean(opts?.silent),
        });
      } catch (e) {
        console.error("list_my_chats unexpected", e);
        setError("Не удалось загрузить чаты");
        chatDebugLog("refreshChats:unexpected-error");
      } finally {
        if (!opts?.silent) setLoadingState(false);
        const deferredReconcile = reconcileDeferredReasonRef.current;
        reconcileDeferredReasonRef.current = null;
        if (deferredReconcile) {
          scheduleReconcileRef.current(deferredReconcile, 0);
        }
        if (pendingSilentRefreshAfterCurrentRef.current) {
          pendingSilentRefreshAfterCurrentRef.current = false;
          scheduleRefreshRef.current(0, { silent: true });
        }
      }
      })();

      refreshInFlightRef.current = run.finally(() => {
        refreshInFlightRef.current = null;
      });
      return refreshInFlightRef.current;
    },
    [userId],
  );

  const reconcileUnreadSnapshot = useCallback(
    async (reason: string) => {
      if (!authReadyRef.current && userId) {
        chatDebugLog("reconcile:blocked:auth-not-stabilized", { reason, userId });
        return;
      }
      if (refreshInFlightRef.current) {
        reconcileDeferredReasonRef.current = reason;
        chatDebugLog("reconcile:deferred:refresh-in-flight", { reason, userId: userId ?? null });
        return;
      }
      if (reconcileInFlightRef.current) {
        chatDebugLog("reconcile:join-inflight", { reason, userId: userId ?? null });
        return reconcileInFlightRef.current;
      }
      const reconcileToken = stableSessionRef.current?.access_token?.trim() ?? "";
      if (!reconcileToken || !getRestAccessToken()?.trim()) {
        return;
      }

      chatStormSource("reconcile", { reason, userId: userId ?? null });
      const run = (async () => {
      chatDebugLog("reconcile:start", { reason, userId: userId ?? null });
      if (!userId) return;
      try {
        const reconcileSession = stableSessionRef.current;
        const reconcileTokenInner = reconcileSession?.access_token?.trim() ?? "";
        if (!reconcileTokenInner || !getRestAccessToken()?.trim()) {
          return;
        }
        const rest = getSupabaseRestWithSession();
        if (!rest) return;
        bumpEnigmaCounter("reconcileStartCount");
        if (refreshInFlightRef.current) {
          reportEnigmaIllegalState("reconcileStartedRpcWhileRefreshInflight", {
            reason,
            userId,
          });
        }
        const res = await rest.rpc("list_my_chats", {
          p_limit: 200,
        });
        if (res.error || !Array.isArray(res.data)) {
          chatDebugLog("reconcile:error", {
            reason,
            message: res.error?.message ?? null,
            code: res.error?.code ?? null,
          });
          return;
        }
        const serverRows = res.data
          .map((row) => normalizeChatRow(row as Record<string, unknown>, userId))
          .filter((row) => isUuid(row.chat_id));
        const serverTotal = computeTotalUnread(serverRows);
        const localRows = rowsRef.current;
        const localTotal = computeTotalUnread(localRows);
        const serverByChat = new Map(serverRows.map((row) => [row.chat_id, row]));
        const localByChat = new Map(localRows.map((row) => [row.chat_id, row]));
        const hasNewChats = serverRows.some((row) => !localByChat.has(row.chat_id));
        let unreadDrift = localTotal !== serverTotal || hasNewChats;
        if (!unreadDrift) {
          for (const [chatId, serverRow] of serverByChat) {
            const localRow = localByChat.get(chatId);
            if (!localRow) {
              unreadDrift = true;
              break;
            }
            if (
              Math.max(0, Number(localRow.unread_count || 0)) !==
              Math.max(0, Number(serverRow.unread_count || 0))
            ) {
              unreadDrift = true;
              break;
            }
          }
        }

        if (!unreadDrift) {
          chatDebugLog("reconcile:no-drift", {
            reason,
            totalUnread: serverTotal,
            chats: serverRows.length,
          });
          return;
        }

        chatDebugLog("reconcile:drift-detected", {
          reason,
          localTotal,
          serverTotal,
          localChats: localRows.length,
          serverChats: serverRows.length,
        });

        setRows((prev) => {
          const serverMap = new Map(serverRows.map((row) => [row.chat_id, row]));
          const merged = prev.map((row) => {
            const serverRow = serverMap.get(row.chat_id);
            if (!serverRow) return row;
            serverMap.delete(row.chat_id);
            return {
              ...row,
              unread_count: Math.max(0, Number(serverRow.unread_count || 0)),
              last_message_id: serverRow.last_message_id ?? row.last_message_id,
              last_message_text: serverRow.last_message_text ?? row.last_message_text,
              last_message_sender_id:
                serverRow.last_message_sender_id ?? row.last_message_sender_id,
              last_message_created_at:
                serverRow.last_message_created_at ?? row.last_message_created_at,
              last_message_at: serverRow.last_message_at ?? row.last_message_at,
              last_message_deleted:
                serverRow.last_message_deleted ?? row.last_message_deleted,
              last_message_image_url:
                serverRow.last_message_image_url ?? row.last_message_image_url,
              last_message_voice_url:
                serverRow.last_message_voice_url ?? row.last_message_voice_url,
            };
          });
          if (serverMap.size > 0) {
            merged.push(...Array.from(serverMap.values()));
          }
          return sortByLastMessageDesc(merged);
        });
      } catch (error) {
        chatDebugLog("reconcile:unexpected-error", { reason });
        console.error("chat unread reconcile unexpected", error);
      }
      })();
      reconcileInFlightRef.current = run.finally(() => {
        reconcileInFlightRef.current = null;
      });
      return reconcileInFlightRef.current;
    },
    [userId],
  );

  const scheduleRefresh = useCallback(
    (delayMs = 120, opts?: { silent?: boolean }) => {
      if (typeof window === "undefined") return;
      const sessionOk = Boolean(stableSessionRef.current?.access_token?.trim());
      const restOk = Boolean(getRestAccessToken()?.trim());
      if (!sessionOk || !restOk) {
        return;
      }

      if (statusRef.current.refreshTimer) {
        window.clearTimeout(statusRef.current.refreshTimer);
      }

      statusRef.current.refreshTimer = window.setTimeout(() => {
        statusRef.current.refreshTimer = null;
        void refreshChatsRef.current?.(opts);
      }, delayMs);
    },
    [],
  );

  const scheduleReconcile = useCallback(
    (reason: string, delayMs = UNREAD_RECONCILE_DEBOUNCE_MS) => {
      if (typeof window === "undefined") return;
      const sessionOk = Boolean(stableSessionRef.current?.access_token?.trim());
      const restOk = Boolean(getRestAccessToken()?.trim());
      if (!sessionOk || !restOk) {
        return;
      }
      const now = Date.now();
      const sinceLast = now - lastReconcileScheduledAtRef.current;
      const effectiveDelay = Math.max(
        UNREAD_RECONCILE_DEBOUNCE_MS,
        delayMs,
        sinceLast < UNREAD_RECONCILE_DEBOUNCE_MS
          ? UNREAD_RECONCILE_DEBOUNCE_MS - sinceLast
          : 0,
      );
      if (statusRef.current.reconcileTimer) {
        window.clearTimeout(statusRef.current.reconcileTimer);
      }
      statusRef.current.reconcileTimer = window.setTimeout(() => {
        statusRef.current.reconcileTimer = null;
        lastReconcileScheduledAtRef.current = Date.now();
        void reconcileUnreadSnapshotRef.current?.(reason);
      }, effectiveDelay);
    },
    [],
  );

  const rememberRealtimeEvent = useCallback((key: string): boolean => {
    const now = Date.now();
    const map = processedRealtimeEventsRef.current;
    for (const [k, ts] of map) {
      if (now - ts > REALTIME_EVENT_TTL_MS) map.delete(k);
    }
    const prev = map.get(key);
    if (prev && now - prev <= REALTIME_EVENT_TTL_MS) return true;
    map.set(key, now);
    return false;
  }, []);

  const broadcast = useCallback((event: CrossTabEvent) => {
    busRef.current?.post(event);
  }, []);

  const scheduleForegroundSilentListRefresh = useCallback(
    (reason: string) => {
      if (!authReadyRef.current && userId) {
        chatDebugLog("chat:foreground-refresh:blocked:auth-not-stabilized", {
          reason,
          userId,
        });
        return;
      }
      const sessionOk = Boolean(stableSessionRef.current?.access_token?.trim());
      const restOk = Boolean(getRestAccessToken()?.trim());
      if (!sessionOk || !restOk) {
        return;
      }
      const now = Date.now();
      if (
        now - lastForegroundSilentRefreshAtRef.current <
        FOREGROUND_SILENT_REFRESH_DEBOUNCE_MS
      ) {
        chatDebugLog("chat:foreground-refresh:debounced", { reason });
        return;
      }
      lastForegroundSilentRefreshAtRef.current = now;
      chatDebugLog("chat:foreground-refresh", { reason, userId: userId ?? null });
      scheduleRefreshRef.current(400, { silent: true });
    },
    [userId],
  );

  refreshChatsRef.current = refreshChats;
  reconcileUnreadSnapshotRef.current = reconcileUnreadSnapshot;
  scheduleRefreshRef.current = scheduleRefresh;
  scheduleReconcileRef.current = scheduleReconcile;

  const rememberRealtimeEventRef = useRef(rememberRealtimeEvent);
  const broadcastRef = useRef(broadcast);
  rememberRealtimeEventRef.current = rememberRealtimeEvent;
  broadcastRef.current = broadcast;

  const upsertPresence = useCallback(async () => {
    if (typeof window !== "undefined" && isAuthCircuitOpen()) return;
    if (!stableSessionRef.current?.access_token?.trim()) {
      return;
    }
    const stormNow = Date.now();
    if (stormNow - lastPresenceStormLogAtRef.current >= PRESENCE_STORM_LOG_MIN_INTERVAL_MS) {
      chatStormSource("presence", { userId: userId ?? null });
      lastPresenceStormLogAtRef.current = stormNow;
    }
    if (!authReadyRef.current && userId) {
      chatDebugLog("presence:blocked:auth-not-stabilized", { userId });
      return;
    }
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId || !isUuid(normalizedUserId) || typeof document === "undefined") {
      return;
    }
    if (presenceInFlightRef.current) return;

    presenceInFlightRef.current = true;
    try {
      const nowIso = new Date().toISOString();

      const listCh = statusRef.current.listChannel;
      if (
        realtimeListChannelReadyRef.current &&
        listCh &&
        stableSessionRef.current?.access_token?.trim()
      ) {
        try {
          await listCh.track({
            online_at: nowIso,
            user_id: normalizedUserId,
          });
        } catch {
          /* noop — never cascade recover/auth */
        }
      }

      const bundleNow = Date.now();
      if (
        bundleNow - lastRestPresenceBundleAtRef.current <
        REST_PRESENCE_BUNDLE_INTERVAL_MS ||
        !getRestAccessToken()?.trim()
      ) {
        return;
      }
      lastRestPresenceBundleAtRef.current = bundleNow;

      const presenceSession = stableSessionRef.current;
      if (!presenceSession?.access_token) {
        if (!logOnceRef.current.presenceNoToken) {
          logOnceRef.current.presenceNoToken = true;
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[online_users] нет access_token, запрос пропущен (один раз за сессию)",
            );
          }
        }
        return;
      }

      const rest = getSupabaseRestWithSession();
      if (!rest) return;

      try {
        const { error: upsertError } = await (rest.from("online_users") as any).upsert(
          [
            {
              user_id: normalizedUserId,
              updated_at: nowIso,
            },
          ],
          { onConflict: "user_id" },
        );
        if (upsertError) {
          const status = Number((upsertError as { status?: unknown })?.status ?? 0);
          // Silent fail on bad query shape to avoid cascading React crash screen.
          if (status === 400) return;
          if (!logOnceRef.current.presenceOnlineUpsert) {
            logOnceRef.current.presenceOnlineUpsert = true;
            console.error("online_users upsert", upsertError);
          }
          return;
        }
      } catch (upsertCrash) {
        console.error("online_users upsert unexpected", upsertCrash);
        return;
      }

      const pushSeenRes = await withPostgrestBackoff({
        checkSession: () => Boolean(stableSessionRef.current?.access_token?.trim()),
        checkHealth: isSupabaseReachable,
        logLabel: "push_tokens last_seen",
        run: (signal) =>
          rest
            .from("push_tokens")
            .update({ last_seen_at: nowIso })
            .eq("user_id", normalizedUserId)
            .abortSignal(signal),
      });
      if (!("result" in pushSeenRes) || pushSeenRes.result?.error) {
        console.error("SUPABASE ERROR: push_tokens last_seen", pushSeenRes);
        return;
      }
    } catch (e) {
      console.error("presence heartbeat", e);
    } finally {
      presenceInFlightRef.current = false;
    }
  }, [userId]);

  const setActiveChatId = useCallback(
    (chatId: string | null) => {
      const normalized = chatId && isUuid(chatId) ? chatId : null;
      statusRef.current.activeChatId = normalized;
      setActiveChatIdState(normalized);
      broadcast({ type: "chat-active", chatId: normalized });
      void upsertPresence();
    },
    [broadcast, upsertPresence],
  );

  const markChatRead = useCallback(
    async (chatId: string, upToMessageId?: string | null) => {
      chatStormSource("markRead", { chatId, userId: userId ?? null });
      if (!authReadyRef.current && userId) {
        chatDebugLog("markRead:blocked:auth-not-stabilized", { chatId, userId });
        return;
      }
      if (!userId || !isUuid(chatId)) return;

      try {
        const markSession = stableSessionRef.current;
        if (!markSession?.access_token) {
          if (!logOnceRef.current.markNoToken) {
            logOnceRef.current.markNoToken = true;
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[mark_chat_read] нет access_token, RPC пропущен (один раз за сессию)",
              );
            }
          }
          return;
        }
        const rest = getSupabaseRestWithSession();
        if (!rest) {
          console.error("[mark_chat_read] Supabase URL/key не настроены");
          return;
        }
        const rpcArgs: { p_chat_id: string; p_up_to_message_id?: string } = {
          p_chat_id: chatId,
        };
        if (upToMessageId && isUuid(upToMessageId)) {
          rpcArgs.p_up_to_message_id = upToMessageId;
        }

        const res = await rest.rpc("mark_chat_read", rpcArgs);

        if (res.error) {
          console.error("mark_chat_read RPC error", {
            message: res.error.message,
            code: res.error.code,
            details: res.error.details,
            hint: res.error.hint,
          });
          setError(
            res.error.message || "Не удалось отметить чат как прочитанный",
          );
          return;
        }

        await refreshChatsRef.current?.({ silent: true });
        broadcast({ type: "chat-read", chatId });
      } catch (e) {
        console.error("mark_chat_read unexpected", e);
        setError("Не удалось отметить чат как прочитанный");
      }
    },
    [broadcast, userId],
  );

  const getChatRow = useCallback(
    (chatId: string) => rows.find((row) => row.chat_id === chatId) ?? null,
    [rows],
  );

  useEffect(() => {
    busRef.current = createCrossTabBus();
    const bus = busRef.current;

    const unsubscribe = bus.subscribe((event) => {
      if (event.type === "chat-refresh") {
        scheduleRefreshRef.current(80, { silent: true });
        return;
      }
      if (event.type === "chat-read") {
        scheduleRefreshRef.current(80, { silent: true });
        return;
      }
      if (event.type === "chat-active") {
        if (event.chatId === statusRef.current.activeChatId) return;
        scheduleRefreshRef.current(120, { silent: true });
      }
    });

    return () => {
      unsubscribe();
      bus.close();
      busRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && isAuthCircuitOpen()) return;
    if (loading || !authResolved) return;
    if (!authLifecycleReady) {
      chatDebugLog("realtime:init:blocked:auth-not-ready", { userId: userId ?? null });
      return;
    }

    if (!userId) {
      if (typeof window !== "undefined" && statusRef.current.reconcileTimer) {
        window.clearTimeout(statusRef.current.reconcileTimer);
        statusRef.current.reconcileTimer = null;
      }
      setRows([]);
      setError(null);
      setLoadingState(false);
      setHydratedState(true);
      setRealtimeReadyState(false);
      setRealtimeMode("disabled");
      setActiveChatIdState(null);
      statusRef.current.activeChatId = null;
      return;
    }

    if (!authStabilizedState) {
      chatDebugLog("realtime:init:blocked:auth-not-stabilized", { userId });
      return;
    }
    if (bootstrapCompletedRef.current) {
      return;
    }
    const access = stableSessionRef.current?.access_token?.trim() ?? "";
    if (!access || !getRestAccessToken()?.trim()) {
      return;
    }
    bootstrapCompletedRef.current = true;
    void refreshChatsRef.current?.();
    scheduleReconcileRef.current("initial-launch", 220);
  }, [
    authLifecycleReady,
    authResolved,
    authStabilizedState,
    loading,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;
    let waitTimer: number | null = null;
    let waitAttempts = 0;

    const clearWait = () => {
      if (typeof window !== "undefined" && waitTimer !== null) {
        window.clearTimeout(waitTimer);
        waitTimer = null;
      }
    };

    const clearReconnect = () => {
      if (typeof window !== "undefined" && statusRef.current.reconnectTimer) {
        window.clearTimeout(statusRef.current.reconnectTimer);
        statusRef.current.reconnectTimer = null;
      }
    };

    const clearChannel = () => {
      if (statusRef.current.listChannel) {
        console.warn("[LIST_CHANNEL_CLEANUP]", { userId: userId ?? null });
      }
      realtimeListConnectionStateRef.current = "idle";
      realtimeListSubscribedForUserRef.current = null;
      realtimeListChannelReadyRef.current = false;
      if (statusRef.current.listChannel) {
        void supabase.removeChannel(statusRef.current.listChannel);
        statusRef.current.listChannel = null;
      }
    };

    const tearDownListRealtime = () => {
      clearWait();
      realtimeConnectOwnerRef.current += 1;
      clearReconnect();
      clearChannel();
      setRealtimeReadyState(false);
    };

    if (!userId) {
      tearDownListRealtime();
      return;
    }

    if (typeof window !== "undefined" && isAuthCircuitOpen()) {
      tearDownListRealtime();
      return;
    }

    const connectOwner = ++realtimeConnectOwnerRef.current;
    probeChatRealtimeEffectStrictDuplicate(userId);

    const tryBootstrap = () => {
      clearWait();
      if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;

      const tokenReady = Boolean(stableSessionRef.current?.access_token?.trim());
      const readyGate =
        authLifecycleReadyRef.current && authStabilizedRef.current && tokenReady;

      if (!readyGate) {
        waitAttempts += 1;
        if (waitAttempts > 120) {
          chatDebugLog("realtime:subscribe:gave-up-wait", {
            userId,
            waitAttempts,
          });
          return;
        }
        waitTimer = window.setTimeout(tryBootstrap, 100);
        return;
      }

      const nextUidStr = String(userId ?? "").trim();
      if (
        realtimeBootstrapPathPrevUidRef.current === nextUidStr &&
        realtimeListConnectionStateRef.current === "subscribed" &&
        statusRef.current.listChannel &&
        realtimeListSubscribedForUserRef.current === nextUidStr
      ) {
        /* Same-user auth churn path: list channel already JOINED */
        return;
      }
      realtimeBootstrapPathPrevUidRef.current = nextUidStr;

      if (realtimeDisabledRef.current) {
        if (!hasLoggedRealtimeDisabledRef.current) {
          hasLoggedRealtimeDisabledRef.current = true;
          chatRealtimeLog("warn", "disabled", {
            reason: "guard:already-disabled",
            userId,
            failures: maxRealtimeFailuresRef.current,
            mode: realtimeModeRef.current,
          });
        }
        setRealtimeReadyState(false);
        if (realtimeModeRef.current !== "polling") {
          setRealtimeMode("polling");
        }
        return;
      }

      connect();
    };

    const payloadContainsRejectedSubscription = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return false;
      const p = payload as Record<string, unknown>;
      const text = JSON.stringify(
        {
          message: p.message ?? null,
          reason: p.reason ?? null,
          details: p.details ?? null,
          status: p.status ?? null,
        },
        null,
        2,
      ).toLowerCase();
      return text.includes("unable to subscribe to changes with given parameters");
    };

    const scheduleRetry = (reason: string) => {
      if (cancelled || realtimeDisabledRef.current || typeof window === "undefined") return;
      chatStormSource("reconnect", {
        reason,
        mode: "schedule-retry",
        userId,
      });
      clearReconnect();
      const failureIndex = Math.max(0, maxRealtimeFailuresRef.current - 1);
      const delayMs =
        REALTIME_RETRY_DELAYS_MS[
          Math.min(failureIndex, REALTIME_RETRY_DELAYS_MS.length - 1)
        ];
      chatRealtimeLog("warn", "retry", {
        reason,
        userId,
        failures: maxRealtimeFailuresRef.current,
        delayMs,
      });
      statusRef.current.reconnectTimer = window.setTimeout(() => {
        statusRef.current.reconnectTimer = null;
        if (!cancelled) {
          connect({ force: true });
        }
      }, delayMs);
    };

    const disableRealtime = (reason: string, payload?: unknown) => {
      if (realtimeDisabledRef.current) return;
      clearReconnect();
      clearChannel();
      realtimeDisabledRef.current = true;
      setRealtimeDisabledState(true);
      setRealtimeReadyState(false);
      setRealtimeMode("polling");
      if (!hasLoggedRealtimeDisabledRef.current) {
        hasLoggedRealtimeDisabledRef.current = true;
        chatRealtimeLog("error", "disabled", {
          reason,
          userId,
          failures: maxRealtimeFailuresRef.current,
          payload: payload ?? null,
          mode: "polling",
        });
      }
    };

    const registerFailure = (reason: string, payload?: unknown) => {
      if (realtimeDisabledRef.current) return;
      maxRealtimeFailuresRef.current += 1;
      setRealtimeReadyState(false);
      clearChannel();
      chatRealtimeLog("error", "error", {
        reason,
        userId,
        failures: maxRealtimeFailuresRef.current,
        payload: payload ?? null,
      });
      if (
        payloadContainsRejectedSubscription(payload) ||
        maxRealtimeFailuresRef.current > REALTIME_FAILURE_LIMIT
      ) {
        disableRealtime(reason, payload);
        return;
      }
      scheduleRetry(reason);
    };

    const connect = (opts?: { force?: boolean }) => {
      if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
      if (realtimeDisabledRef.current) return;

      const force = Boolean(opts?.force);
      if (
        !force &&
        realtimeListConnectionStateRef.current === "subscribed" &&
        statusRef.current.listChannel &&
        realtimeListSubscribedForUserRef.current === userId
      ) {
        bumpEnigmaCounter("reconnectSuppressedSubscribedCount");
        return;
      }

      clearReconnect();

      const myGen = ++subscribeGenerationRef.current;
      realtimeListConnectionStateRef.current = "connecting";
      bumpEnigmaCounter("realtimeConnectAttemptCount");

      const GCTX = globalThis as typeof globalThis & {
        __ENIGMA_LIST_CREATE_LAST__?: { userId: string; t: number };
      };
      const nowCr = Date.now();
      const lcLast = GCTX.__ENIGMA_LIST_CREATE_LAST__;
      if (
        !force &&
        lcLast &&
        lcLast.userId === String(userId) &&
        nowCr - lcLast.t < 800
      ) {
        reportEnigmaIllegalState("rapid-list-channel-create-no-force", {
          userId,
          deltaMs: nowCr - lcLast.t,
        });
      }
      GCTX.__ENIGMA_LIST_CREATE_LAST__ = { userId: String(userId), t: nowCr };

      clearChannel();

      chatStormSource("realtime-subscribe", { userId });
      console.warn("[LIST_CHANNEL_CREATE]", { userId });
      setRealtimeMode("realtime");
      chatRealtimeLog("info", "subscribe", {
        userId,
        failures: maxRealtimeFailuresRef.current,
      });

      const channel = supabase
        .channel(`chat-list-${userId}`, {
          config: { presence: { key: userId } },
        } as Parameters<typeof supabase.channel>[1])
        .on(
          "system" as any,
          { event: "error" } as any,
          (payload: unknown) => {
            if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
            if (myGen !== subscribeGenerationRef.current) return;
            const st =
              payload && typeof payload === "object"
                ? String((payload as { status?: unknown }).status ?? "")
                : "";
            if (st.toLowerCase() === "ok") return;
            registerFailure("system:error", payload);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
            if (myGen !== subscribeGenerationRef.current) return;
            const msg = payload.new as Record<string, unknown>;
            const messageId = String(msg.id ?? "").trim();
            const messageChatId = String(msg.chat_id ?? "").trim();
            if (!messageChatId) return;
            if (
              isUuid(messageId) &&
              rememberRealtimeEventRef.current(`insert:${messageId}`)
            )
              return;
            chatDebugLog("realtime:messages:insert", {
              chatId: messageChatId,
              messageId: isUuid(messageId) ? messageId : null,
              senderId: String(msg.sender_id ?? "") || null,
            });

            const messageText = String(msg.text ?? "");
            const messageCreatedAt = String(
              msg.created_at ?? new Date().toISOString(),
            );
            const messageSenderId = msg.sender_id
              ? String(msg.sender_id)
              : null;
            const messageImageUrl = msg.image_url
              ? String(msg.image_url)
              : null;
            const messageVoiceUrl = msg.voice_url
              ? String(msg.voice_url)
              : null;

            const fromMe =
              Boolean(userId) && String(msg.sender_id ?? "") === String(userId);

            const currentChatId = statusRef.current.activeChatId;
            const isOpenChat = isChatForegroundForId(messageChatId, currentChatId);

            setRows((prev) => {
              const exists = prev.find((c) => rowMatchesChatId(c, messageChatId));

              if (!exists) {
                void refreshChatsRef.current?.({ silent: true });
                return prev;
              }

              return prev
                .map((chat) =>
                  rowMatchesChatId(chat, messageChatId)
                    ? {
                        ...chat,
                        last_message_text: messageText,
                        last_message_at: messageCreatedAt,
                        last_message_created_at: messageCreatedAt,
                        last_message_sender_id: messageSenderId,
                        last_message_image_url: messageImageUrl,
                        last_message_voice_url: messageVoiceUrl,
                        // Instant badge UX: bump locally, then reconcile with server refresh.
                        unread_count:
                          !fromMe && !isOpenChat
                            ? Math.max(0, Number(chat.unread_count || 0)) + 1
                            : Math.max(0, Number(chat.unread_count || 0)),
                      }
                    : chat,
                )
                .sort((a, b) => {
                  const tb = new Date(listSortKey(b)).getTime();
                  const ta = new Date(listSortKey(a)).getTime();
                  if (tb !== ta) return tb - ta;
                  return b.chat_id.localeCompare(a.chat_id);
                });
            });
            // Always reconcile with server unread counters after insert.
            if (!fromMe) {
              scheduleRefreshRef.current(isOpenChat ? 90 : 220, { silent: true });
              chatDebugLog("realtime:messages:insert:reconcile", {
                chatId: messageChatId,
                isOpenChat,
              });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
            if (myGen !== subscribeGenerationRef.current) return;
            const msg = payload.new as Record<string, unknown>;
            const messageId = String(msg.id ?? "").trim();
            const messageChatId = String(msg.chat_id ?? "").trim();
            if (!messageChatId) return;
            if (
              isUuid(messageId) &&
              rememberRealtimeEventRef.current(`update:${messageId}`)
            )
              return;
            scheduleRefreshRef.current(70, { silent: true });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
            if (myGen !== subscribeGenerationRef.current) return;
            const oldMsg = payload.old as Record<string, unknown>;
            const messageId = String(oldMsg.id ?? "").trim();
            const messageChatId = String(oldMsg.chat_id ?? "").trim();
            if (!messageChatId) return;
            if (
              isUuid(messageId) &&
              rememberRealtimeEventRef.current(`delete:${messageId}`)
            )
              return;
            scheduleRefreshRef.current(70, { silent: true });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "chats",
            filter: `buyer_id=eq.${userId}`,
          },
          () => {
            if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
            if (myGen !== subscribeGenerationRef.current) return;
            scheduleRefreshRef.current(70, { silent: true });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "chats",
            filter: `seller_id=eq.${userId}`,
          },
          () => {
            if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
            if (myGen !== subscribeGenerationRef.current) return;
            scheduleRefreshRef.current(70, { silent: true });
          },
        );

      statusRef.current.listChannel = channel;

      channel.subscribe((status) => {
        if (cancelled || connectOwner !== realtimeConnectOwnerRef.current) return;
        if (myGen !== subscribeGenerationRef.current) return;
        if (realtimeDisabledRef.current) return;
        chatDebugLog("realtime:channel:status", {
          status,
          attempt: statusRef.current.reconnectAttempt,
        });
        if (!authLifecycleReadyRef.current) {
          chatDebugLog("realtime:channel:status:ignore-auth-not-ready", { status });
          setRealtimeReadyState(false);
          return;
        }
        if (status === "SUBSCRIBED") {
          console.warn("[LIST_CHANNEL_SUBSCRIBED]", { userId });
          bumpEnigmaCounter("realtimeSubscribedCount");
          maxRealtimeFailuresRef.current = 0;
          realtimeDisabledRef.current = false;
          setRealtimeDisabledState(false);
          setRealtimeReadyState(true);
          setRealtimeMode("realtime");
          realtimeListChannelReadyRef.current = true;
          realtimeListConnectionStateRef.current = "subscribed";
          realtimeListSubscribedForUserRef.current = userId;
          void channel
            .track({
              online_at: new Date().toISOString(),
              user_id: userId,
            })
            .catch(() => {
              /* noop */
            });
          scheduleRefreshRef.current(220, { silent: true });
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          registerFailure(`status:${status}`);
        }
      });
    };

    tryBootstrap();

    return () => {
      cancelled = true;
      clearWait();
      realtimeConnectOwnerRef.current += 1;
      clearReconnect();
      clearChannel();
      setRealtimeReadyState(false);
    };
  }, [userId]);

  useEffect(() => {
    if (
      !userId ||
      !authLifecycleReady ||
      !authStabilizedState ||
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      isAuthCircuitOpen()
    )
      return;

    const ping = () => {
      void upsertPresence();
    };

    ping();

    const onVisibility = () => {
      ping();
      if (document.visibilityState === "visible") {
        scheduleForegroundSilentListRefresh("visibility-visible");
      }
    };

    const onFocus = () => {
      ping();
      scheduleForegroundSilentListRefresh("window-focus");
    };

    const onOnline = () => {
      ping();
      scheduleForegroundSilentListRefresh("network-online");
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    presenceIntervalRef.current = window.setInterval(() => {
      ping();
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      if (presenceIntervalRef.current) {
        window.clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
    };
  }, [authLifecycleReady, authStabilizedState, scheduleForegroundSilentListRefresh, upsertPresence, userId]);

  useEffect(() => {
    if (
      !userId ||
      !authLifecycleReady ||
      !authStabilizedState ||
      typeof window === "undefined" ||
      isAuthCircuitOpen()
    )
      return;
    const pollMs =
      realtimeMode === "realtime" ? CHAT_REFRESH_POLL_MS : FALLBACK_POLL_MS;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void refreshChatsRef.current?.({ silent: true });
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [authLifecycleReady, authStabilizedState, realtimeMode, userId]);

  useEffect(() => {
    if (
      !userId ||
      !authLifecycleReady ||
      !authStabilizedState ||
      typeof window === "undefined" ||
      isAuthCircuitOpen()
    )
      return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      scheduleReconcileRef.current("periodic-drift-check", 0);
    }, UNREAD_RECONCILE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [authLifecycleReady, authStabilizedState, userId]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        if (authStabilizeTimerRef.current) {
          window.clearTimeout(authStabilizeTimerRef.current);
          authStabilizeTimerRef.current = null;
        }
        if (statusRef.current.refreshTimer) {
          window.clearTimeout(statusRef.current.refreshTimer);
          statusRef.current.refreshTimer = null;
        }
        if (statusRef.current.reconcileTimer) {
          window.clearTimeout(statusRef.current.reconcileTimer);
          statusRef.current.reconcileTimer = null;
        }
        if (statusRef.current.reconnectTimer) {
          window.clearTimeout(statusRef.current.reconnectTimer);
          statusRef.current.reconnectTimer = null;
        }
      }
      if (statusRef.current.listChannel) {
        void supabase.removeChannel(statusRef.current.listChannel);
        statusRef.current.listChannel = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    getEnigmaDebugCounters();
    const id = window.setInterval(() => {
      const c = getEnigmaDebugCounters();
      const conn = realtimeListConnectionStateRef.current;
      const payload = {
        counters: { ...c },
        subscribed: conn === "subscribed",
        reconnecting:
          conn === "connecting" || statusRef.current.reconnectTimer !== null,
        hasListChannel: Boolean(statusRef.current.listChannel),
        userId: userIdRef.current,
        authLifecycleReady: authLifecycleReadyRef.current,
        hasSessionToken: Boolean(stableSessionRef.current?.access_token?.trim()),
        hasRestToken: Boolean(getRestAccessToken()?.trim()),
        subscribeGeneration: subscribeGenerationRef.current,
        connectOwner: realtimeConnectOwnerRef.current,
      };
      console.warn(`[ENIGMA_RUNTIME_STATE] ${JSON.stringify(payload)}`);
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const totalUnread = useMemo(() => computeTotalUnread(rows), [rows]);
  useEffect(() => {
    chatDebugLog("totalUnread:changed", {
      totalUnread,
      rows: rows.length,
    });
  }, [rows.length, totalUnread]);
  const readyState = useMemo(() => {
    if (!userId) return true;
    if (!hydratedState) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
    return realtimeReadyState;
  }, [hydratedState, realtimeReadyState, userId]);

  const value = useMemo<ChatUnreadContextValue>(
    () => ({
      rows,
      totalUnread,
      loading: loadingState,
      ready: readyState,
      hydrated: hydratedState,
      realtimeReady: realtimeReadyState,
      error,
      activeChatId,
      refreshChats,
      markChatRead,
      setActiveChatId,
      getChatRow,
      setChats: setRows,
    }),
    [
      rows,
      totalUnread,
      loadingState,
      readyState,
      hydratedState,
      realtimeReadyState,
      error,
      activeChatId,
      refreshChats,
      markChatRead,
      setActiveChatId,
      getChatRow,
    ],
  );

  return (
    <ChatUnreadContext.Provider value={value}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    throw new Error("useChatUnread must be used within ChatUnreadProvider");
  }
  return ctx;
}
