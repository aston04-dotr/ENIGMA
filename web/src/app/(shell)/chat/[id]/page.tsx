"use client";

import { ChatImageLightbox } from "@/components/chat/ChatImageLightbox";
import { ChatMessageImageBubble } from "@/components/chat/ChatMessageImageBubble";
import { Toast } from "@/components/Toast";
import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MessageRow } from "@/lib/types";
import Link from "next/link";
import { ChatPendingBlobRegistry } from "@/lib/chatBlobs";
import {
  compressImageForChat,
  getAspectFromObjectUrl,
  makeChatImageStoragePath,
  validateChatImageFileDeep,
  withUploadProgress,
} from "@/lib/chatImage";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";

type RoomStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

type MessageContextMenuState = {
  id: string;
  mine: boolean;
  x: number;
  y: number;
};

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
    type: String(raw.type ?? "text") === "image" ? "image" : "text",
    image_url: raw.image_url ? String(raw.image_url) : null,
    voice_url: raw.voice_url ? String(raw.voice_url) : null,
    reply_to: raw.reply_to ? String(raw.reply_to) : null,
    edited_at: raw.edited_at ? String(raw.edited_at) : null,
    deleted: Boolean(raw.deleted),
    deleted_at: raw.deleted_at ? String(raw.deleted_at) : null,
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
  if ("deleted_at" in raw) {
    const v = raw.deleted_at ? String(raw.deleted_at) : null;
    set("deleted_at", v);
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

function formatMessageTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function hasValidTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

function extractPresenceLastSeenAt(stateSlice: unknown[] | undefined): string | null {
  if (!Array.isArray(stateSlice) || stateSlice.length === 0) return null;
  let latestTs = 0;
  let latestIso: string | null = null;
  for (const meta of stateSlice) {
    const raw = (meta as { online_at?: unknown } | null)?.online_at;
    const iso = typeof raw === "string" ? raw : "";
    if (!iso) continue;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;
    if (ts >= latestTs) {
      latestTs = ts;
      latestIso = iso;
    }
  }
  return latestIso;
}

/** Throttle исходящих typing:true (мс) — мгновенно только первый символ. */
const TYPING_SEND_THROTTLE_MS = 250;
/** После паузы ввода — typing:false (broadcast) и сброс локального флага. */
const TYPING_LOCAL_IDLE_MS = 1200;
/** Peer «печатает» — TTL без новых пингов (и проверка по интервалу). */
const TYPING_PEER_TTL_MS = 1500;
const PEER_TYPING_CHECK_INTERVAL_MS = 300;
const MIN_TYPING_VISIBLE_MS = 600;
const RECONNECT_MAX_ATTEMPTS = 6;
/** Ниже этой дистанции — «у низа» (автоскролл при новом сообщении). */
const SCROLL_AT_BOTTOM_PX = 80;
const NEAR_BOTTOM_PX = 72;
/** Дальше от низа — кнопка «к началу». */
const FAR_FROM_BOTTOM_TOP_BTN_PX = 280;
const NEAR_TOP_HIDE_TOP_BTN_PX = 64;
const MAX_MESSAGE_ENTER_ANIM = 0;
/** Жёсткий лимит списка, чтобы длинные диалоги не ломали рендер. */
const MESSAGE_LIST_MAX = 200;
const MESSAGE_LIST_KEEP = 150;
const SUPPORT_WELCOME_MESSAGE_ID = "support-welcome-local";
const SUPPORT_WELCOME_SENDER_ID = "support";
const SUPPORT_WELCOME_TEXT = `Вас приветствует поддержка Enigma 👋

Мы всегда рядом и готовы помочь вам по любым вопросам — объявления, чат или работа платформы.

Напишите нам здесь, и мы быстро ответим.

Желаем вам удачных сделок! 🚀`;

function mergeIncomingInsert(
  prev: MessageRow[],
  row: MessageRow,
): MessageRow[] {
  if (prev.some((m) => m.id === row.id)) {
    return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
  }

  if (row.type === "image") {
    for (let i = prev.length - 1; i >= 0; i--) {
      const m = prev[i];
      if (
        m.id.startsWith("temp-") &&
        m.sender_id === row.sender_id &&
        (m.pendingUpload || m.imageUploadFailed)
      ) {
        const next = [...prev];
        next[i] = row;
        return sortMessages(next);
      }
    }
  }

  const optimisticIdx = prev.findIndex(
    (m) =>
      m.id.startsWith("temp-") &&
      m.sender_id === row.sender_id &&
      (m.type ?? "text") === (row.type ?? "text") &&
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

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.5-8.5a4 4 0 0 1 5.66 5.66l-8.5 8.5a2 2 0 0 1-2.83-2.83l7.78-7.78" />
    </svg>
  );
}

function SupportAvatarIcon({ className }: { className?: string }) {
  return (
    <div
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line/70 bg-elevated text-accent ${className ?? ""}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[17px] w-[17px]"
      >
        <path d="M4.5 12a7.5 7.5 0 1 1 15 0" />
        <path d="M5 13.5h2a1.5 1.5 0 0 1 1.5 1.5v1A1.5 1.5 0 0 1 7 17.5H6A2 2 0 0 1 4 15.5v-1A1 1 0 0 1 5 13.5Z" />
        <path d="M17 13.5h2a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2h-1a1.5 1.5 0 0 1-1.5-1.5v-1a1.5 1.5 0 0 1 1.5-1.5Z" />
        <path d="M10 17.5h4" />
      </svg>
    </div>
  );
}

function MessageReadStatus({
  mine,
  showRead,
}: {
  mine: boolean;
  showRead: boolean;
}) {
  if (!mine || !showRead) return null;
  return (
    <span
      className="leading-none text-sky-500 dark:text-sky-400"
      aria-label="прочитано"
      title="прочитано"
    >
      прочитано
    </span>
  );
}

const ChatListMessageRow = memo(function ChatListMessageRow({
  m,
  mine,
  latestReadMessageId,
  isAppearing,
  animateSupportWelcome,
  imageRetryingId,
  onOpenLightbox,
  onRetryImage,
  onOpenMessageMenu,
}: {
  m: MessageRow;
  mine: boolean;
  latestReadMessageId: string | null;
  isAppearing: boolean;
  animateSupportWelcome: boolean;
  imageRetryingId: string | null;
  onOpenLightbox: (url: string) => void;
  onRetryImage: (id: string) => void;
  onOpenMessageMenu: (
    message: MessageRow,
    payload: { x: number; y: number },
  ) => void;
}) {
  const isImage = m.type === "image" && Boolean(m.image_url);
  const isOptimistic = m.id.startsWith("temp-");
  const isSupportWelcomeMessage = m.id === SUPPORT_WELCOME_MESSAGE_ID;
  const [welcomeVisible, setWelcomeVisible] = useState(!animateSupportWelcome);
  const messageTime = formatMessageTime(m.created_at);
  const longPressTimerRef = useRef<number | null>(null);
  const canOpenMenu = !m.id.startsWith("temp-") && !isSupportWelcomeMessage;
  const showReadStatus = mine && latestReadMessageId === m.id;

  const clearLongPress = () => {
    if (typeof window === "undefined") return;
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  useEffect(() => clearLongPress, []);
  useEffect(() => {
    if (!isSupportWelcomeMessage || !animateSupportWelcome) return;
    if (typeof window === "undefined") return;
    setWelcomeVisible(false);
    const raf = window.requestAnimationFrame(() => {
      setWelcomeVisible(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isSupportWelcomeMessage, animateSupportWelcome]);

  const openMenuAt = (x: number, y: number) => {
    if (!canOpenMenu) return;
    onOpenMessageMenu(m, { x, y });
  };
  return (
    <div
      data-message-id={m.id}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        clearLongPress();
        const x = e.clientX;
        const y = e.clientY;
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          openMenuAt(x, y);
        }, 420);
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerMove={clearLongPress}
      className={`flex min-w-0 w-full ${
        isAppearing ? "animate-messageAppear" : ""
      } ${mine ? "justify-end" : "justify-start"}`}
      style={
        isSupportWelcomeMessage && animateSupportWelcome
          ? {
              opacity: welcomeVisible ? 1 : 0,
              transform: welcomeVisible ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 250ms ease-out, transform 250ms ease-out",
            }
          : undefined
      }
    >
      {!mine && isSupportWelcomeMessage ? (
        <div className="mr-2 mt-0.5 shrink-0">
          <SupportAvatarIcon />
        </div>
      ) : null}
      <div
        className={`flex min-w-0 max-w-[min(78%,22rem)] flex-col ${mine ? "items-end" : "items-start"}`}
      >
        {!mine && isSupportWelcomeMessage ? (
          <div className="mb-1 px-1">
            <span className="block text-[11px] font-semibold tracking-wide text-muted">
              Поддержка
            </span>
            <span className="block text-xs text-green-500">онлайн</span>
          </div>
        ) : null}
        <div
          className={`w-full min-w-0 max-w-full text-[15px] leading-[1.38] transition-colors duration-ui ${
            isImage
              ? "max-w-[min(78vw,280px)] overflow-hidden rounded-[1.125rem] p-0 shadow-sm"
              : `max-w-full break-words px-3 py-1.5 [overflow-wrap:anywhere] ${
                  mine
                    ? "rounded-[1.125rem] rounded-br-[0.35rem] bg-accent text-white shadow-sm"
                    : "rounded-[1.125rem] rounded-bl-[0.35rem] border border-line/65 bg-elevated text-fg shadow-sm"
                }`
          } ${
            isImage
              ? mine
                ? "ring-1 ring-white/10"
                : "ring-1 ring-line/35"
              : ""
          } ${isOptimistic ? "opacity-70" : "opacity-100"}`}
        >
          {m.deleted ? (
            <p className="px-3 py-1.5 text-[14px] leading-[1.38] italic text-gray-400">
              {mine ? "Вы удалили сообщение" : "Сообщение удалено"}
            </p>
          ) : isImage && m.image_url ? (
            <div
              className={
                mine
                  ? "min-w-0 overflow-hidden rounded-[1.125rem] rounded-br-[0.35rem]"
                  : "min-w-0 overflow-hidden rounded-[1.125rem] rounded-bl-[0.35rem]"
              }
            >
              <ChatMessageImageBubble
                message={m}
                isRetrying={imageRetryingId === m.id}
                canRetryFile={m.id.startsWith("temp-")}
                onOpen={() => onOpenLightbox(m.image_url!)}
                onRetry={() => {
                  if (m.id.startsWith("temp-")) {
                    onRetryImage(m.id);
                  }
                }}
              />
            </div>
          ) : (
            <span
              className={`block whitespace-pre-line text-[15px] leading-[1.38] [overflow-wrap:anywhere] break-words [text-size-adjust:100%] ${
                mine ? "text-right" : "text-left"
              }`}
            >
              {buildMessagePreview(m)}
            </span>
          )}
        </div>
        {!m.deleted ? (
          <div className="mt-0.5 flex min-h-[14px] shrink-0 items-center justify-end gap-1 px-0.5 text-xs text-fg/40">
            <span>{messageTime}</span>
            {mine ? (
              <MessageReadStatus
                mine
                showRead={showReadStatus}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { markChatRead, setActiveChatId, getChatRow, refreshChats, setChats } =
    useChatUnread();

  const me = session?.user?.id ?? null;
  const chatId = typeof id === "string" ? id.trim() : "";

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  /** Блокировка на загрузку/отправку изображений (текст не шарит это состояние). */
  const [sendingImage, setSendingImage] = useState(false);
  /** Вставка текстового сообщения в полёте (кнопка «→», не поле ввода). */
  const [sendingText, setSendingText] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
  const pendingImageFilesRef = useRef(new Map<string, File>());
  const pendingBlobRegistryRef = useRef(new ChatPendingBlobRegistry());
  const [imageRetryingId, setImageRetryingId] = useState<string | null>(null);
  const [isChatDragOver, setIsChatDragOver] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");
  const [peerTyping, setPeerTyping] = useState(false);
  /** Сразу при наборе — до прихода realtime у собеседника (локальный UX). */
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const isTypingLocalRef = useRef(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null);
  const [showScrollToStart, setShowScrollToStart] = useState(false);
  const [showScrollToNew, setShowScrollToNew] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [messageMenu, setMessageMenu] = useState<MessageContextMenuState | null>(null);
  const [deleteForAllPendingId, setDeleteForAllPendingId] = useState<string | null>(null);
  const [appearingMessageIds, setAppearingMessageIds] = useState<Set<string>>(
    () => new Set(),
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);
  /** Пользователь у нижнего края (не дёргать при чтении истории). */
  const isAtBottomRef = useRef(true);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastLoadedMessageIdRef = useRef<string | null>(null);
  const lastReadMarkedMessageIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const messagesRef = useRef<MessageRow[]>([]);
  const peerUserIdRef = useRef<string | null>(null);
  const peerWasOnlineRef = useRef(false);
  const peerLastPresenceAtRef = useRef<string | null>(null);
  const typingLocalStopTimerRef = useRef<number | null>(null);
  const lastTypingPulseRef = useRef(0);
  const peerTypingAtRef = useRef(0);
  const lastPeerTypingStateRef = useRef(false);
  const peerTypingIntervalRef = useRef<number | null>(null);
  const peerTypingHideTimerRef = useRef<number | null>(null);
  const typingShownAtRef = useRef(0);
  const realtimeInsertIdsRef = useRef<Set<string>>(new Set());
  const peerOfflineTimerRef = useRef<number | null>(null);
  const optimisticMessageIdSeqRef = useRef(0);
  /** Синхронный id чата (устаревшие broadcast после смены комнаты). */
  const currentChatIdRef = useRef(chatId);
  const reconnectingTypingResetPendingRef = useRef(false);
  const lastRttLogAtRef = useRef(0);
  /** Скролл вниз (auto) один раз при открытии чата, после загрузки сообщений. */
  const initialScrollForChatIdRef = useRef<string | null>(null);
  const messageAnimHydratedChatIdRef = useRef<string | null>(null);
  const messageAnimKnownIdsRef = useRef<Set<string>>(new Set());
  const supportWelcomeAnimatedForChatIdRef = useRef<string | null>(null);

  messagesRef.current = messages;

  const visibleMessages = useMemo(() => {
    if (!me) return messages;
    return messages.filter(
      (m) => !m.hidden_for_user_ids?.includes(me),
    );
  }, [messages, me]);

  const supportWelcomeMessage = useMemo<MessageRow>(() => {
    return {
      id: SUPPORT_WELCOME_MESSAGE_ID,
      chat_id: chatId,
      sender_id: SUPPORT_WELCOME_SENDER_ID,
      text: SUPPORT_WELCOME_TEXT,
      created_at: new Date().toISOString(),
      type: "text",
      image_url: null,
      voice_url: null,
      reply_to: null,
      edited_at: null,
      deleted: false,
      deleted_at: null,
      hidden_for_user_ids: [],
      status: null,
      delivered_at: null,
      read_at: null,
    };
  }, [chatId]);

  const displayMessages = useMemo(() => {
    if (!messagesLoaded || loadErr) return visibleMessages;
    if (visibleMessages.length > 0) return visibleMessages;
    return [supportWelcomeMessage];
  }, [messagesLoaded, loadErr, visibleMessages, supportWelcomeMessage]);
  const latestReadOutgoingMessageId = useMemo(() => {
    if (!me) return null;
    let candidateId: string | null = null;
    let candidateCreatedAtMs = -1;
    for (const m of displayMessages) {
      if (m.sender_id !== me) continue;
      if (!hasValidTimestamp(m.read_at)) continue;
      const createdAtMs = Date.parse(m.created_at);
      if (Number.isNaN(createdAtMs)) continue;
      if (createdAtMs >= candidateCreatedAtMs) {
        candidateCreatedAtMs = createdAtMs;
        candidateId = m.id;
      }
    }
    return candidateId;
  }, [displayMessages, me]);
  const showSupportWelcomeOnly =
    messagesLoaded &&
    !loadErr &&
    visibleMessages.length === 0 &&
    displayMessages.length === 1 &&
    displayMessages[0]?.id === SUPPORT_WELCOME_MESSAGE_ID;
  const shouldAnimateSupportWelcome =
    showSupportWelcomeOnly &&
    supportWelcomeAnimatedForChatIdRef.current !== chatId;

  const setPeerTypingStable = useCallback((newState: boolean) => {
    if (newState === lastPeerTypingStateRef.current) {
      return;
    }
    lastPeerTypingStateRef.current = newState;
    setPeerTyping(newState);
  }, []);

  const clearPeerTypingHideTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!peerTypingHideTimerRef.current) return;
    window.clearTimeout(peerTypingHideTimerRef.current);
    peerTypingHideTimerRef.current = null;
  }, []);

  const setPeerTypingWithMinVisible = useCallback(
    (active: boolean) => {
      if (active) {
        clearPeerTypingHideTimer();
        typingShownAtRef.current = Date.now();
        setPeerTypingStable(true);
        return;
      }
      const elapsed = Date.now() - typingShownAtRef.current;
      if (elapsed < MIN_TYPING_VISIBLE_MS) {
        clearPeerTypingHideTimer();
        if (typeof window !== "undefined") {
          peerTypingHideTimerRef.current = window.setTimeout(() => {
            peerTypingHideTimerRef.current = null;
            setPeerTypingStable(false);
          }, MIN_TYPING_VISIBLE_MS - elapsed);
        }
        return;
      }
      clearPeerTypingHideTimer();
      setPeerTypingStable(false);
    },
    [clearPeerTypingHideTimer, setPeerTypingStable],
  );

  useEffect(() => {
    isTypingLocalRef.current = isTypingLocal;
  }, [isTypingLocal]);

  const revokeAllPendingBlobs = useCallback(() => {
    pendingBlobRegistryRef.current.revokeAll();
    pendingImageFilesRef.current.clear();
    setImageRetryingId(null);
  }, []);

  useEffect(() => {
    return () => {
      pendingBlobRegistryRef.current.revokeAll();
      pendingImageFilesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      if (typingLocalStopTimerRef.current) {
        window.clearTimeout(typingLocalStopTimerRef.current);
        typingLocalStopTimerRef.current = null;
      }
      if (peerTypingIntervalRef.current) {
        window.clearInterval(peerTypingIntervalRef.current);
        peerTypingIntervalRef.current = null;
      }
      if (peerTypingHideTimerRef.current) {
        window.clearTimeout(peerTypingHideTimerRef.current);
        peerTypingHideTimerRef.current = null;
      }
      lastTypingPulseRef.current = 0;
      peerTypingAtRef.current = 0;
    };
  }, []);

  /** Жёсткий сброс typing при смене чата (без «залипшего печатает»). */
  useEffect(() => {
    lastTypingPulseRef.current = 0;
    peerTypingAtRef.current = 0;
    clearPeerTypingHideTimer();
    setPeerTypingStable(false);
    isTypingLocalRef.current = false;
    setIsTypingLocal(false);
  }, [chatId, clearPeerTypingHideTimer, setPeerTypingStable]);

  useEffect(() => {
    setPeerOnline(false);
    setPeerLastSeenAt(null);
    peerLastPresenceAtRef.current = null;
    setShowScrollToStart(false);
    setShowScrollToNew(false);
    setMessageMenu(null);
    setDeleteForAllPendingId(null);
    setHeaderElevated(false);
    setAppearingMessageIds(new Set());
    messageAnimHydratedChatIdRef.current = null;
    messageAnimKnownIdsRef.current = new Set();
    peerWasOnlineRef.current = false;
    reconnectingTypingResetPendingRef.current = false;
    realtimeInsertIdsRef.current.clear();
    if (typeof window !== "undefined") {
      if (typingLocalStopTimerRef.current) {
        window.clearTimeout(typingLocalStopTimerRef.current);
        typingLocalStopTimerRef.current = null;
      }
      if (peerTypingIntervalRef.current) {
        window.clearInterval(peerTypingIntervalRef.current);
        peerTypingIntervalRef.current = null;
      }
      if (peerTypingHideTimerRef.current) {
        window.clearTimeout(peerTypingHideTimerRef.current);
        peerTypingHideTimerRef.current = null;
      }
      if (peerOfflineTimerRef.current) {
        window.clearTimeout(peerOfflineTimerRef.current);
        peerOfflineTimerRef.current = null;
      }
    }
    lastTypingPulseRef.current = 0;
    peerTypingAtRef.current = 0;
    clearPeerTypingHideTimer();
    setPeerTypingStable(false);
    isTypingLocalRef.current = false;
    setIsTypingLocal(false);
    initialScrollForChatIdRef.current = null;
    isAtBottomRef.current = true;
    uploadInFlightRef.current = false;
    revokeAllPendingBlobs();
    setToast(null);
  }, [chatId, clearPeerTypingHideTimer, revokeAllPendingBlobs, setPeerTypingStable]);

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
    const n =
      currentChat.other_name?.trim() || currentChat.other_public_id?.trim();
    if (n) return n;
    if (chatId && isUuid(chatId)) return `Чат #${chatId.slice(0, 6)}`;
    return "Чат";
  }, [currentChat, chatId]);

  const isTyping = peerTyping;

  /** Подстрока: соединение / last seen (typing показываем в шапке отдельной строкой). */
  const headerSecondaryLine = useMemo(() => {
    if (roomStatus === "reconnecting")
      return { kind: "muted" as const, text: "Переподключение…" };
    if (roomStatus === "connecting")
      return { kind: "muted" as const, text: "Подключение…" };
    if (roomStatus === "error")
      return { kind: "muted" as const, text: "Offline" };
    if (currentChat?.is_group) return { kind: "empty" as const, text: "" };
    const peerId = currentChat?.other_user_id;
    if (peerId && !peerOnline && peerLastSeenAt) {
      const t = formatLastSeen(peerLastSeenAt);
      return t
        ? { kind: "muted" as const, text: `был(а) в ${t}` }
        : { kind: "empty" as const, text: "" };
    }
    if (peerId && !peerOnline) {
      return { kind: "muted" as const, text: "Offline" };
    }
    return { kind: "empty" as const, text: "" };
  }, [
    roomStatus,
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

  const sendTypingSafe = useCallback((active: boolean) => {
    if (typeof window === "undefined" || !me || !chatId || !isUuid(chatId)) {
      return;
    }
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (active) {
      if (now - lastTypingPulseRef.current < TYPING_SEND_THROTTLE_MS) return;
      lastTypingPulseRef.current = now;
    } else {
      lastTypingPulseRef.current = 0;
    }
    const sentAt = Date.now();
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("TYPING send (payload ts)", sentAt);
    }
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: {
        chat_id: chatId,
        user_id: me,
        typing: active,
        sentAt,
      },
    });
  }, [me, chatId]);

  const handleComposerChange = useCallback(
    (value: string, previousText: string) => {
      if (sendErr) setSendErr(null);
      setText(value);
      const trim = value.trim();
      if (!me || !chatId || !isUuid(chatId)) {
        if (trim.length > 0) {
          isTypingLocalRef.current = true;
          setIsTypingLocal(true);
        } else {
          isTypingLocalRef.current = false;
          setIsTypingLocal(false);
        }
        return;
      }

      if (typingLocalStopTimerRef.current) {
        window.clearTimeout(typingLocalStopTimerRef.current);
        typingLocalStopTimerRef.current = null;
      }

      if (value.length === 0) {
        isTypingLocalRef.current = false;
        setIsTypingLocal(false);
        sendTypingSafe(false);
        return;
      }

      if (!trim) {
        if (isTypingLocalRef.current) {
          isTypingLocalRef.current = false;
          setIsTypingLocal(false);
          sendTypingSafe(false);
        } else {
          setIsTypingLocal(false);
        }
        return;
      }

      isTypingLocalRef.current = true;
      setIsTypingLocal(true);

      if (!lastTypingPulseRef.current || !previousText.trim()) {
        lastTypingPulseRef.current = 0;
        sendTypingSafe(true);
      } else {
        const now = Date.now();
        if (now - lastTypingPulseRef.current >= TYPING_SEND_THROTTLE_MS) {
          sendTypingSafe(true);
        }
      }

      typingLocalStopTimerRef.current = window.setTimeout(() => {
        typingLocalStopTimerRef.current = null;
        isTypingLocalRef.current = false;
        setIsTypingLocal(false);
        sendTypingSafe(false);
      }, TYPING_LOCAL_IDLE_MS);
    },
    [me, chatId, sendErr, sendTypingSafe],
  );

  useEffect(() => {
    if (!chatId) return;
    if (typeof window === "undefined") return;
    if (peerTypingIntervalRef.current) {
      window.clearInterval(peerTypingIntervalRef.current);
      peerTypingIntervalRef.current = null;
    }
    peerTypingIntervalRef.current = window.setInterval(() => {
      const at = peerTypingAtRef.current;
      if (at > 0 && Date.now() - at > TYPING_PEER_TTL_MS) {
        peerTypingAtRef.current = 0;
        setPeerTypingWithMinVisible(false);
      }
    }, PEER_TYPING_CHECK_INTERVAL_MS);
    return () => {
      if (peerTypingIntervalRef.current) {
        window.clearInterval(peerTypingIntervalRef.current);
        peerTypingIntervalRef.current = null;
      }
    };
  }, [chatId, setPeerTypingWithMinVisible]);

  const latestMessageId = useMemo(
    () => messages[messages.length - 1]?.id ?? null,
    [messages],
  );

  const updateListScrollUi = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist < SCROLL_AT_BOTTOM_PX;
    isAtBottomRef.current = atBottom;
    stickBottomRef.current = atBottom;
    setShowScrollToNew(!atBottom);
    setHeaderElevated(el.scrollTop > 2);
    setShowScrollToStart(
      dist > FAR_FROM_BOTTOM_TOP_BTN_PX &&
        el.scrollTop > NEAR_TOP_HIDE_TOP_BTN_PX,
    );
  }, []);

  /** Мгновенно к низу (без CSS scroll-behavior). */
  const alignListToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    updateListScrollUi();
  }, [updateListScrollUi]);

  /** После commit DOM (новые узлы) — подождать кадр, затем мгновенно вниз. */
  const alignListToBottomAfterPaint = useCallback(() => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        alignListToBottom();
      });
    });
  }, [alignListToBottom]);

  useLayoutEffect(() => {
    if (!chatId || !messages.length) return;
    if (!messages.every((m) => m.chat_id === chatId)) return;
    if (initialScrollForChatIdRef.current === chatId) return;
    initialScrollForChatIdRef.current = chatId;
    isAtBottomRef.current = true;
    stickBottomRef.current = true;
    setShowScrollToStart(false);
    alignListToBottom();
  }, [chatId, messages, alignListToBottom]);

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

  const loadMessages = useCallback(async () => {
    if (!chatId || !isUuid(chatId)) return;

    setMessagesLoaded(false);
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
        setMessagesLoaded(true);
        realtimeInsertIdsRef.current.clear();
        return;
      }

      const safe = Array.isArray(data)
        ? data.map((row) => normalizeMessage(row as Record<string, unknown>))
        : [];

      if (!mountedRef.current) return;

      setMessages(sortMessages(safe));
      setMessagesLoaded(true);
      realtimeInsertIdsRef.current.clear();
      for (const row of safe) {
        if (isUuid(row.id)) realtimeInsertIdsRef.current.add(row.id);
      }
      lastLoadedMessageIdRef.current =
        safe.length > 0 ? safe[safe.length - 1].id : null;
      void markIncomingDeliveredBatch();
    } catch (error) {
      console.error("chat room load unexpected", error);
      if (!mountedRef.current) return;
      setLoadErr(FETCH_ERROR_MESSAGE);
      setMessages([]);
      setMessagesLoaded(true);
      realtimeInsertIdsRef.current.clear();
    }
  }, [chatId, markIncomingDeliveredBatch]);

  useEffect(() => {
    setMessages((prev) =>
      prev.length > MESSAGE_LIST_MAX
        ? prev.slice(-MESSAGE_LIST_KEEP)
        : prev,
    );
  }, [messages.length]);

  const markVisibleRoomRead = useCallback(
    async (explicitMessageId?: string | null) => {
      if (!chatId || !me) return;

      const targetMessageId =
        explicitMessageId ?? latestMessageId;
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

  const backfillAfterReconnect = useCallback(async () => {
    await loadMessages();
    await refreshChats({ silent: true });
  }, [loadMessages, refreshChats]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Повторный batch, если сессия появилась после первой загрузки или UPDATE не вернул строки в select. */
  useEffect(() => {
    if (!me || !isUuid(chatId)) return;
    void markIncomingDeliveredBatch();
  }, [me, chatId, markIncomingDeliveredBatch]);

  useEffect(() => {
    if (!chatId || !isUuid(chatId)) return;
    lastReadMarkedMessageIdRef.current = null;
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
    if (!chatId || !me || !isUuid(chatId)) return;
    if (!messagesLoaded) return;
    const targetId = lastLoadedMessageIdRef.current ?? latestMessageId;
    void markVisibleRoomRead(targetId);
  }, [chatId, latestMessageId, markVisibleRoomRead, me, messagesLoaded]);

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
        const presenceSeenAt = extractPresenceLastSeenAt(slice);
        if (presenceSeenAt) {
          peerLastPresenceAtRef.current = presenceSeenAt;
        }

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
        setPeerLastSeenAt(
          peerLastPresenceAtRef.current ?? new Date().toISOString(),
        );
        setPeerOnline(false);
        peerWasOnlineRef.current = false;
      };

      /** Один канал на чат: postgres (messages) + presence + broadcast("typing") — без записи в БД для «печатает…». */
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
            typing?: boolean;
            sentAt?: number;
          } | null;
          if (!payload) return;
          if (!payload.chat_id || payload.chat_id !== currentChatIdRef.current) {
            return;
          }
          if (!me) return;
          if (!payload.user_id) return;
          if (payload.user_id === me) {
            return;
          }
          if (
            process.env.NODE_ENV === "development" &&
            payload.sentAt != null &&
            typeof payload.sentAt === "number"
          ) {
            const rtt = Date.now() - payload.sentAt;
            const now = Date.now();
            if (now - lastRttLogAtRef.current >= 2000) {
              lastRttLogAtRef.current = now;
              if (rtt > 2000) {
                // eslint-disable-next-line no-console
                console.warn("⚠️ HIGH TYPING RTT (ms):", rtt);
              } else {
                // eslint-disable-next-line no-console
                console.log("TYPING RTT (ms):", rtt);
              }
            }
          }
          if (payload.typing === false) {
            peerTypingAtRef.current = 0;
            setPeerTypingWithMinVisible(false);
            return;
          }
          peerTypingAtRef.current = Date.now();
          setPeerTypingWithMinVisible(true);
        })
        .on("presence", { event: "sync" }, () => {
          if (reconnectingTypingResetPendingRef.current) {
            setPeerTypingStable(false);
            peerTypingAtRef.current = 0;
            reconnectingTypingResetPendingRef.current = false;
          }
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
            if (!newMessage.id || !String(newMessage.id).trim()) return;
            if (isUuid(newMessage.id) && realtimeInsertIdsRef.current.has(newMessage.id)) {
              return;
            }
            if (isUuid(newMessage.id)) {
              realtimeInsertIdsRef.current.add(newMessage.id);
            }

            setMessages((prev) => mergeIncomingInsert(prev, newMessage));

            lastLoadedMessageIdRef.current = newMessage.id;

            if (isAtBottomRef.current) {
              alignListToBottomAfterPaint();
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
        );

      channelRef.current = channel;

      channel.subscribe(async (status) => {
        if (!mountedRef.current || cancelled) return;

        if (status === "SUBSCRIBED") {
          reconnectingTypingResetPendingRef.current = false;
          setPeerTypingStable(false);
          peerTypingAtRef.current = 0;
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
          reconnectingTypingResetPendingRef.current = true;
          setPeerTypingStable(false);
          peerTypingAtRef.current = 0;
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            setRoomStatus("error");
            clearReconnect();
            if (typeof window !== "undefined") {
              const handleOnline = () => {
                window.removeEventListener("online", handleOnline);
                reconnectAttemptRef.current = 0;
                if (!cancelled) connect();
              };
              window.addEventListener("online", handleOnline, { once: true });
            }
            return;
          }
          const nextAttempt = Math.min(
            reconnectAttemptRef.current + 1,
            RECONNECT_MAX_ATTEMPTS,
          );
          reconnectAttemptRef.current = nextAttempt;
          if (nextAttempt >= RECONNECT_MAX_ATTEMPTS) {
            setRoomStatus("error");
            clearReconnect();
            return;
          }
          setRoomStatus("reconnecting");

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
    alignListToBottomAfterPaint,
    setPeerTypingWithMinVisible,
    setPeerTypingStable,
  ]);

  /**
   * История: после валидного chatId. Realtime+typing — в эффекте **выше** (подписка
   * стартует до окончания fetch, чтобы «печатает» и INSERT не замирали в первые секунды).
   */
  useEffect(() => {
    if (!chatId || !isUuid(chatId)) {
      setLoadErr("Некорректный id чата");
      setRoomStatus("error");
      return;
    }

    setRoomStatus("connecting");
    void loadMessages();
  }, [chatId, loadMessages]);

  useEffect(() => {
    if (!showSupportWelcomeOnly) return;
    supportWelcomeAnimatedForChatIdRef.current = chatId;
    isAtBottomRef.current = true;
    stickBottomRef.current = true;
    setShowScrollToNew(false);
    setShowScrollToStart(false);
    alignListToBottomAfterPaint();
  }, [showSupportWelcomeOnly, chatId, alignListToBottomAfterPaint]);

  useEffect(() => {
    if (!messages.length) return;
    if (isAtBottomRef.current) {
      alignListToBottomAfterPaint();
    }
  }, [messages.length, alignListToBottomAfterPaint]);

  useEffect(() => {
    if (!latestMessageId) return;

    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (
          m.chat_id === chatId &&
          m.sender_id !== me &&
          m.status !== "seen"
        ) {
          changed = true;
          return { ...m, status: "seen" as const };
        }
        return m;
      });
      return changed ? next : prev;
    });
  }, [chatId, latestMessageId, me]);

  const openMessageContextMenu = useCallback(
    (message: MessageRow, pos: { x: number; y: number }) => {
      if (!me) return;
      if (message.id.startsWith("temp-")) return;
      const mine = message.sender_id === me;
      setDeleteForAllPendingId(null);
      setMessageMenu({
        id: message.id,
        mine,
        x: Math.max(12, pos.x),
        y: Math.max(12, pos.y),
      });
    },
    [me],
  );

  const deleteMessageForMe = useCallback(
    async (messageId: string) => {
      if (!me) return;
      const row = messagesRef.current.find((m) => m.id === messageId);
      if (!row) return;
      const prevHidden = row.hidden_for_user_ids ?? [];
      const nextHidden = Array.from(new Set([...prevHidden, me]));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, hidden_for_user_ids: nextHidden }
            : m,
        ),
      );
      const { error } = await (supabase as any).rpc("hide_message_for_me", {
        p_message_id: messageId,
      });
      if (error) {
        console.error("chat hide message for me", error);
        setToast({
          type: "error",
          message: "Не удалось скрыть сообщение",
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, hidden_for_user_ids: prevHidden }
              : m,
          ),
        );
      }
    },
    [me],
  );

  const deleteMessageForAll = useCallback(
    async (messageId: string) => {
      if (!me) return;
      const row = messagesRef.current.find((m) => m.id === messageId);
      if (!row || row.sender_id !== me) return;
      const nowIso = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                deleted: true,
                deleted_at: nowIso,
                text: "",
                image_url: null,
                voice_url: null,
                pendingUpload: false,
                imageUploadFailed: false,
                imageUploadProgress: undefined,
              }
            : m,
        ),
      );

      const deletePayload: Record<string, unknown> = {
        deleted: true,
        deleted_at: nowIso,
        text: null,
        image_url: null,
        voice_url: null,
      };
      let { error } = await (supabase.from("messages") as any)
        .update(deletePayload)
        .eq("id", messageId)
        .eq("sender_id", me);

      if (error && /deleted_at/i.test(String(error.message ?? ""))) {
        const retry = await (supabase.from("messages") as any)
          .update({
            deleted: true,
            text: null,
            image_url: null,
            voice_url: null,
          })
          .eq("id", messageId)
          .eq("sender_id", me);
        error = retry.error;
      }

      if (error) {
        console.error("chat delete message for all", error);
        setToast({
          type: "error",
          message: "Не удалось удалить сообщение у всех",
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? row : m)),
        );
      }
    },
    [me],
  );

  useEffect(() => {
    if (!messageMenu && !deleteForAllPendingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMessageMenu(null);
      setDeleteForAllPendingId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageMenu, deleteForAllPendingId]);

  function send() {
    if (!text.trim()) return;
    if (!me || !chatId || !isUuid(chatId) || sendingText) return;
    if (sendingImage) return;

    setSendErr(null);
    const trimmed = text.trim();
    const tempId = `temp-${Date.now()}-${String(++optimisticMessageIdSeqRef.current)}`;
    const optimisticMessage: MessageRow = {
      id: tempId,
      chat_id: chatId,
      sender_id: me,
      text: trimmed,
      type: "text",
      created_at: new Date().toISOString(),
      deleted: false,
      hidden_for_user_ids: [],
      status: "sent",
      delivered_at: null,
      read_at: null,
    };

    setSendingText(true);
    setMessages((prev) => mergeIncomingInsert(prev, optimisticMessage));
    if (typingLocalStopTimerRef.current) {
      window.clearTimeout(typingLocalStopTimerRef.current);
      typingLocalStopTimerRef.current = null;
    }
    isTypingLocalRef.current = false;
    setIsTypingLocal(false);
    sendTypingSafe(false);
    setText("");
    isAtBottomRef.current = true;
    stickBottomRef.current = true;
    alignListToBottomAfterPaint();

    void (async () => {
      try {
        const { error } = await supabase.from("messages").insert({
          chat_id: chatId,
          sender_id: me,
          text: trimmed,
          type: "text",
          deleted: false,
          hidden_for_user_ids: [],
        });

        if (error) {
          throw error;
        }

        try {
          await refreshChats({ silent: true });
        } catch (e) {
          console.error("chat room refreshChats after text send", e);
        }
      } catch (error) {
        console.error("chat room send failed", error);
        setSendErr("Не отправлено. Нажмите, чтобы повторить");
        setMessages((prev) =>
          prev.filter((message) => message.id !== optimisticMessage.id),
        );
        setText(trimmed);
      } finally {
        setSendingText(false);
        queueMicrotask(() => textInputRef.current?.focus());
      }
    })();
  }

  async function ensureUploadSession(): Promise<boolean> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      if (typeof window !== "undefined") {
        window.alert("Нет сессии. Перезайди.");
      }
      return false;
    }

    await supabase.auth.refreshSession();
    const { data: sessionData } = await supabase.auth.getSession();
    console.log("SESSION:", sessionData);
    if (!sessionData?.session) {
      if (typeof window !== "undefined") {
        window.alert("Нет сессии. Перезайди.");
      }
      return false;
    }

    return true;
  }

  async function sendImageFile(file: File) {
    if (!me || !chatId || !isUuid(chatId)) return;
    const hasSession = await ensureUploadSession();
    if (!hasSession) return;

    const invalid = await validateChatImageFileDeep(file);
    if (invalid) {
      setToast({ type: "error", message: invalid });
      return;
    }
    if (uploadInFlightRef.current) return;
    if (sendingImage) return;

    uploadInFlightRef.current = true;
    setSendingImage(true);

    const objectUrl = URL.createObjectURL(file);
    pendingBlobRegistryRef.current.add(objectUrl);
    const tempId = `temp-${Date.now()}-${String(++optimisticMessageIdSeqRef.current)}`;
    pendingImageFilesRef.current.set(tempId, file);
    const aspect = await getAspectFromObjectUrl(objectUrl);

    const optimisticMessage: MessageRow = {
      id: tempId,
      chat_id: chatId,
      sender_id: me,
      text: "",
      type: "image",
      image_url: objectUrl,
      imageAspectRatio: aspect,
      imageUploadProgress: 0,
      created_at: new Date().toISOString(),
      deleted: false,
      hidden_for_user_ids: [],
      status: "sent",
      delivered_at: null,
      read_at: null,
      pendingUpload: true,
      imageUploadFailed: false,
    };

    setSendErr(null);
    setMessages((prev) => mergeIncomingInsert(prev, optimisticMessage));
    isAtBottomRef.current = true;
    stickBottomRef.current = true;
    alignListToBottomAfterPaint();

    const registry = pendingBlobRegistryRef.current;
    const uploadPhase = { current: "upload" as "upload" | "insert" };
    let lastStorageError: string | null = null;
    let lastInsertError: string | null = null;

    try {
      const inserted = await withUploadProgress(
        async () => {
          const blob = await compressImageForChat(file);
          const path = makeChatImageStoragePath(chatId, blob, file);
          const { error: upErr } = await supabase.storage
            .from("chat-media")
            .upload(path, blob, {
              contentType: blob.type || "image/jpeg",
              upsert: false,
            });
          if (upErr) {
            lastStorageError = upErr.message;
            console.error("chat-media upload", upErr);
            throw new Error("upload");
          }
          const { data: pub } = supabase.storage
            .from("chat-media")
            .getPublicUrl(path);
          const publicUrl = pub.publicUrl;
          uploadPhase.current = "insert";
          const { data: ins, error: insErr } = await supabase
            .from("messages")
            .insert({
              chat_id: chatId,
              sender_id: me,
              text: "",
              type: "image",
              image_url: publicUrl,
              deleted: false,
              hidden_for_user_ids: [],
            })
            .select()
            .single();
          if (insErr) {
            lastInsertError = insErr.message;
            console.error("messages insert (image)", insErr);
            throw new Error("insert");
          }
          if (!ins) {
            throw new Error("insert");
          }
          return ins;
        },
        (p) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, imageUploadProgress: p }
                : m,
            ),
          );
        },
      );
      if (inserted) {
        registry.clearTimer(tempId);
        registry.remove(objectUrl);
        pendingImageFilesRef.current.delete(tempId);
        const row = normalizeMessage(
          inserted as Record<string, unknown>,
        );
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          return mergeIncomingInsert(withoutTemp, row);
        });
        await refreshChats({ silent: true });
      }
    } catch (error) {
      console.error("chat room send image failed", { uploadPhase, error });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                pendingUpload: false,
                imageUploadFailed: true,
                imageUploadProgress: undefined,
              }
            : m,
        ),
      );
      const toastMessage =
        uploadPhase.current === "insert" && lastInsertError
          ? lastInsertError
          : uploadPhase.current === "upload" && lastStorageError
            ? lastStorageError
            : uploadPhase.current === "insert"
              ? "Ошибка отправки"
              : "Ошибка загрузки";
      setToast({
        type: "error",
        message: toastMessage,
      });
      registry.clearTimer(tempId);
      registry.scheduleFailedBlobExpiry(tempId, objectUrl, () => {
        pendingImageFilesRef.current.delete(tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      });
    } finally {
      uploadInFlightRef.current = false;
      setSendingImage(false);
    }
  }

  async function retryImageUpload(messageId: string) {
    if (!me || !chatId || !isUuid(chatId)) return;
    const hasSession = await ensureUploadSession();
    if (!hasSession) return;

    if (uploadInFlightRef.current) return;
    const file = pendingImageFilesRef.current.get(messageId);
    if (!file) {
      setToast({ type: "error", message: "Файл недоступен. Выберите снова." });
      return;
    }
    const row = messagesRef.current.find((m) => m.id === messageId);
    const previewObjectUrl = row?.image_url ?? "";
    if (!row || !previewObjectUrl) return;

    setImageRetryingId(messageId);
    uploadInFlightRef.current = true;
    setSendingImage(true);
    const registry = pendingBlobRegistryRef.current;
    registry.clearTimer(messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              pendingUpload: true,
              imageUploadFailed: false,
              imageUploadProgress: 0,
            }
          : m,
      ),
    );

    const uploadPhase = { current: "upload" as "upload" | "insert" };
    let lastStorageError: string | null = null;
    let lastInsertError: string | null = null;

    try {
      const inserted = await withUploadProgress(
        async () => {
          const blob = await compressImageForChat(file);
          const path = makeChatImageStoragePath(chatId, blob, file);
          const { error: upErr } = await supabase.storage
            .from("chat-media")
            .upload(path, blob, {
              contentType: blob.type || "image/jpeg",
              upsert: false,
            });
          if (upErr) {
            lastStorageError = upErr.message;
            console.error("chat-media upload (retry)", upErr);
            throw new Error("upload");
          }
          const { data: pub } = supabase.storage
            .from("chat-media")
            .getPublicUrl(path);
          const publicUrl = pub.publicUrl;
          uploadPhase.current = "insert";
          const { data: ins, error: insErr } = await supabase
            .from("messages")
            .insert({
              chat_id: chatId,
              sender_id: me,
              text: "",
              type: "image",
              image_url: publicUrl,
              deleted: false,
              hidden_for_user_ids: [],
            })
            .select()
            .single();
          if (insErr) {
            lastInsertError = insErr.message;
            console.error("messages insert (image retry)", insErr);
            throw new Error("insert");
          }
          if (!ins) {
            throw new Error("insert");
          }
          return ins;
        },
        (p) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, imageUploadProgress: p }
                : m,
            ),
          );
        },
      );
      if (inserted) {
        registry.clearTimer(messageId);
        if (previewObjectUrl.startsWith("blob:")) {
          registry.remove(previewObjectUrl);
        }
        pendingImageFilesRef.current.delete(messageId);
        const n = normalizeMessage(
          inserted as Record<string, unknown>,
        );
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== messageId);
          return mergeIncomingInsert(withoutTemp, n);
        });
        await refreshChats({ silent: true });
      }
    } catch (error) {
      console.error("chat image retry failed", { uploadPhase, error });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pendingUpload: false,
                imageUploadFailed: true,
                imageUploadProgress: undefined,
              }
            : m,
        ),
      );
      const toastMessage =
        uploadPhase.current === "insert" && lastInsertError
          ? lastInsertError
          : uploadPhase.current === "upload" && lastStorageError
            ? lastStorageError
            : uploadPhase.current === "insert"
              ? "Ошибка отправки"
              : "Ошибка загрузки";
      setToast({
        type: "error",
        message: toastMessage,
      });
      if (previewObjectUrl.startsWith("blob:")) {
        registry.clearTimer(messageId);
        registry.scheduleFailedBlobExpiry(messageId, previewObjectUrl, () => {
          pendingImageFilesRef.current.delete(messageId);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        });
      }
    } finally {
      setImageRetryingId(null);
      uploadInFlightRef.current = false;
      setSendingImage(false);
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
          {isTyping ? (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 transition-opacity duration-200">
              Печатает
              <span className="animate-pulse">...</span>
            </div>
          ) : (
            <div
              className={`mt-0.5 min-h-[16px] transition-opacity duration-150 ${
                headerSecondaryLine.kind === "muted"
                  ? "text-[11px] text-muted"
                  : ""
              }`}
            >
              {headerSecondaryLine.text}
            </div>
          )}
        </div>
      </header>

      {loadErr ? (
        <div className="shrink-0 p-4">
          <ErrorUi text={loadErr} />
        </div>
      ) : null}

      <div
        className={`relative flex min-h-0 flex-1 flex-col transition-shadow duration-150 ${
          isChatDragOver
            ? "ring-2 ring-inset ring-accent/45 bg-accent/[0.04]"
            : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setIsChatDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsChatDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) {
            setIsChatDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsChatDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) {
            void sendImageFile(f);
          }
        }}
      >
        {isChatDragOver ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30"
            aria-hidden
          >
            <p className="rounded-2xl bg-elevated/90 px-5 py-3 text-sm font-medium text-fg shadow-soft backdrop-blur-sm">
              Отпустите, чтобы отправить
            </p>
          </div>
        ) : null}
        {showScrollToNew && visibleMessages.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              isAtBottomRef.current = true;
              stickBottomRef.current = true;
              alignListToBottomAfterPaint();
            }}
            className="pressable absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-line/80 bg-elevated/95 px-3.5 py-1.5 text-xs font-medium text-fg shadow-md backdrop-blur-sm transition-transform duration-200 ease-out hover:bg-line/20 dark:bg-elev-2/95"
          >
            ↓ Новые сообщения
          </button>
        ) : null}
        <div
          ref={listRef}
          onScroll={updateListScrollUi}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 py-1.5"
        >
          <div className="flex min-h-full flex-col justify-end gap-px">
        {displayMessages.map((m) => (
          <ChatListMessageRow
            key={m.id}
            m={m}
            mine={m.sender_id === me}
            latestReadMessageId={latestReadOutgoingMessageId}
            isAppearing={appearingMessageIds.has(m.id)}
            animateSupportWelcome={shouldAnimateSupportWelcome}
            imageRetryingId={imageRetryingId}
            onOpenLightbox={setLightboxUrl}
            onRetryImage={retryImageUpload}
            onOpenMessageMenu={openMessageContextMenu}
          />
        ))}

        {messagesLoaded && !displayMessages.length && !loadErr ? (
          <div className="rounded-xl border border-line/60 bg-elevated/80 px-3 py-3 text-center text-xs text-muted">
            Пока нет сообщений. Напишите первым.
          </div>
        ) : null}

        <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
          </div>
        </div>

        <button
          type="button"
          aria-label="К началу чата"
          tabIndex={showScrollToStart ? 0 : -1}
          className={`pressable absolute bottom-3 right-3 z-20 flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-full border border-line/70 bg-elevated/95 text-base font-semibold text-fg shadow-md backdrop-blur-sm transition-[transform,opacity] duration-200 ease-out dark:bg-elev-2/95 ${
            showScrollToStart
              ? "translate-y-0 pointer-events-auto opacity-100"
              : "pointer-events-none translate-y-1.5 opacity-0"
          }`}
          onClick={() => {
            listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ↑
        </button>
      </div>

      <div className="shrink-0 border-t border-line/80 bg-elevated safe-pb">
        {sendErr ? (
          <button
            type="button"
            onClick={() => void send()}
            className="pressable w-full max-w-sm px-2 pt-1.5 text-left text-xs font-medium text-danger transition-opacity hover:opacity-90"
          >
            {sendErr}
          </button>
        ) : null}

        <div className="flex items-end gap-1.5 px-2 py-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void sendImageFile(f);
            }}
          />
          <button
            type="button"
            aria-label="Прикрепить фото"
            disabled={sendingImage}
            onClick={() => fileInputRef.current?.click()}
            className="pressable mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg/90 transition-colors hover:bg-line/45 active:bg-line/60 disabled:opacity-45"
          >
            <PaperclipIcon className="h-[1.15rem] w-[1.15rem] shrink-0 text-fg/85" />
          </button>
          <input
            ref={textInputRef}
            value={text}
            style={{ willChange: "transform" }}
            onChange={(e) => {
              handleComposerChange(e.target.value, text);
            }}
            className="min-h-[42px] flex-1 rounded-2xl border border-line/80 bg-main px-3.5 py-2 text-[15px] leading-[1.35] text-fg placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/30"
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
            disabled={sendingImage || sendingText || !text.trim()}
            className="pressable mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-45"
          >
            →
          </button>
        </div>
      </div>

      {messageMenu ? (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setMessageMenu(null)}
          aria-hidden
        >
          <div
            className="absolute w-48 rounded-xl border border-line/70 bg-elevated/95 p-1 shadow-soft backdrop-blur-md"
            style={{
              left: messageMenu.x,
              top: messageMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="pressable flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-elev-2"
              onClick={() => {
                const id = messageMenu.id;
                setMessageMenu(null);
                void deleteMessageForMe(id);
              }}
            >
              Удалить у меня
            </button>
            {messageMenu.mine ? (
              <button
                type="button"
                className="pressable flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                onClick={() => {
                  const id = messageMenu.id;
                  setMessageMenu(null);
                  setDeleteForAllPendingId(id);
                }}
              >
                Удалить у всех
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteForAllPendingId ? (
        <div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-main/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setDeleteForAllPendingId(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-for-all-title"
        >
          <div
            className="w-full max-w-sm rounded-card border border-line bg-elevated p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-for-all-title" className="text-base font-semibold text-fg">
              Удалить сообщение у всех?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Это действие нельзя отменить. У всех участников останется пометка
              «Сообщение удалено».
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="pressable min-h-[44px] flex-1 rounded-lg border border-line bg-transparent px-3 text-sm font-medium text-fg"
                onClick={() => setDeleteForAllPendingId(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="pressable min-h-[44px] flex-1 rounded-lg bg-danger px-3 text-sm font-semibold text-white"
                onClick={() => {
                  const id = deleteForAllPendingId;
                  setDeleteForAllPendingId(null);
                  if (!id) return;
                  void deleteMessageForAll(id);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}

      {lightboxUrl ? (
        <ChatImageLightbox
          url={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      ) : null}
    </main>
  );
}
