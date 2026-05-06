"use client";

import { listGuestMessages, markGuestChatRead, sendGuestMessage, type GuestChatMessage } from "@/lib/guestChats";
import { recordMeaningfulAction } from "@/lib/saveEnigmaFlow";
import { useRouter, useSearchParams } from "next/navigation";
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

export function GuestChatRoom({ chatId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peerUserId = String(searchParams.get("peer") ?? "").trim();
  const listingId = String(searchParams.get("listing") ?? "").trim() || null;

  const [messages, setMessages] = useState<GuestChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!chatId) return;
    const rows = await listGuestMessages(chatId);
    setMessages(rows);
    const lastIncoming = [...rows].reverse().find((m) => m.sender_role === "peer");
    if (lastIncoming?.id) {
      void markGuestChatRead(chatId, lastIncoming.id);
    }
    setLoading(false);
  }, [chatId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
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
  const sentByGuestCount = useMemo(
    () => sorted.filter((m) => m.sender_role === "guest").length,
    [sorted],
  );

  const onSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !peerUserId || sending) return;
    setSending(true);
    setError(null);
    const optimistic: GuestChatMessage = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      sender_role: "guest",
      text: trimmed,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    const res = await sendGuestMessage({
      chatId,
      peerUserId,
      text: trimmed,
      listingId,
    });
    if (!res.ok) {
      setError(res.error);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(trimmed);
    } else {
      recordMeaningfulAction("message_sent", 2);
      await refresh();
    }
    setSending(false);
  }, [chatId, listingId, peerUserId, refresh, sending, text]);

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
          <h1 className="truncate text-base font-semibold text-fg">Диалог</h1>
          <p className="truncate text-xs text-muted">
            Вы уже внутри Enigma. Сохранить аккаунт можно позже.
          </p>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {sentByGuestCount >= 3 ? (
          <div className="mb-3 rounded-card border border-line bg-elevated p-3">
            <p className="text-xs text-muted">
              Хотите сохранить этот диалог навсегда? Закрепите Enigma за аккаунтом в один шаг.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login?reason=save_enigma&source=guest_chat_after_messages")}
              className="mt-2 text-xs font-semibold text-accent"
            >
              Сохранить мой Enigma
            </button>
          </div>
        ) : null}
        {loading ? <p className="text-sm text-muted">Загружаем сообщения…</p> : null}
        <div className="space-y-2">
          {sorted.map((m) => {
            const mine = m.sender_role === "guest";
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
            placeholder="Напишите сообщение"
            className="min-h-[42px] flex-1 rounded-2xl border border-line bg-main px-3.5 py-2 text-[15px] text-fg placeholder:text-muted/65 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={sending || !text.trim() || !peerUserId}
            className="pressable min-h-[42px] rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-45"
          >
            {sending ? "..." : "Отпр."}
          </button>
        </div>
      </footer>
    </main>
  );
}
