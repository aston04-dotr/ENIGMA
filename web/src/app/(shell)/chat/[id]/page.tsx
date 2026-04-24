"use client";

import { MessageReactions } from "@/components/chat/MessageReactions";
import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MessageReactionListItem, MessageRow } from "@/lib/types";
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

/** Только для полных строк (SELECT / Realtime INSERT). Для Realtime UPDATE — {@link patchMessageFromRealtime}. */
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

/** Realtime UPDATE часто присылает только изменённые поля — не затираем остальное через normalizeMessage. */
function patchMessageFromRealtime(
  prev: MessageRow,
  raw: Record<string, unknown>,
): MessageRow {
  const next: MessageRow = { ...prev };
  let changed = false;

  const set = <K extends keyof MessageRow>(key: K, val: MessageRow[K]) => {
    if (prev[key] === val) return;
    (next as MessageRow)[key] = val;
    changed = true;
  };

  if ("text" in raw) {
    const v = String(raw.text ?? "");
    set("text", v);
  }
  if ("delivered_at" in raw) {
    const v = raw.delivered_at ? String(raw.delivered_at) : null;
    set("delivered_at", v);
  }
  if ("read_at" in raw) {
    const v = raw.read_at ? String(raw.read_at) : null;
    set("read_at", v);
  }
  if ("edited_at" in raw) {
    const v = raw.edited_at ? String(raw.edited_at) : null;
    set("edited_at", v);
  }
  if ("deleted" in raw) {
    const v = Boolean(raw.deleted);
    set("deleted", v);
  }
  if ("status" in raw) {
    const v = raw.status ? String(raw.status) : null;
    set("status", v);
  }
  if ("image_url" in raw) {
    const v = raw.image_url ? String(raw.image_url) : null;
    set("image_url", v);
  }
  if ("voice_url" in raw) {
    const v = raw.voice_url ? String(raw.voice_url) : null;
    set("voice_url", v);
  }
  if ("sender_id" in raw) {
    const v = String(raw.sender_id ?? "");
    set("sender_id", v);
  }
  if ("chat_id" in raw) {
    const v = String(raw.chat_id ?? "");
    set("chat_id", v);
  }
  if ("created_at" in raw) {
    const v = String(raw.created_at ?? new Date().toISOString());
    set("created_at", v);
  }
  if (Array.isArray(raw.hidden_for_user_ids)) {
    const v = raw.hidden_for_user_ids.map((item) => String(item));
    if (
      prev.hidden_for_user_ids?.length !== v.length ||
      prev.hidden_for_user_ids?.some((x, i) => x !== v[i])
    ) {
      next.hidden_for_user_ids = v;
      changed = true;
    }
  }

  return changed ? next : prev;
}

