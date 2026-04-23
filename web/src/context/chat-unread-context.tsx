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
import { supabase } from "@/lib/supabase";
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
  error: string | null;
  activeChatId: string | null;
  refreshChats: (opts?: { silent?: boolean }) => Promise<void>;
  markChatRead: (
    chatId: string,
    upToMessageId?: string | null,
  ) => Promise<void>;
  setActiveChatId: (chatId: string | null) => void;
  getChatRow: (chatId: string) => ChatListRow | null;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

const CHANNEL_NAME = "enigma-chat-sync";
const STORAGE_KEY = "enigma:chat-sync";
const PRESENCE_HEARTBEAT_MS = 25_000;
const PRESENCE_STALE_MS = 60_000;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeChatRow(raw: Record<string, unknown>): ChatListRow {
  return {
    chat_id: String(raw.chat_id ?? ""),
    listing_id: raw.listing_id ? String(raw.listing_id) : null,
    is_group: Boolean(raw.is_group),
    title: raw.title ? String(raw.title) : null,
    other_user_id: raw.other_user_id ? String(raw.other_user_id) : null,
    other_name: raw.other_name ? String(raw.other_name) : null,
    other_avatar: raw.other_avatar ? String(raw.other_avatar) : null,
    other_public_id: raw.other_public_id ? String(raw.other_public_id) : null,
    last_message_id: raw.last_message_id ? String(raw.last_message_id) : null,
    last_message_text: raw.last_message_text
      ? String(raw.last_message_text)
      : null,
    last_message_sender_id: raw.last_message_sender_id
      ? String(raw.last_message_sender_id)
      : null,
    last_message_created_at: raw.last_message_created_at
      ? String(raw.last_message_created_at)
      : null,
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
    last_message_at: raw.last_message_at ? String(raw.last_message_at) : null,
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
        /* noop */
      }
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...event, nonce: Date.now() + Math.random() }),
        );
      } catch {
        /* noop */
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
          /* noop */
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

export function ChatUnreadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, loading } = useAuth();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<ChatListRow[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);

  const statusRef = useRef<{
    refreshTimer: number | null;
    reconnectTimer: number | null;
    reconnectAttempt: number;
    unreadChannel: ReturnType<typeof supabase.channel> | null;
    activeChatId: string | null;
    destroyed: boolean;
  }>({
    refreshTimer: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    unreadChannel: null,
    activeChatId: null,
    destroyed: false,
  });

  const busRef = useRef<ReturnType<typeof createCrossTabBus> | null>(null);
  const presenceInFlightRef = useRef(false);
  const presenceIntervalRef = useRef<number | null>(null);

  const refreshChats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) {
        setRows([]);
        setError(null);
        setLoadingState(false);
        return;
      }

      if (!opts?.silent) {
        setLoadingState(true);
      }
      setError(null);

      try {
        const res = await supabase.rpc("list_my_chats", {
          p_user: userId,
        });

        if (res.error) {
          console.error("list_my_chats", res.error);
          setError(res.error.message || "Не удалось загрузить чаты");
          return;
        }

        const nextRows = Array.isArray(res.data)
          ? res.data
              .map((row) => normalizeChatRow(row as Record<string, unknown>))
              .filter((row) => isUuid(row.chat_id))
          : [];

        setRows(nextRows);
      } catch (e) {
        console.error("list_my_chats unexpected", e);
        setError("Не удалось загрузить чаты");
      } finally {
        if (!opts?.silent) {
          setLoadingState(false);
        }
      }
    },
    [userId],
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

  const broadcast = useCallback((event: CrossTabEvent) => {
    busRef.current?.post(event);
  }, []);

  const upsertPresence = useCallback(async () => {
    if (!userId || typeof document === "undefined") return;
    if (presenceInFlightRef.current) return;

    presenceInFlightRef.current = true;
    try {
      const visibilityState =
        document.visibilityState === "visible" ? "visible" : "hidden";
      const active = statusRef.current.activeChatId;

      const { error: upsertError } = await supabase.from("online_users").upsert(
        {
          user_id: userId,
          last_seen: new Date().toISOString(),
          visibility_state: visibilityState,
          active_chat_id: active,
        },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        console.error("online_users upsert", upsertError);
      }

      const nowIso = new Date().toISOString();
      const { error: touchPushError } = await supabase
        .from("push_tokens")
        .update({ last_seen_at: nowIso })
        .eq("user_id", userId)
        .eq("provider", "webpush");

      if (touchPushError) {
        console.warn("push_tokens touch", touchPushError);
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
        const res = await supabase.rpc("mark_chat_read", {
          p_chat_id: chatId,
          p_up_to_message_id:
            upToMessageId && isUuid(upToMessageId) ? upToMessageId : null,
        });

        if (res.error) {
          console.error("mark_chat_read", res.error);
          setError(
            res.error.message || "Не удалось отметить чат как прочитанный",
          );
          return;
        }

        setRows((prev) =>
          prev.map((row) =>
            row.chat_id === chatId
              ? {
                  ...row,
                  unread_count: 0,
                }
              : row,
          ),
        );

        broadcast({ type: "chat-read", chatId });
        scheduleRefresh(120, { silent: true });
      } catch (e) {
        console.error("mark_chat_read unexpected", e);
        setError("Не удалось отметить чат как прочитанный");
      }
    },
    [broadcast, scheduleRefresh, userId],
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
        setRows((prev) =>
          prev.map((row) =>
            row.chat_id === event.chatId ? { ...row, unread_count: 0 } : row,
          ),
        );
        scheduleRefresh(120, { silent: true });
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
      setActiveChatIdState(null);
      statusRef.current.activeChatId = null;
      return;
    }

    void refreshChats();
  }, [loading, refreshChats, userId]);

  useEffect(() => {
    if (!userId) return;

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

      if (statusRef.current.unreadChannel) {
        void supabase.removeChannel(statusRef.current.unreadChannel);
        statusRef.current.unreadChannel = null;
      }

      console.log("CHAT LIST SUBSCRIBE USER:", userId);

      const channel = supabase
        .channel(`chat-list-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            console.log("CHAT LIST NEW MESSAGE:", payload);

            const msg = payload.new as Record<string, unknown>;
            const messageChatId = String(msg.chat_id ?? "").trim();
            const messageText = String(msg.text ?? "").trim();
            const messageCreatedAt = String(
              msg.created_at ?? new Date().toISOString(),
            );

            if (!messageChatId) {
              scheduleRefresh(100, { silent: true });
              return;
            }

            setRows((prev) => {
              const existing = prev.find(
                (chat) => chat.chat_id === messageChatId,
              );

              if (!existing) {
                return prev;
              }

              return prev.map((chat) => {
                if (chat.chat_id !== messageChatId) return chat;

                return {
                  ...chat,
                  last_message_text: messageText || chat.last_message_text,
                  last_message_created_at: messageCreatedAt,
                  last_message_at: messageCreatedAt,
                  unread_count: Math.max(0, Number(chat.unread_count || 0)) + 1,
                };
              });
            });

            scheduleRefresh(100, { silent: true });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_members" },
          () => {
            scheduleRefresh(100, { silent: true });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chats" },
          () => {
            scheduleRefresh(100, { silent: true });
          },
        );

      statusRef.current.unreadChannel = channel;

      channel.subscribe((status) => {
        console.log("CHAT LIST STATUS:", status);

        if (status === "SUBSCRIBED") {
          statusRef.current.reconnectAttempt = 0;
          scheduleRefresh(60, { silent: true });
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          const attempt = Math.min(statusRef.current.reconnectAttempt + 1, 6);
          statusRef.current.reconnectAttempt = attempt;

          clearReconnect();
          if (typeof window !== "undefined") {
            statusRef.current.reconnectTimer = window.setTimeout(
              () => {
                if (!cancelled) connect();
              },
              500 * 2 ** (attempt - 1),
            );
          }
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      if (statusRef.current.unreadChannel) {
        void supabase.removeChannel(statusRef.current.unreadChannel);
        statusRef.current.unreadChannel = null;
      }
    };
  }, [scheduleRefresh, userId]);

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
      const stale =
        Date.now() - new Date(new Date().toISOString()).getTime() <
        PRESENCE_STALE_MS;
      void stale;
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
    statusRef.current.destroyed = false;
    return () => {
      statusRef.current.destroyed = true;
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
    };
  }, []);

  const totalUnread = useMemo(() => computeTotalUnread(rows), [rows]);

  const value = useMemo<ChatUnreadContextValue>(
    () => ({
      rows,
      totalUnread,
      loading: loadingState,
      error,
      activeChatId,
      refreshChats,
      markChatRead,
      setActiveChatId,
      getChatRow,
    }),
    [
      rows,
      totalUnread,
      loadingState,
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
