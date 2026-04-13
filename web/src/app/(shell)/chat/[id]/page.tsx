"use client";

import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import type { MessageRow } from "@/lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const me = session?.user?.id;
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadErr(null);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("FETCH ERROR", error);
        setLoadErr(FETCH_ERROR_MESSAGE);
        setMessages([]);
        return;
      }
      const safe = data ?? [];
      if (!Array.isArray(safe)) {
        console.error("FETCH ERROR", "messages not array");
        setLoadErr(FETCH_ERROR_MESSAGE);
        setMessages([]);
        return;
      }
      setMessages(safe as MessageRow[]);
    } catch (e) {
      console.error("FETCH ERROR", e);
      setLoadErr(FETCH_ERROR_MESSAGE);
      setMessages([]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`msg:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
          if (stickBottom.current) requestAnimationFrame(scrollToBottom);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id, scrollToBottom]);

  useEffect(() => {
    if (stickBottom.current) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  async function send() {
    if (!me || !id || !text.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      chat_id: id,
      sender_id: me,
      text: text.trim(),
    });
    setSending(false);
    if (!error) {
      setText("");
      scrollToBottom();
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
        <button type="button" onClick={() => router.back()} className="pressable min-h-[44px] min-w-[44px] rounded-full px-2 text-sm font-medium text-accent">
          ←
        </button>
        <span className="font-semibold text-fg">Чат</span>
      </header>
      {loadErr ? (
        <div className="p-4">
          <ErrorUi />
        </div>
      ) : null}
      <div
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          stickBottom.current = near;
        }}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-smooth"
      >
        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[min(85%,20rem)] rounded-[2rem] px-4 py-2.5 text-[15px] leading-relaxed transition-colors duration-ui ${
                  mine
                    ? "bg-accent text-white shadow-soft"
                    : "border border-line bg-elevated text-fg shadow-soft"
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line bg-elevated p-3 safe-pb">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[48px] flex-1 rounded-full border border-line bg-main px-4 text-base text-fg placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/35"
          placeholder="Сообщение…"
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending}
          className="pressable flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-accent text-lg font-bold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
        >
          →
        </button>
      </div>
    </main>
  );
}