function sortMessages(messages: MessageRow[]): MessageRow[] {
  return [...messages].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function formatLastSeen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Минимум между broadcast typing; дебаунс ввода остаётся отдельно. */
const TYPING_SEND_MIN_MS = 1000;
/** Не считать peer офлайн сразу (реконнект / краткий сбой presence). */
const PRESENCE_OFFLINE_DELAY_MS = 3000;
/** Ниже этой дистанции от низа — «внизу», включаем автоскролл. */
const NEAR_BOTTOM_PX = 120;
/** Скролл вниз: слияние быстрых вызовов. */
const SCROLL_BOTTOM_DEBOUNCE_MS = 70;
/** Send: auto-scroll если уже близко к низу. */
const SEND_SCROLL_INSTANT_IF_WITHIN_PX = 80;
const MAX_MESSAGE_ENTER_ANIM = 5;

const EMPTY_REACTIONS: MessageReactionListItem[] = [];

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

const tickSvg = "block shrink-0 [shape-rendering:geometricPrecision]";

/** Одна галочка — отправлено (ещё не доставлено собеседнику). */
function ReceiptTickSingle({ className }: { className?: string }) {
  return (
    <svg
      className={`${tickSvg} h-3 w-[15px] ${className ?? ""}`}
      viewBox="0 0 8 6"
      fill="none"
      aria-hidden
    >
      <path
        d="M 0.65 3.15 L 2.35 4.55 L 5.75 0.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.45"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Две галочки — доставлено или прочитано (как в WhatsApp, со сдвигом). */
function ReceiptTickDouble({ className }: { className?: string }) {
  return (
    <svg
      className={`${tickSvg} h-3 w-6 ${className ?? ""}`}
      viewBox="0 0 14 6"
      fill="none"
      aria-hidden
    >
      <path
        d="M 0.6 3.15 L 2.25 4.55 L 5.7 0.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.45"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M 3.35 3.15 L 5 4.55 L 8.55 0.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.45"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
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
  // WhatsApp: прочитано → фиолетовые ✓✓; доставлено → серые ✓✓; иначе одна ✓
  const tier = read_at ? 2 : delivered_at ? 1 : 0;
  const strokeClass =
    tier === 2
      ? "text-violet-600 transition-colors duration-200 ease-out dark:text-violet-400"
      : "text-fg/33 transition-colors duration-200 ease-out dark:text-fg/35";

  const icon =
    tier >= 1 ? (
      <ReceiptTickDouble className={strokeClass} />
    ) : (
      <ReceiptTickSingle className={strokeClass} />
    );

  return (
    <span
      key={tier}
      className="inline-flex origin-center animate-receiptPop will-change-[transform,opacity]"
    >
      {icon}
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
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [appearingMessageIds, setAppearingMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [messageReactionsMap, setMessageReactionsMap] = useState<
    Record<string, MessageReactionListItem[]>
  >({});

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
  const peerUserIdRef = useRef<string | null>(null);
  const peerWasOnlineRef = useRef(false);
  const typingEmitTimerRef = useRef<number | null>(null);
  const typingHideTimerRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const peerOfflineTimerRef = useRef<number | null>(null);
  /** Скролл вниз (auto) один раз при открытии чата, после загрузки сообщений. */
  const initialScrollForChatIdRef = useRef<string | null>(null);
  const messageAnimHydratedChatIdRef = useRef<string | null>(null);
  const messageAnimKnownIdsRef = useRef<Set<string>>(new Set());
  const messageReactionsMapRef = useRef<Record<string, MessageReactionListItem[]>>(
    {},
  );
  const scrollBottomDebounceRef = useRef<number | null>(null);
  const scrollBottomInFlightRef = useRef(false);
  const scrollBottomPendingRef = useRef<ScrollBehavior | null>(null);
  const lastScrollBehaviorRef = useRef<ScrollBehavior>("smooth");

  messagesRef.current = messages;
  useEffect(() => {
    messageReactionsMapRef.current = messageReactionsMap;
  }, [messageReactionsMap]);

  useEffect(() => {
    setPeerTyping(false);
    setPeerOnline(false);
    setPeerLastSeenAt(null);
    setAtBottom(true);
    setHeaderElevated(false);
    setAppearingMessageIds(new Set());
    setMessageReactionsMap({});
    messageReactionsMapRef.current = {};
    messageAnimHydratedChatIdRef.current = null;
    messageAnimKnownIdsRef.current = new Set();
    peerWasOnlineRef.current = false;
    if (typeof window !== "undefined") {
      if (typingEmitTimerRef.current) {
        window.clearTimeout(typingEmitTimerRef.current);
        typingEmitTimerRef.current = null;
      }
      if (typingHideTimerRef.current) {
        window.clearTimeout(typingHideTimerRef.current);
        typingHideTimerRef.current = null;
      }
      if (peerOfflineTimerRef.current) {
        window.clearTimeout(peerOfflineTimerRef.current);
        peerOfflineTimerRef.current = null;
      }
    }
    lastTypingSentAtRef.current = 0;
    initialScrollForChatIdRef.current = null;
    if (typeof window !== "undefined" && scrollBottomDebounceRef.current) {
      window.clearTimeout(scrollBottomDebounceRef.current);
      scrollBottomDebounceRef.current = null;
    }
    scrollBottomPendingRef.current = null;
    scrollBottomInFlightRef.current = false;
  }, [chatId]);

  const markIncomingDelivered = useCallback(
    async (messageId: string, senderIdHint?: string) => {
      if (!me || !isUuid(messageId)) return;
      if (senderIdHint !== undefined && senderIdHint === me) return;
      const row = messagesRef.current.find((m) => m.id === messageId);
      if (row && row.sender_id === me) return;

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("messages")
        .update({ delivered_at: nowIso })
        .eq("id", messageId)
        .is("delivered_at", null);

      if (error) {
        console.error("messages delivered_at (single)", error);
        return;
      }

      setMessages((prev) => {
        const row = prev.find((m) => m.id === messageId);
        if (row?.delivered_at) return prev;
        return prev.map((m) =>
          m.id === messageId ? { ...m, delivered_at: nowIso } : m,
        );
      });
    },
    [me],
  );

  const markIncomingDeliveredBatch = useCallback(async () => {
    if (!me || !chatId || !isUuid(chatId)) return;

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("messages")
      .update({ delivered_at: nowIso })
      .eq("chat_id", chatId)
      .neq("sender_id", me)
      .is("delivered_at", null);

    if (error) {
      console.error("messages delivered_at (batch)", error);
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.chat_id === chatId &&
        m.sender_id !== me &&
        !m.delivered_at &&
        isUuid(m.id)
          ? { ...m, delivered_at: nowIso }
          : m,
      ),
    );
  }, [chatId, me]);

  const currentChat = useMemo(
    () => (chatId ? getChatRow(chatId) : null),
    [chatId, getChatRow],
  );

  useEffect(() => {
    peerUserIdRef.current = currentChat?.other_user_id ?? null;
  }, [currentChat?.other_user_id]);

  const roomTitle = useMemo(() => {
    if (!currentChat) return "Чат";
    if (currentChat.is_group) {
      return currentChat.title?.trim() || "Группа";
    }
    return currentChat.other_name?.trim() || "Чат";
  }, [currentChat]);

  /** Подстрока под названием: соединение / печатает (синий) / last seen — без «онлайн» (оно у заголовка). */
  const headerSecondaryLine = useMemo(() => {
    if (roomStatus === "reconnecting")
      return { kind: "muted" as const, text: "Переподключение…" };
    if (roomStatus === "connecting")
      return { kind: "muted" as const, text: "Подключение…" };
    if (roomStatus === "error")
      return { kind: "muted" as const, text: "Ошибка соединения" };
    if (peerTyping) return { kind: "typing" as const, text: "печатает…" };
    if (currentChat?.is_group) return { kind: "empty" as const, text: "" };
    const peerId = currentChat?.other_user_id;
    if (peerId && !peerOnline && peerLastSeenAt) {
      const t = formatLastSeen(peerLastSeenAt);
      return t
        ? { kind: "muted" as const, text: `был(а) в ${t}` }
        : { kind: "empty" as const, text: "" };
    }
    return { kind: "empty" as const, text: "" };
  }, [
    roomStatus,
    peerTyping,
    currentChat?.is_group,
    currentChat?.other_user_id,
    peerOnline,
    peerLastSeenAt,
  ]);

  const showPeerOnlinePill =
    roomStatus === "connected" &&
    Boolean(
      currentChat &&
        !currentChat.is_group &&
        currentChat.other_user_id &&
        peerOnline,
    );

  const sendTypingSafe = useCallback(() => {
    if (typeof window === "undefined" || !me || !chatId || !isUuid(chatId)) {
      return;
    }
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_SEND_MIN_MS) return;
    lastTypingSentAtRef.current = now;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { chat_id: chatId, user_id: me },
    });
  }, [me, chatId]);

  const scheduleTypingBroadcast = useCallback(() => {
    if (typeof window === "undefined" || !me || !chatId || !isUuid(chatId)) {
      return;
    }
    if (typingEmitTimerRef.current) {
      window.clearTimeout(typingEmitTimerRef.current);
    }
    typingEmitTimerRef.current = window.setTimeout(() => {
      typingEmitTimerRef.current = null;
      sendTypingSafe();
    }, 420);
  }, [me, chatId, sendTypingSafe]);

  const latestMessageId = useMemo(
    () => messages[messages.length - 1]?.id ?? null,
    [messages],
  );

  const updateListScrollUi = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist < NEAR_BOTTOM_PX;
    stickBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
    setHeaderElevated(el.scrollTop > 2);
  }, []);

  const runScrollToBottom = useCallback((behavior: ScrollBehavior) => {
    if (typeof window === "undefined") return;
    if (scrollBottomInFlightRef.current) {
      scrollBottomPendingRef.current = behavior;
      return;
    }
    scrollBottomInFlightRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateListScrollUi();
        window.setTimeout(() => {
          scrollBottomInFlightRef.current = false;
          const next = scrollBottomPendingRef.current;
          scrollBottomPendingRef.current = null;
          if (next !== null) {
            runScrollToBottom(next);
          }
        }, 100);
      });
    });
  }, [updateListScrollUi]);

  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      lastScrollBehaviorRef.current = behavior;
      if (typeof window === "undefined") return;
      if (scrollBottomDebounceRef.current) {
        window.clearTimeout(scrollBottomDebounceRef.current);
      }
      scrollBottomDebounceRef.current = window.setTimeout(() => {
        scrollBottomDebounceRef.current = null;
        runScrollToBottom(lastScrollBehaviorRef.current);
      }, SCROLL_BOTTOM_DEBOUNCE_MS);
    },
    [runScrollToBottom],
  );

  /** Без дебаунса (первичный просмотр). Не кладёт в очередь. */
  const scrollToBottomImmediate = useCallback(
    (behavior: ScrollBehavior) => {
      if (typeof window === "undefined") return;
      if (scrollBottomDebounceRef.current) {
        window.clearTimeout(scrollBottomDebounceRef.current);
        scrollBottomDebounceRef.current = null;
      }
      scrollBottomPendingRef.current = null;
      scrollBottomInFlightRef.current = false;
      bottomRef.current?.scrollIntoView({ behavior });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateListScrollUi();
        });
      });
    },
    [updateListScrollUi],
  );

  useEffect(() => {
    if (!chatId || !messages.length) return;
    if (!messages.every((m) => m.chat_id === chatId)) return;
    if (initialScrollForChatIdRef.current === chatId) return;
    initialScrollForChatIdRef.current = chatId;
    stickBottomRef.current = true;
    setAtBottom(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottomImmediate("auto");
      });
    });
  }, [chatId, messages, scrollToBottomImmediate]);

  useEffect(() => {
    if (!chatId) return;
    if (!messages.length) return;
    if (!messages.every((m) => m.chat_id === chatId)) return;
    if (messageAnimHydratedChatIdRef.current !== chatId) {
      messageAnimHydratedChatIdRef.current = chatId;
      messageAnimKnownIdsRef.current = new Set(messages.map((m) => m.id));
      return;
    }
    const newIds: string[] = [];
    for (const m of messages) {
      if (!messageAnimKnownIdsRef.current.has(m.id)) {
        newIds.push(m.id);
        messageAnimKnownIdsRef.current.add(m.id);
      }
    }
    if (newIds.length === 0) return;
    const toAnimate = newIds.slice(0, MAX_MESSAGE_ENTER_ANIM);
    setAppearingMessageIds((prev) => {
      const next = new Set(prev);
      for (const id of toAnimate) next.add(id);
      return next;
    });
    const t = window.setTimeout(() => {
      setAppearingMessageIds((prev) => {
        const next = new Set(prev);
        for (const id of toAnimate) next.delete(id);
        return next;
      });
    }, 200);
    return () => window.clearTimeout(t);
  }, [chatId, messages]);

  const loadReactions = useCallback(async () => {
    if (!chatId || !isUuid(chatId)) return;
    const { data, error } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("message_reactions load", error);
      return;
    }

    const map: Record<string, MessageReactionListItem[]> = {};
    for (const row of data ?? []) {
      const mid = String((row as { message_id?: string }).message_id ?? "");
      if (!mid) continue;
      if (!map[mid]) map[mid] = [];
      map[mid].push({
        id: String((row as { id?: string }).id ?? ""),
        emoji: String((row as { emoji?: string }).emoji ?? ""),
        user_id: String((row as { user_id?: string }).user_id ?? ""),
      });
    }
    if (!mountedRef.current) return;
    setMessageReactionsMap(map);
    messageReactionsMapRef.current = map;
  }, [chatId]);

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
        setMessageReactionsMap({});
        messageReactionsMapRef.current = {};
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
      await loadReactions();
    } catch (error) {
      console.error("chat room load unexpected", error);
      if (!mountedRef.current) return;
      setLoadErr(FETCH_ERROR_MESSAGE);
      setMessages([]);
      setMessageReactionsMap({});
      messageReactionsMapRef.current = {};
    }
  }, [chatId, markIncomingDeliveredBatch, loadReactions]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!me || !isUuid(messageId)) return;
      const list = messageReactionsMapRef.current[messageId] ?? [];
      const existing = list.find(
        (r) => r.user_id === me && r.emoji === emoji,
      );
      if (existing) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) {
          console.error("message_reactions delete", error);
          return;
        }
        setMessageReactionsMap((prev) => {
          const next = { ...prev };
          const arr = (next[messageId] ?? []).filter(
            (r) => r.id !== existing.id,
          );
          if (arr.length) next[messageId] = arr;
          else delete next[messageId];
          return next;
        });
        return;
      }
      const { data, error } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: me, emoji })
        .select("id, message_id, user_id, emoji")
        .single();
      if (error) {
        console.error("message_reactions insert", error);
        return;
      }
      if (!data) return;
      const row = data as {
        id: string;
        message_id: string;
        user_id: string;
        emoji: string;
      };
      setMessageReactionsMap((prev) => {
        const cur = prev[messageId] ?? [];
        if (cur.some((x) => x.id === row.id)) return prev;
        return {
          ...prev,
          [messageId]: [
            ...cur,
            { id: row.id, emoji: row.emoji, user_id: row.user_id },
          ],
        };
      });
    },
    [me],
  );

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

  /** Повторный batch, если сессия появилась после первой загрузки или UPDATE не вернул строки в select. */
  useEffect(() => {
    if (!me || !isUuid(chatId)) return;
    void markIncomingDeliveredBatch();
  }, [me, chatId, markIncomingDeliveredBatch]);

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

      const clearPeerOfflineTimer = () => {
        if (typeof window === "undefined") return;
        if (peerOfflineTimerRef.current) {
          window.clearTimeout(peerOfflineTimerRef.current);
          peerOfflineTimerRef.current = null;
        }
      };

      const applyPresenceFromChannel = (ch: RealtimeChannel) => {
        const peerId = peerUserIdRef.current;
        if (!peerId) {
          clearPeerOfflineTimer();
          setPeerOnline(false);
          return;
        }
        const state = ch.presenceState() as Record<string, unknown[] | undefined>;
        const slice = state[peerId];
        const online = Array.isArray(slice) && slice.length > 0;

        if (online) {
          clearPeerOfflineTimer();
          setPeerOnline(true);
          peerWasOnlineRef.current = true;
          return;
        }

        clearPeerOfflineTimer();
        if (!peerWasOnlineRef.current) {
          setPeerOnline(false);
          return;
        }

        peerOfflineTimerRef.current = window.setTimeout(() => {
          peerOfflineTimerRef.current = null;
          if (!mountedRef.current) return;
          setPeerLastSeenAt(new Date().toISOString());
          setPeerOnline(false);
          peerWasOnlineRef.current = false;
        }, PRESENCE_OFFLINE_DELAY_MS);
      };

      const channel = supabase
        .channel(`chat-${chatId}`, {
          config: {
            broadcast: { self: false },
            ...(me ? { presence: { key: me } } : {}),
          },
        })
        .on("broadcast", { event: "typing" }, (msg) => {
          const payload = msg.payload as {
            chat_id?: string;
            user_id?: string;
          } | null;
          if (!payload || payload.chat_id !== chatId) return;
          if (!payload.user_id || payload.user_id === me) return;
          setPeerTyping(true);
          if (typingHideTimerRef.current) {
            window.clearTimeout(typingHideTimerRef.current);
          }
          typingHideTimerRef.current = window.setTimeout(() => {
            typingHideTimerRef.current = null;
            setPeerTyping(false);
          }, 2600);
        })
        .on("presence", { event: "sync" }, () => {
          applyPresenceFromChannel(channel);
        })
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
              scheduleScrollToBottom("smooth");
            }

            if (me && newMessage.sender_id !== me) {
              void markIncomingDelivered(
                newMessage.id,
                newMessage.sender_id,
              );
              if (
                typeof document !== "undefined" &&
                document.visibilityState === "visible"
              ) {
                void markVisibleRoomRead(newMessage.id);
              }
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
            // payload.new может быть частичным (только delivered_at / read_at). Не использовать normalizeMessage.
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? "");
            if (!id) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id ? patchMessageFromRealtime(m, row) : m,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message_reactions",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (!row) return;
            const id = String(row.id ?? "");
            const messageId = String(row.message_id ?? "");
            const userId = String(row.user_id ?? "");
            const emoji = String(row.emoji ?? "");
            if (!id || !messageId) return;
            setMessageReactionsMap((prev) => {
              const cur = prev[messageId] ?? [];
              if (cur.some((r) => r.id === id)) return prev;
              return {
                ...prev,
                [messageId]: [...cur, { id, emoji, user_id: userId }],
              };
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "message_reactions",
            filter: `chat_id=eq.${chatId}`,
          },
          (payload) => {
            const oldRow = payload.old as Record<string, unknown> | null;
            if (!oldRow) return;
            const rid = String(oldRow.id ?? "");
            const messageId = String(oldRow.message_id ?? "");
            if (!rid) return;
            setMessageReactionsMap((prev) => {
              if (messageId) {
                const cur = prev[messageId] ?? [];
                const nextArr = cur.filter((r) => r.id !== rid);
                if (nextArr.length === cur.length) return prev;
                const next = { ...prev };
                if (nextArr.length) next[messageId] = nextArr;
                else delete next[messageId];
                return next;
              }
              for (const mid of Object.keys(prev)) {
                const arr = prev[mid] ?? [];
                if (!arr.some((r) => r.id === rid)) continue;
                const nextArr = arr.filter((r) => r.id !== rid);
                const next = { ...prev };
                if (nextArr.length) next[mid] = nextArr;
                else delete next[mid];
                return next;
              }
              return prev;
            });
          },
        );

      channelRef.current = channel;

      channel.subscribe(async (status) => {
        if (!mountedRef.current || cancelled) return;

        if (status === "SUBSCRIBED") {
          reconnectAttemptRef.current = 0;
          setRoomStatus("connected");
          if (me) {
            try {
              await channel.track({ online_at: new Date().toISOString() });
            } catch (err) {
              console.error("presence track", err);
            }
          }
          applyPresenceFromChannel(channel);
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
      if (typeof window !== "undefined") {
        if (typingHideTimerRef.current) {
          window.clearTimeout(typingHideTimerRef.current);
          typingHideTimerRef.current = null;
        }
        if (typingEmitTimerRef.current) {
          window.clearTimeout(typingEmitTimerRef.current);
          typingEmitTimerRef.current = null;
        }
        if (peerOfflineTimerRef.current) {
          window.clearTimeout(peerOfflineTimerRef.current);
          peerOfflineTimerRef.current = null;
        }
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [
    chatId,
    me,
    markIncomingDelivered,
    markVisibleRoomRead,
    backfillAfterReconnect,
    scheduleScrollToBottom,
    updateListScrollUi,
  ]);

  useEffect(() => {
    if (!messages.length) return;
    if (stickBottomRef.current) {
      const behavior: ScrollBehavior =
        messages.length === 1 ? "auto" : "smooth";
      scheduleScrollToBottom(behavior);
    }
  }, [messages.length, scheduleScrollToBottom]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && scrollBottomDebounceRef.current) {
        window.clearTimeout(scrollBottomDebounceRef.current);
        scrollBottomDebounceRef.current = null;
      }
    };
  }, []);

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

    const listEl = listRef.current;
    let scrollBehavior: ScrollBehavior = "smooth";
    if (listEl) {
      const d =
        listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      scrollBehavior =
        d < SEND_SCROLL_INSTANT_IF_WITHIN_PX ? "auto" : "smooth";
    }

    setSending(true);
    setMessages((prev) => mergeIncomingInsert(prev, optimisticMessage));
    setText("");
    stickBottomRef.current = true;
    scheduleScrollToBottom(scrollBehavior);

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
    <main className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden bg-main">
      <header
        className={`sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-line bg-elevated/95 px-3 py-3 backdrop-blur-md safe-pt transition-[box-shadow] duration-200 ease-out ${
          headerElevated
            ? "shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.22)]"
            : "shadow-none"
        }`}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="pressable z-10 min-h-[44px] min-w-[44px] rounded-full px-2 text-sm font-medium text-accent"
        >
          ←
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <h1 className="truncate text-base font-semibold leading-tight text-fg">
              {roomTitle}
            </h1>
            {showPeerOnlinePill ? (
              <span className="shrink-0 text-xs font-medium text-green-500">
                онлайн
              </span>
            ) : null}
          </div>
          <div
            className={`mt-0.5 min-h-[16px] transition-opacity duration-150 ${
              headerSecondaryLine.kind === "typing"
                ? "text-sm font-medium leading-snug text-blue-500 dark:text-blue-400"
                : headerSecondaryLine.kind === "muted"
                  ? "text-[11px] text-muted"
                  : ""
            }`}
          >
            {headerSecondaryLine.text}
          </div>
        </div>
      </header>

      {loadErr ? (
        <div className="shrink-0 p-4">
          <ErrorUi text={loadErr} />
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          onScroll={updateListScrollUi}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4 [scroll-behavior:smooth] scroll-smooth"
        >
        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div
              key={m.id}
              data-message-id={m.id}
              className={`flex min-w-0 w-full ${
                appearingMessageIds.has(m.id) ? "animate-messageAppear" : ""
              } ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex min-w-0 max-w-[min(85%,20rem)] flex-col ${mine ? "items-end gap-1" : ""}`}
              >
                <div
                  className={`w-full min-w-0 max-w-full rounded-[2rem] px-4 py-2.5 text-[15px] leading-relaxed transition-colors duration-ui break-words [overflow-wrap:anywhere] ${
                    mine
                      ? "bg-accent text-white shadow-soft"
                      : "border border-line bg-elevated text-fg shadow-soft"
                  }`}
                >
                  {buildMessagePreview(m)}
                </div>
                <MessageReactions
                  messageId={m.id}
                  me={me}
                  alignEnd={mine}
                  rows={messageReactionsMap[m.id] ?? EMPTY_REACTIONS}
                  onToggle={toggleReaction}
                />
                {mine ? (
                  <div className="flex min-h-4 items-center justify-end pr-0.5 pt-0.5">
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

        <button
          type="button"
          aria-label="Прокрутить вниз"
          tabIndex={atBottom ? -1 : 0}
          className={`pressable absolute bottom-3 right-4 z-20 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-line/80 bg-elevated/95 text-lg text-fg shadow-lg backdrop-blur-sm transition-[transform,opacity] duration-200 ease-out dark:bg-elev-2/95 ${
            atBottom
              ? "pointer-events-none translate-y-2 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
          onClick={() => {
            stickBottomRef.current = true;
            scheduleScrollToBottom("smooth");
          }}
        >
          ↓
        </button>
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
              if (e.target.value.trim()) scheduleTypingBroadcast();
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
