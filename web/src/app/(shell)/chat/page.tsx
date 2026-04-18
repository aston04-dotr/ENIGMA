"use client";

import { EmptyState } from "@/components/EmptyState";
import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { logSupabaseResult } from "@/lib/postgrestErrors";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Row = { id: string; displayName: string; preview: string };

export default function ChatsPage() {
  const { session } = useAuth();
  const me = session?.user?.id;
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoadErr(null);
    try {
      const sentRes = await supabase
        .from("messages")
        .select("chat_id,created_at")
        .eq("sender_id", me)
        .order("created_at", { ascending: false })
        .limit(500);

      logSupabaseResult("messages_sent", { data: sentRes.data, error: sentRes.error });

      const chatIds = [
        ...new Set(
          (sentRes.data ?? [])
            .map((r) => r.chat_id)
            .filter((chatId): chatId is string => typeof chatId === "string" && chatId.length > 0)
        ),
      ];
      if (!chatIds.length) {
        setRows([]);
        return;
      }

      const chatsRes = await supabase
        .from("chats")
        .select("id,created_at")
        .in("id", chatIds)
        .order("created_at", { ascending: false });

      const chats = chatsRes.data;
      if (chatsRes.error || !chats?.length) {
        setRows([]);
        return;
      }

      const enriched: Row[] = [];
      for (const c of chats) {
        const lastRes = await supabase
          .from("messages")
          .select("text")
          .eq("chat_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let preview = "Напишите первым";
        const last = lastRes.data;
        if (last?.text) preview = String(last.text).slice(0, 80);

        const displayName = `Чат ${String(c.id).slice(0, 8)}`;
        enriched.push({ id: c.id, displayName, preview });
      }
      setRows(Array.isArray(enriched) ? enriched : []);
    } catch (e) {
      console.error("FETCH ERROR", e);
      setLoadErr(FETCH_ERROR_MESSAGE);
      setRows([]);
    }
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) {
    return (
      <main className="safe-pt px-5 pb-8 pt-10">
        <p className="text-sm text-muted">Войдите, чтобы видеть чаты.</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-accent transition-colors duration-ui hover:text-accent-hover">
          Войти
        </Link>
      </main>
    );
  }

  return (
    <main className="safe-pt min-h-screen bg-main px-5 pb-6 pt-8">
      <h1 className="text-[26px] font-bold tracking-tight text-fg">Чаты</h1>
      {loadErr ? (
        <div className="mt-4">
          <ErrorUi />
        </div>
      ) : null}
      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => router.push(`/chat/${r.id}`)}
              className="pressable flex w-full min-h-[56px] items-center gap-4 rounded-card border border-line bg-elevated p-4 text-left shadow-soft transition-shadow duration-ui hover:border-accent/25"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elev-2 text-sm font-semibold text-fg">
                {r.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{r.displayName}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{r.preview}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !loadErr ? (
        <EmptyState title="Нет переписок" subtitle="Нет чатов. Пока ничего нет." />
      ) : null}
    </main>
  );
}
