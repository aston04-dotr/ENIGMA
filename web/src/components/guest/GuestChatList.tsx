"use client";

import { EmptyState } from "@/components/EmptyState";
import { listGuestChats, type GuestChatRow } from "@/lib/guestChats";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function formatTimeLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function GuestChatList() {
  const router = useRouter();
  const [rows, setRows] = useState<GuestChatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await listGuestChats();
    setRows(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 7000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const tb = Date.parse(b.last_message_at || b.last_message_created_at || "");
        const ta = Date.parse(a.last_message_at || a.last_message_created_at || "");
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      }),
    [rows],
  );

  if (loading) {
    return <main className="safe-pt px-5 py-8 text-sm text-muted">Подгружаем ваши диалоги…</main>;
  }

  if (!sorted.length) {
    return (
      <main className="safe-pt px-5 py-8">
        <EmptyState title="Пока нет диалогов" subtitle="Откройте объявление и напишите продавцу." />
      </main>
    );
  }

  return (
    <main className="safe-pt min-h-screen bg-main px-5 pb-6 pt-8">
      <h1 className="text-[26px] font-bold tracking-tight text-fg">Диалоги</h1>
      <p className="mt-2 text-sm text-muted">
        Ваши сообщения уже здесь. Сохранить аккаунт можно в любой момент.
      </p>

      <ul className="mt-5 space-y-3">
        {sorted.map((row) => (
          <li key={row.chat_id}>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/chat/${row.chat_id}?guest=1&peer=${encodeURIComponent(row.peer_user_id)}${
                    row.listing_id ? `&listing=${encodeURIComponent(row.listing_id)}` : ""
                  }`,
                )
              }
              className="pressable flex w-full items-center justify-between gap-3 rounded-card border border-line bg-elevated p-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{row.other_name}</span>
                <span className="mt-1 block truncate text-xs text-muted">
                  {row.last_message_text?.trim() || "Диалог начат"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[11px] text-muted">
                  {formatTimeLabel(row.last_message_created_at || row.last_message_at)}
                </span>
                {row.unread_count > 0 ? (
                  <span className="mt-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff4d67] px-1 text-[10px] font-bold text-white">
                    {row.unread_count > 99 ? "99+" : row.unread_count}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
