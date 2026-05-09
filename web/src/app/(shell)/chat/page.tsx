"use client";

import { EmptyState } from "@/components/EmptyState";
import { ErrorUi } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import { chatPath } from "@/lib/mobileRuntime";
import { normalizeChatParticipantName } from "@/lib/guestIdentity";
import { rememberSaveEnigmaContinuationRoute } from "@/lib/saveEnigmaFlow";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function formatTimeLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function buildPreview(row: {
  last_message_deleted?: boolean | null;
  last_message_image_url?: string | null;
  last_message_voice_url?: string | null;
  last_message_text?: string | null;
}): string {
  if (row.last_message_deleted) return "Сообщение удалено";
  if (row.last_message_image_url) return "📷 Фото";
  if (row.last_message_voice_url) return "🎤 Голосовое";
  if (row.last_message_text?.trim()) return row.last_message_text.trim();
  return "—";
}

function buildDisplayName(row: {
  chat_id: string;
  is_group?: boolean;
  title?: string | null;
  other_name?: string | null;
  other_public_id?: string | null;
}): string {
  if (row.is_group) {
    return row.title?.trim() || "Группа";
  }
  const n = row.other_name?.trim() || row.other_public_id?.trim();
  if (n) return normalizeChatParticipantName(n);
  return `Chat №${row.chat_id.slice(0, 6)}`;
}

function formatUnreadCount(value: number): string {
  if (value > 99) return "99+";
  return String(value);
}

