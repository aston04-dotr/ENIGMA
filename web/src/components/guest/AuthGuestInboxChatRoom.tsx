"use client";

import {
  listIncomingGuestMessages,
  markIncomingGuestChatRead,
  sendIncomingGuestReply,
  type GuestChatMessage,
} from "@/lib/guestChats";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  chatId: string;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AuthGuestInboxChatRoom({ chatId }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<GuestChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!chatId) return;
    const rows = await listIncomingGuestMessages(chatId);
    setMessages(rows);
    const lastIncoming = [...rows].reverse().find((m) => m.sender_role === "guest");
    if (lastIncoming?.id) {
      void markIncomingGuestChatRead(chatId, lastIncoming.id);
    }
    setLoading(false);
  }, [chatId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const sorted = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const ta = Date.parse(a.created_at);
        const tb = Date.parse(b.created_at);
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      }),
    [messages],
  );

  const onSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    const optimistic: GuestChatMessage = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      sender_role: "peer",
      text: trimmed,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    const res = await sendIncomingGuestReply(chatId, trimmed);
    if (!res.ok) {
      setError(res.error);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(trimmed);
    } else {
      await refresh();
    }
    setSending(false);
  }, [chatId, refresh, sending, text]);

  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden bg-main">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-elevated/95 px-3 py-3 safe-pt">
        <button
          type="button"
          onClick={() => router.push("/chat")}
          className="pressable min-h-[44px] min-w-[44px] rounded-full px-2 text-sm font-medium text-accent"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-fg">Пользователь Enigma</h1>
          <p className="truncate text-xs text-muted">Входящее сообщение от гостя</p>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? <p className="text-sm text-muted">Загружаем сообщения…</p> : null}
        <div className="space-y-2">
          {sorted.map((m) => {
            const mine = m.sender_role === "peer";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-accent text-white" : "border border-line bg-elevated text-fg"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className={`mt-1 text-[11px] ${mine ? "text-white/80" : "text-muted"}`}>
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="safe-pb border-t border-line bg-elevated/95 px-3 py-2">
        {error ? <p className="mb-2 text-xs font-medium text-danger">{error}</p> : null}
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ответить пользователю"
            className="min-h-[42px] flex-1 rounded-2xl border border-line bg-main px-3.5 py-2 text-[15px] text-fg placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={sending || !text.trim()}
            className="pressable min-h-[42px] rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-45"
          >
            {sending ? "..." : "Отпр."}
          </button>
        </div>
      </footer>
    </main>
  );
}
