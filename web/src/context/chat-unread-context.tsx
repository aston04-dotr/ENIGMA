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
import { getSessionGuarded, getSupabaseRestWithSession, supabase } from "@/lib/supabase";
import { isSupabaseReachable, withPostgrestBackoff } from "@/lib/supabaseHealth";
import { useAuth } from "@/context/auth-context";
import type { ChatListRow } from "@/lib/types";

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
const PRESENCE_HEARTBEAT_MS = 25_000;
const CHAT_REFRESH_POLL_MS = 8_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_ATTEMPTS = 6;
const REALTIME_EVENT_TTL_MS = 15_000;

function getErrorStatus(error: unknown): number {
  const status = Number(
    (error as { status?: unknown; code?: unknown } | null)?.status ??
      (error as { status?: unknown; code?: unknown } | null)?.code ??
      0,
  );
  return Number.isFinite(status) ? status : 0;
}

function isAuthFailure(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 400 || status === 401;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function sessionHasAccessToken(): Promise<boolean> {
  const { session } = await getSessionGuarded("chat-session-has-token", {
    allowRefresh: false,
  });
  return Boolean(session?.access_token?.trim());
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
  prev: ChatListRow[],
  next: ChatListRow[],
): ChatListRow[] {
  const prevByChat = new Map(prev.map((row) => [row.chat_id, row]));
  const merged = next.map((serverRow) => {
    const localRow = prevByChat.get(serverRow.chat_id);
    if (!localRow) return serverRow;

    const localTs = messageTimestampMs(localRow);
    const serverTs = messageTimestampMs(serverRow);
    const preferLocalPayload = localTs > serverTs;

    return {
      ...serverRow,
      last_message_text: preferLocalPayload
        ? localRow.last_message_text
        : serverRow.last_message_text,
      last_message_at: preferLocalPayload
        ? localRow.last_message_at
        : serverRow.last_message_at,
      last_message_created_at: preferLocalPayload
        ? localRow.last_message_created_at
        : serverRow.last_message_created_at,
      last_message_sender_id: preferLocalPayload
        ? localRow.last_message_sender_id
        : serverRow.last_message_sender_id,
      last_message_image_url: preferLocalPayload
        ? localRow.last_message_image_url
        : serverRow.last_message_image_url,
      last_message_voice_url: preferLocalPayload
        ? localRow.last_message_voice_url
        : serverRow.last_message_voice_url,
      // Server is source of truth for unread. Do not keep optimistic local value here.
      unread_count: Number.isFinite(Number(serverRow.unread_count))
        ? Math.max(0, Number(serverRow.unread_count || 0))
        : Math.max(0, Number(localRow.unread_count || 0)),
    };
  });

  return sortByLastMessageDesc(merged);
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

export function ChatUnreadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<ChatListRow[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [hydratedState, setHydratedState] = useState(false);
  const [realtimeReadyState, setRealtimeReadyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);
  const [reconnectSeq, setReconnectSeq] = useState(0);
  const processedRealtimeEventsRef = useRef<Map<string, number>>(new Map());

  const statusRef = useRef<{
    refreshTimer: number | null;
    reconnectTimer: number | null;
    reconnectAttempt: number;
    listChannel: ReturnType<typeof supabase.channel> | null;
    activeChatId: string | null;
  }>({
    refreshTimer: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    listChannel: null,
    activeChatId: null,
  });

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
    setHydratedState(false);
    setRealtimeReadyState(false);
  }, [userId]);

  const refreshChats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) {
        setRows([]);
        setError(null);
        setLoadingState(false);
        return;
      }

      if (!opts?.silent) setLoadingState(true);
      setError(null);

      try {
        const { session, error } = await getSessionGuarded("chat-refresh-chats", {
          allowRefresh: false,
        });
        if (error && isAuthFailure(error)) {
          await signOut();
          return;
        }
        const accessToken = session?.access_token ?? null;
        if (!accessToken) {
          if (!logOnceRef.current.listNoToken) {
            logOnceRef.current.listNoToken = true;
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[list_my_chats] нет access_token, запрос пропущен (один раз за сессию)",
              );
            }
          }
          if (
            typeof window !== "undefined" &&
            chatListAuthRetryRef.current < 5
          ) {
            chatListAuthRetryRef.current += 1;
            const retryDelay = 450 * chatListAuthRetryRef.current;
            window.setTimeout(() => {
              void refreshChats({ silent: true });
            }, retryDelay);
          }
          if (!opts?.silent) setLoadingState(false);
          return;
        }
        chatListAuthRetryRef.current = 0;

        const rest = getSupabaseRestWithSession();
        if (!rest) {
          console.error("[list_my_chats] Supabase URL/key не настроены");
          if (!opts?.silent) setLoadingState(false);
          return;
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

        const chatIds = finalRows
          .map((row) => String(row.chat_id ?? "").trim())
          .filter((id) => id.length > 0);
        if (chatIds.length > 0) {
          const messagesRes = await (rest.from("messages") as any)
            .select(
              "id,chat_id,sender_id,text,image_url,voice_url,created_at,deleted,read_at",
            )
            .in("chat_id", chatIds)
            .order("created_at", { ascending: false })
            .limit(2000);
          if (messagesRes.error) {
            console.error(
              "SUPABASE ERROR: messages snapshot for chat list",
              messagesRes.error,
            );
          } else if (Array.isArray(messagesRes.data)) {
            finalRows = hydrateRowsFromMessagesSnapshot(
              finalRows,
              messagesRes.data as MessageSnapshotRow[],
              userId,
            );
          }
        }

        setRows((prev) => mergeServerRowsWithLocal(prev, finalRows));
        setHydratedState(true);
      } catch (e) {
        console.error("list_my_chats unexpected", e);
        setError("Не удалось загрузить чаты");
      } finally {
        if (!opts?.silent) setLoadingState(false);
      }
    },
    [signOut, userId],
  );

  const scheduleRefresh = useCallback(
    (delayMs = 120, opts?: { silent?: boolean }) => {
      if (typeof window === "undefined") return;

      if (statusRef.current.refreshTimer) {
        window.clearTimeout(statusRef.current.refreshTimer);
      }

      statusRef.current.refreshTimer = window.setTimeout(() => {
        statusRef.current.refreshTimer = null;
        void refreshChats(opts);
      }, delayMs);
    },
    [refreshChats],
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

  const upsertPresence = useCallback(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId || !isUuid(normalizedUserId) || typeof document === "undefined") {
      return;
    }
    if (presenceInFlightRef.current) return;

    presenceInFlightRef.current = true;
    try {
      const nowIso = new Date().toISOString();

      const rest = getSupabaseRestWithSession();
      if (!rest) return;
      const { session: presenceSession } = await getSessionGuarded(
        "chat-presence-upsert",
        { allowRefresh: false },
      );
      if (!presenceSession?.access_token) {
        if (!logOnceRef.current.presenceNoToken) {
          logOnceRef.current.presenceNoToken = true;
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[online_users] нет access_token, heartbeat пропущен (один раз за сессию)",
            );
          }
        }
        return;
      }

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
        checkSession: sessionHasAccessToken,
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
      if (!userId || !isUuid(chatId)) return;

      try {
        const { session: markSession } = await getSessionGuarded("chat-mark-read", {
          allowRefresh: false,
        });
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

        await refreshChats({ silent: true });
        broadcast({ type: "chat-read", chatId });
      } catch (e) {
        console.error("mark_chat_read unexpected", e);
        setError("Не удалось отметить чат как прочитанный");
      }
    },
    [broadcast, refreshChats, userId],
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
        scheduleRefresh(80, { silent: true });
        return;
      }
      if (event.type === "chat-read") {
        scheduleRefresh(80, { silent: true });
        return;
      }
      if (event.type === "chat-active") {
        if (event.chatId === statusRef.current.activeChatId) return;
        scheduleRefresh(120, { silent: true });
      }
    });

    return () => {
      unsubscribe();
      bus.close();
      busRef.current = null;
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      setRows([]);
      setError(null);
      setLoadingState(false);
      setHydratedState(true);
      setRealtimeReadyState(false);
      setActiveChatIdState(null);
      statusRef.current.activeChatId = null;
      return;
    }

    void refreshChats();
  }, [loading, refreshChats, userId]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "TOKEN_REFRESH_REJECTED"
      ) {
        setReconnectSeq((n) => n + 1);
        scheduleRefresh(40, { silent: true });
      }
      if (event === "SIGNED_OUT") {
        setReconnectSeq((n) => n + 1);
        setRealtimeReadyState(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [scheduleRefresh]);

  useEffect(() => {
    if (!user || !userId) return;

    let cancelled = false;

    const clearReconnect = () => {
      if (typeof window !== "undefined" && statusRef.current.reconnectTimer) {
        window.clearTimeout(statusRef.current.reconnectTimer);
        statusRef.current.reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      clearReconnect();

      if (statusRef.current.listChannel) {
        void supabase.removeChannel(statusRef.current.listChannel);
        statusRef.current.listChannel = null;
      }

      const channel = supabase.channel("chat-list-" + userId).on(
        "system" as any,
        { event: "error" } as any,
        (payload: unknown) => {
          const status =
            payload && typeof payload === "object"
              ? String((payload as { status?: unknown }).status ?? "")
              : "";
          if (status.toLowerCase() === "ok") return;
          console.error("chat-list realtime system error", payload);
        },
      ).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Record<string, unknown>;
          const messageId = String(msg.id ?? "").trim();
          const messageChatId = String(msg.chat_id ?? "").trim();
          if (!messageChatId) return;
          if (isUuid(messageId) && rememberRealtimeEvent(`insert:${messageId}`)) return;

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
          const routeChatId =
            typeof window !== "undefined"
              ? String(window.location.pathname || "").match(
                  /^\/chat\/([0-9a-f-]{36})$/i,
                )?.[1] ?? null
              : null;
          const isOpenChat =
            Boolean(currentChatId) &&
            messageChatId === currentChatId &&
            Boolean(routeChatId) &&
            routeChatId === messageChatId &&
            (typeof document === "undefined" ||
              (document.visibilityState === "visible" && document.hasFocus()));

          setRows((prev) => {
            const exists = prev.find((c) => rowMatchesChatId(c, messageChatId));

            if (!exists) {
              void refreshChats({ silent: true });
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
                      // Keep server as source of truth for unread counters.
                      unread_count: Math.max(0, Number(chat.unread_count || 0)),
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
            scheduleRefresh(isOpenChat ? 90 : 220, { silent: true });
          }
        },
      ).on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Record<string, unknown>;
          const messageId = String(msg.id ?? "").trim();
          const messageChatId = String(msg.chat_id ?? "").trim();
          if (!messageChatId) return;
          if (isUuid(messageId) && rememberRealtimeEvent(`update:${messageId}`)) return;
          scheduleRefresh(70, { silent: true });
        },
      ).on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const oldMsg = payload.old as Record<string, unknown>;
          const messageId = String(oldMsg.id ?? "").trim();
          const messageChatId = String(oldMsg.chat_id ?? "").trim();
          if (!messageChatId) return;
          if (isUuid(messageId) && rememberRealtimeEvent(`delete:${messageId}`)) return;
          scheduleRefresh(70, { silent: true });
        },
      ).on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_members",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          scheduleRefresh(70, { silent: true });
        },
      );

      statusRef.current.listChannel = channel;

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          statusRef.current.reconnectAttempt = 0;
          setRealtimeReadyState(true);
          scheduleRefresh(50, { silent: true });
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeReadyState(false);
          const attempt = Math.min(
            statusRef.current.reconnectAttempt + 1,
            RECONNECT_MAX_ATTEMPTS,
          );
          statusRef.current.reconnectAttempt = attempt;

          clearReconnect();
          if (typeof window !== "undefined") {
            statusRef.current.reconnectTimer = window.setTimeout(
              () => {
                if (!cancelled) connect();
              },
              RECONNECT_BASE_MS * 2 ** (attempt - 1),
            );
          }
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      if (statusRef.current.listChannel) {
        void supabase.removeChannel(statusRef.current.listChannel);
        statusRef.current.listChannel = null;
      }
      setRealtimeReadyState(false);
    };
  }, [reconnectSeq, rememberRealtimeEvent, scheduleRefresh, user, userId]);

  useEffect(() => {
    if (
      !userId ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    )
      return;

    const ping = () => {
      void upsertPresence();
    };

    ping();

    const onVisibility = () => {
      ping();
      if (document.visibilityState === "visible") {
        scheduleRefresh(80, { silent: true });
      }
    };

    const onFocus = () => {
      ping();
      scheduleRefresh(80, { silent: true });
    };

    const onOnline = () => {
      ping();
      scheduleRefresh(80, { silent: true });
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
  }, [scheduleRefresh, upsertPresence, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void refreshChats({ silent: true });
    }, CHAT_REFRESH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshChats, userId]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        if (statusRef.current.refreshTimer) {
          window.clearTimeout(statusRef.current.refreshTimer);
          statusRef.current.refreshTimer = null;
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

  const totalUnread = useMemo(() => computeTotalUnread(rows), [rows]);
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