function ChatListingThumb({
  listingImage,
  displayName,
  otherAvatar,
  unread,
}: {
  listingImage?: string | null;
  displayName: string;
  otherAvatar?: string | null;
  unread?: number;
}) {
  const trimmedImage = String(listingImage ?? "").trim();
  const trimmedAvatar = String(otherAvatar ?? "").trim();
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-line bg-elev-2">
      {trimmedImage ? (
        <img src={trimmedImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-base">
          📦
        </span>
      )}

      <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-main text-[10px] font-semibold text-fg dark:border-[#0b0e14]">
        {trimmedAvatar ? (
          <img src={trimmedAvatar} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      {Number(unread ?? 0) > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex h-3 w-3 rounded-full border border-white bg-[#ff4d67] dark:border-[#0b0e14]" />
      ) : null}
    </span>
  );
}

export default function ChatsPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { rows, loading, ready: chatReady, error, refreshChats } = useChatUnread();
  const [systemNotices, setSystemNotices] = useState<
    import("@/lib/listingNotices").ListingOwnerNoticeRow[]
  >([]);
  const [noticesLoading, setNoticesLoading] = useState(false);

  const loadNotices = async () => {
    if (!session?.user?.id) {
      setSystemNotices([]);
      return;
    }
    setNoticesLoading(true);
    try {
      const { fetchListingOwnerNotices } = await import("@/lib/listingNotices");
      const list = await fetchListingOwnerNotices(20);
      setSystemNotices(list);
    } finally {
      setNoticesLoading(false);
    }
  };

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ts = (r: (typeof rows)[number]) =>
          r.last_message_at || r.last_message_created_at || r.created_at;
        const tb = new Date(ts(b)).getTime();
        const ta = new Date(ts(a)).getTime();
        return tb - ta;
      }),
    [rows],
  );

  useEffect(() => {
    if (!session?.user) return;
    void refreshChats();
    void loadNotices();
  }, [refreshChats, session?.user]);

  useEffect(() => {
    if (!session?.user) return;
    const onFocusLike = () => {
      void refreshChats({ silent: true });
      void loadNotices();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onFocusLike();
      }
    };
    window.addEventListener("focus", onFocusLike);
    window.addEventListener("pageshow", onFocusLike);
    window.addEventListener("online", onFocusLike);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocusLike);
      window.removeEventListener("pageshow", onFocusLike);
      window.removeEventListener("online", onFocusLike);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadNotices, refreshChats, session?.user]);

  if (!session?.user) {
    return (
      <main className="safe-pt min-h-screen bg-main px-5 pb-6 pt-10">
        <h1 className="text-[26px] font-bold tracking-tight text-fg">Чаты</h1>
        <div className="mt-5 rounded-card border border-line bg-elevated p-4">
          <p className="text-sm text-muted">
            Войдите по почте, чтобы видеть диалоги с продавцами и отправлять сообщения.
          </p>
          <button
            type="button"
            onClick={() => {
              rememberSaveEnigmaContinuationRoute("/chat");
              router.push("/login?returnTo=%2Fchat&source=guest_chat_gate");
            }}
            className="pressable mt-4 min-h-[48px] w-full rounded-card bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Продолжить с почтой
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="safe-pt min-h-screen bg-main px-5 pb-6 pt-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-tight text-fg">Чаты</h1>
        <button
          type="button"
          onClick={() => {
            void refreshChats();
            void loadNotices();
          }}
          className="pressable min-h-[40px] rounded-full border border-line px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted transition-colors duration-ui hover:text-fg"
        >
          Обновить
        </button>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorUi text={error} />
        </div>
      ) : null}

      {systemNotices.length > 0 ? (
        <section className="mt-6 space-y-2" aria-label="Уведомления по объявлениям">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Уведомления
          </p>
          <ul className="space-y-2">
            {systemNotices.map((n) => (
              <li
                key={n.id}
                className="rounded-card border border-accent/25 bg-accent/8 px-4 py-3 text-left shadow-soft"
              >
                <p className="text-[13px] leading-snug text-fg">{n.body}</p>
                <p className="mt-2 text-[11px] text-muted">{formatTimeLabel(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : noticesLoading ? (
        <p className="mt-4 text-xs text-muted">Загрузка уведомлений…</p>
      ) : null}

      {(loading || !chatReady) && sortedRows.length === 0 ? (
        <ul className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <li
              key={idx}
              className="animate-skeleton rounded-card border border-line bg-elevated p-4"
            >
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 shrink-0 rounded-full bg-elev-2" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-32 rounded bg-elev-2" />
                  <div className="mt-2 h-3 w-48 rounded bg-elev-2" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-muted">Диалоги</p>

      <ul className="mt-3 space-y-3">
        {sortedRows.map((row) => {
          const displayName = buildDisplayName(row);
          const preview = buildPreview(row);
          const timeLabel = formatTimeLabel(
            row.last_message_created_at ||
              row.last_message_at ||
              row.created_at,
          );
          const unread = Math.max(0, Number(row.unread_count || 0));

          return (
            <li key={row.chat_id}>
              <button
                type="button"
                onClick={() => router.push(chatPath(row.chat_id))}
                className="pressable flex w-full items-center gap-4 rounded-card border border-line bg-elevated p-4 text-left shadow-soft transition-shadow duration-ui hover:border-accent/25"
              >
                <ChatListingThumb
                  listingImage={row.listing_image}
                  displayName={displayName}
                  otherAvatar={row.other_avatar}
                  unread={unread}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold text-fg">
                      {displayName}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-muted">
                      {timeLabel}
                    </span>
                  </span>

                  <span className="mt-1 flex items-center justify-between gap-3">
                    <span
                      className={`block min-w-0 truncate text-xs ${
                        unread > 0 ? "text-fg" : "text-muted"
                      }`}
                    >
                      {preview}
                    </span>

                    {unread > 0 ? (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#ff4d67] px-1.5 text-[10px] font-bold text-white">
                        {formatUnreadCount(unread)}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!loading && chatReady && sortedRows.length === 0 && !error ? (
        <EmptyState
          title="Нет переписок"
          subtitle="Откройте объявление и нажмите «Написать»."
        />
      ) : null}

      {!loading && chatReady && !rows.length ? (
        <div className="mt-6">
          <Link
            href="/"
            className="inline-block text-sm font-semibold text-accent transition-colors duration-ui hover:text-accent-hover"
          >
            На ленту
          </Link>
        </div>
      ) : null}
    </main>
  );
}
