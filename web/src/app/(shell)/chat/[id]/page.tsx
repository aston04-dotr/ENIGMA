"use client";

import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MessageRow } from "@/lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RoomStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeMessage(raw: Record<string, unknown>): MessageRow {
  return {
    id: String(raw.id ?? ""),
    chat_id: String(raw.chat_id ?? ""),
    sender_id: String(raw.sender_id ?? ""),
    text: String(raw.text ?? ""),
    created_at: String(raw.created_at ?? new Date().toISOString()),
    image_url: raw.image_url ? String(raw.image_url) : null,
    voice_url: raw.voice_url ? String(raw.voice_url) : null,
    reply_to: raw.reply_to ? String(raw.reply_to) : null,
    edited_at: raw.edited_at ? String(raw.edited_at) : null,
    deleted: Boolean(raw.deleted),
    hidden_for_user_ids: Array.isArray(raw.hidden_for_user_ids)
      ? raw.hidden_for_user_ids.map((item) => String(item))
      : [],
    status: raw.status ? String(raw.status) : null,
    delivered_at: raw.delivered_at ? String(raw.delivered_at) : null,
    read_at: raw.read_at ? String(raw.read_at) : null,
  };
}

function sortMessages(messages: MessageRow[]): MessageRow[] {
  return [...messages].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function mergeIncomingInsert(
  prev: MessageRow[],
  row: MessageRow,
): MessageRow[] {
  if (prev.some((m) => m.id === row.id)) {
    return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
  }

  const optimisticIdx = prev.findIndex(
    (m) =>
      m.id.startsWith("temp-") &&
      m.sender_id === row.sender_id &&
      (m.text ?? "") === (row.text ?? "") &&
      (m.image_url ?? null) === (row.image_url ?? null) &&
      (m.voice_url ?? null) === (row.voice_url ?? null),
  );

  if (optimisticIdx >= 0) {
    const next = [...prev];
    next[optimisticIdx] = row;
    return sortMessages(next);
  }

  return sortMessages([...prev, row]);
}

function buildMessagePreview(m: MessageRow): string {
  if (m.deleted) return "Сообщение удалено";
  if (m.image_url) return "📷 Фото";
  if (m.voice_url) return "🎤 Голосовое";
  return m.text || "";
}

function MessageStatusTicks({
  mine,
  delivered_at,
  read_at,
}: {
  mine: boolean;
  delivered_at?: string | null;
  read_at?: string | null;
}) {
  if (!mine) return null;
  const hasRead = Boolean(read_at);
  const hasDel = Boolean(delivered_at);
  if (!hasDel) {
    return (
      <span className="text-[13px] leading-none text-white/75" aria-hidden>
        ✓
      </span>
    );
  }
  if (!hasRead) {
    return (
      <span
        className="text-[13px] leading-none tracking-[-0.15em] text-white/65"
        aria-hidden
      >
        ✓✓
      </span>
    );
  }
  return (
    <span
      className="text-[13px] leading-none tracking-[-0.15em] text-violet-200"
      aria-hidden
    >
      ✓✓
    </span>
  );
}

export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { markChatRead, setActiveChatId, getChatRow, refreshChats, setChats } =
    useChatUnread();

  const me = session?.user?.id ?? null;
  const chatId = typeof id === "string" ? id.trim() : "";

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastLoadedMessageIdRef = useRef<string | null>(null);
  const lastReadMarkedMessageIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const messagesRef = useRef<MessageRow[]>([]);
  const lastVisibleMessageIdRef = useRef<string | null>(null);
  const markReadDebounceRef = useRef<number | null>(null);

  messagesRef.current = messages;

  const markIncomingDelivered = useCallback(
    async (messageId: string) => {
      if (!me || !isUuid(messageId)) return;
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("messages")
        .update({ delivered_at: nowIso })
        .eq("id", messageId)
        .is("delivered_at", null);
      if (error) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, delivered_at: nowIso } : m,
        ),
      );
    },
    [me],
  );

  const markIncomingDeliveredBatch = useCallback(async () => {
    if (!me || !chatId || !isUuid(chatId)) return;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("messages")
      .update({ delivered_at: nowIso })
      .eq("chat_id", chatId)
      .neq("sender_id", me)
      .is("delivered_at", null)
      .select("id");
    if (error || !data?.length) return;
    const ids = new Set(
      data.map((r: { id: string }) => String(r.id)),
    );
    setMessages((prev) =>
      prev.map((m) =>
        ids.has(m.id) ? { ...m, delivered_at: nowIso } : m,
      ),
    );
  }, [chatId, me]);

  const currentChat = useMemo(
    () => (chatId ? getChatRow(chatId) : null),
    [chatId, getChatRow],
  );

  const roomTitle = useMemo(() => {
    if (!currentChat) return "Чат";
    if (currentChat.is_group) {
      return currentChat.title?.trim() || "Группа";
    }
    return currentChat.other_name?.trim() || "Чат";
  }, [currentChat]);

  const latestMessageId = useMemo(
    () => messages[messages.length - 1]?.id ?? null,
    [messages],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!chatId || !isUuid(chatId)) return;

    setLoadErr(null);

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("chat room load messages", error);
        setLoadErr(FETCH_ERROR_MESSAGE);
        setMessages([]);
        return;
      }

      const safe = Array.isArray(data)
        ? data.map((row) => normalizeMessage(row as Record<string, unknown>))
        : [];

      if (!mountedRef.current) return;

      setMessages(sortMessages(safe));
      lastLoadedMessageIdRef.current =
        safe.length > 0 ? safe[safe.length - 1].id : null;
      void markIncomingDeliveredBatch();
    } catch (error) {
      console.error("chat room load unexpected", error);
      if (!mountedRef.current) return;
      setLoadErr(FETCH_ERROR_MESSAGE);
      setMessages([]);
    }
  }, [chatId, markIncomingDeliveredBatch]);

  const markVisibleRoomRead = useCallback(
    async (explicitMessageId?: string | null) => {
      if (!chatId || !me) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const targetMessageId =
        explicitMessageId ??
        lastVisibleMessageIdRef.current ??
        latestMessageId;
      if (
        !targetMessageId ||
        !isUuid(targetMessageId) ||
        targetMessageId === lastReadMarkedMessageIdRef.current
      ) {
        return;
      }

      try {
        await markChatRead(chatId, targetMessageId);
        lastReadMarkedMessageIdRef.current = targetMessageId;
      } catch (error) {
        console.error("chat room mark read", error);
      }
    },
    [chatId, latestMessageId, markChatRead, me],
  );

  const scheduleMarkReadFromVisibility = useCallback(
    (bestId: string | null) => {
      if (!bestId || !isUuid(bestId)) return;
      if (markReadDebounceRef.current) {
        window.clearTimeout(markReadDebounceRef.current);
      }
      markReadDebounceRef.current = window.setTimeout(() => {
        markReadDebounceRef.current = null;
        void markVisibleRoomRead(bestId);
      }, 380);
    },
    [markVisibleRoomRead],
  );

  const backfillAfterReconnect = useCallback(async () => {
    await loadMessages();
    await refreshChats({ silent: true });
    await markVisibleRoomRead(lastLoadedMessageIdRef.current);
  }, [loadMessages, markVisibleRoomRead, refreshChats]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!chatId || !isUuid(chatId)) {
      setLoadErr("Некорректный id чата");
      setRoomStatus("error");
      return;
    }

    setRoomStatus("connecting");
    void loadMessages().then(() => {
      if (!mountedRef.current) return;
      setRoomStatus("connected");
    });
  }, [chatId, loadMessages]);

  useEffect(() => {
    if (!chatId || !isUuid(chatId)) return;
    setActiveChatId(chatId);
    setMessages((prev) =>
      prev.map((m) =>
        m.chat_id === chatId
          ? {
              ...m,
              status: m.sender_id === me ? m.status : "seen",
            }
          : m,
      ),
    );
    return () => {
      setActiveChatId(null);
    };
  }, [chatId, me, setActiveChatId]);

  useEffect(() => {
    if (!chatId) return;

    setChats((prev) =>
      prev.map((c) => {
        const withId = c as typeof c & { id?: string };
        return withId.id === chatId || c.chat_id === chatId
          ? { ...c, unread_count: 0 }
          : c;
      }),
    );
  }, [chatId, setChats]);

  useEffect(() => {
    if (!chatId) return;
    if (!isUuid(chatId)) return;

    let cancelled = false;

    const clearReconnect = () => {
      if (typeof window !== "undefined" && reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      clearReconnect();

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel(`chat-${chatId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            const newMessage = normalizeMessage(
              payload.new as Record<string, unknown>,
            );

            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMessage.id);
              if (exists) return prev;
              return [...prev, newMessage];
            });

            lastLoadedMessageIdRef.current = newMessage.id;

            if (stickBottomRef.current) {
              requestAnimationFrame(() => scrollToBottom("smooth"));
            }

            if (
              newMessage.sender_id !== me &&
              typeof document !== "undefined" &&
              document.visibilityState === "visible"
            ) {
              void markIncomingDelivered(newMessage.id);
              void markVisibleRoomRead(newMessage.id);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? "");
            if (!id) return;
            const patch = normalizeMessage(row);
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
            );
          },
        );

      channelRef.current = channel;

      channel.subscribe((status) => {
        if (!mountedRef.current || cancelled) return;

        if (status === "SUBSCRIBED") {
          reconnectAttemptRef.current = 0;
          setRoomStatus("connected");
          void backfillAfterReconnect();
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRoomStatus("reconnecting");
          const nextAttempt = Math.min(reconnectAttemptRef.current + 1, 6);
          reconnectAttemptRef.current = nextAttempt;

          clearReconnect();
          if (typeof window !== "undefined") {
            reconnectTimerRef.current = window.setTimeout(
              () => {
                if (!cancelled) connect();
              },
              500 * 2 ** (nextAttempt - 1),
            );
          }
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [chatId, supabase, me, markIncomingDelivered, markVisibleRoomRead]);

  useEffect(() => {
    if (!messages.length) return;
    if (stickBottomRef.current) {
      scrollToBottom(messages.length === 1 ? "auto" : "smooth");
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (!latestMessageId) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.chat_id === chatId && m.sender_id !== me
          ? { ...m, status: "seen" }
          : m,
      ),
    );
  }, [chatId, latestMessageId, me]);

  useEffect(() => {
    const root = listRef.current;
    if (!root || loadErr || !messages.length) return;

    const visible = new Set<string>();

    const pickBest = () => {
      let best: string | null = null;
      const list = messagesRef.current;
      for (const id of visible) {
        if (!isUuid(id)) continue;
        const msg = list.find((m) => m.id === id);
        if (!msg) continue;
        if (!best) {
          best = id;
          continue;
        }
        const other = list.find((m) => m.id === best);
        if (!other) {
          best = id;
          continue;
        }
        const t = new Date(msg.created_at).getTime();
        const to = new Date(other.created_at).getTime();
        if (t > to || (t === to && msg.id.localeCompare(best) > 0)) {
          best = id;
        }
      }
      lastVisibleMessageIdRef.current = best;
      scheduleMarkReadFromVisibility(best);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        pickBest();
      },
      { root, threshold: 0.35, rootMargin: "0px" },
    );

    root.querySelectorAll<HTMLElement>("[data-message-id]").forEach((el) => {
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
      if (markReadDebounceRef.current) {
        window.clearTimeout(markReadDebounceRef.current);
        markReadDebounceRef.current = null;
      }
    };
  }, [messages, loadErr, scheduleMarkReadFromVisibility]);

  useEffect(() => {
    if (!chatId || !me) return;

    const onFocus = () => {
      void backfillAfterReconnect();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void backfillAfterReconnect();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [backfillAfterReconnect, chatId, me]);

  async function send() {
    if (!me || !chatId || !isUuid(chatId) || !text.trim() || sending) return;

    setSendErr(null);
    const trimmed = text.trim();
    const optimisticMessage: MessageRow = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      sender_id: me,
      text: trimmed,
      created_at: new Date().toISOString(),
      deleted: false,
      hidden_for_user_ids: [],
      status: "sent",
      delivered_at: null,
      read_at: null,
    };

    setSending(true);
    setMessages((prev) => mergeIncomingInsert(prev, optimisticMessage));
    setText("");
    requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: me,
        text: trimmed,
      });

      if (error) {
        throw error;
      }

      await refreshChats({ silent: true });
    } catch (error) {
      console.error("chat room send failed", error);
      setSendErr(
        "Не удалось отправить сообщение. Проверьте интернет и попробуйте снова.",
      );
      setMessages((prev) =>
        prev.filter((message) => message.id !== optimisticMessage.id),
      );
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  if (!session) {
    return (
      <main className="p-5">
        <Link href="/login" className="text-sm font-semibold text-accent">
          Войти
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100dvh-64px)] flex-col bg-main">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-elevated/90 px-3 py-3 backdrop-blur-md safe-pt">
        <button
          type="button"
          onClick={() => router.back()}
          className="pressable min-h-[44px] min-w-[44px] rounded-full px-2 text-sm font-medium text-accent"
        >
          ←
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{roomTitle}</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {roomStatus === "connected"
              ? "Онлайн"
              : roomStatus === "reconnecting"
                ? "Переподключение…"
                : roomStatus === "connecting"
                  ? "Подключение…"
                  : roomStatus === "error"
                    ? "Ошибка соединения"
                    : ""}
          </div>
        </div>
      </header>

      {loadErr ? (
        <div className="p-4">
          <ErrorUi text={loadErr} />
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const nearBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          stickBottomRef.current = nearBottom;
        }}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-smooth"
      >
        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div
              key={m.id}
              data-message-id={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[min(85%,20rem)] flex-col gap-1 rounded-[2rem] px-4 py-2.5 text-[15px] leading-relaxed transition-colors duration-ui ${
                  mine
                    ? "bg-accent text-white shadow-soft"
                    : "border border-line bg-elevated text-fg shadow-soft"
                }`}
              >
                <span>{buildMessagePreview(m)}</span>
                {mine ? (
                  <div className="flex min-h-[14px] items-end justify-end">
                    <MessageStatusTicks
                      mine
                      delivered_at={m.delivered_at}
                      read_at={m.read_at}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {!messages.length && !loadErr ? (
          <div className="rounded-card border border-line bg-elevated px-4 py-5 text-center text-sm text-muted">
            Пока нет сообщений. Напишите первым.
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-line bg-elevated p-3 safe-pb">
        {sendErr ? (
          <p className="mb-2 text-sm font-medium text-danger">{sendErr}</p>
        ) : null}

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (sendErr) setSendErr(null);
            }}
            className="min-h-[48px] flex-1 rounded-full border border-line bg-main px-4 text-base text-fg placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/35"
            placeholder="Сообщение…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className="pressable flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-accent text-lg font-bold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
          >
            →
          </button>
        </div>
      </div>
    </main>
  );
}
