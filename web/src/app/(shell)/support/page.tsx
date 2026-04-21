"use client";

import { useAuth } from "@/context/auth-context";
import { createSupportTicket } from "@/lib/support";
import Link from "next/link";
import { useMemo, useState } from "react";

type SupportTopic = "payment" | "listing" | "login" | "error" | "other";

const TOPICS: { id: SupportTopic; title: string }[] = [
  { id: "payment", title: "Проблема с оплатой" },
  { id: "listing", title: "Объявление не размещено" },
  { id: "login", title: "Не могу войти" },
  { id: "error", title: "Ошибка в приложении" },
  { id: "other", title: "Другое" },
];

function topicAnswer(topic: SupportTopic): string {
  if (topic === "payment") {
    return "Платёж отправлен на проверку. Обычно это занимает 5-10 минут.";
  }
  if (topic === "listing") {
    return "Проверьте:\n- заполнены ли поля\n- добавлены ли фото\n- нет ли ограничений категории";
  }
  if (topic === "login") {
    return "Попробуйте:\n- перезапустить приложение\n- запросить новую ссылку\n- проверить интернет";
  }
  if (topic === "error") {
    return "Опишите проблему - мы уже работаем над этим.";
  }
  return "Опишите ситуацию в поле ниже и отправьте заявку оператору.";
}

export default function SupportPage() {
  const { session } = useAuth();
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const answer = useMemo(() => (topic ? topicAnswer(topic) : ""), [topic]);

  async function escalateToOperator() {
    const userId = session?.user?.id;
    if (!userId) {
      setNotice("Нужно войти в аккаунт.");
      return;
    }

    const finalText = [
      topic ? `Тема: ${topic}` : "Тема: не выбрана",
      answer ? `Ответ бота: ${answer}` : null,
      message.trim() ? `Сообщение: ${message.trim()}` : "Сообщение: без текста",
    ]
      .filter(Boolean)
      .join("\n");

    setBusy(true);
    setNotice(null);

    const res = await createSupportTicket({
      user_id: userId,
      message: finalText,
      type: topic ?? "other",
      status: "open",
    });

    notifyAdmin({
      type: "support_ticket",
      user_id: userId,
      message: finalText,
    });

    setBusy(false);

    if (!res.ok) {
      setNotice("Не удалось создать заявку в базе, но сообщение отправлено на почту поддержки.");
      return;
        notifyByEmail: true,
    }
    <main className="safe-pt min-h-screen bg-main px-5 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-accent">← Назад</Link>
      </div>

      <h1 className="text-xl font-bold text-fg">Поддержка</h1>
      <p className="mt-2 text-sm text-muted">Выберите тему и получите быстрый ответ.</p>

      <div className="mt-5 space-y-2">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTopic(t.id);
              if (notice) setNotice(null);
            }}
            className={`w-full min-h-[48px] rounded-card border px-4 py-3 text-left text-sm font-semibold transition-colors ${
              topic === t.id ? "border-accent bg-accent/10 text-fg" : "border-line bg-elevated text-fg"
            }`}
          >
            {t.title}
          </button>
        ))}
      </div>

      {topic ? (
        <div className="mt-5 rounded-card border border-line bg-elevated p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{answer}</p>
        </div>
      ) : null}

      {topic === "other" ? (
        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Опишите проблему</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-card border border-line bg-elevated px-4 py-3 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/35"
            placeholder="Введите сообщение"
          />
        </div>
      ) : null}

      {notice ? <p className="mt-4 text-sm font-medium text-accent">{notice}</p> : null}

      <button
        type="button"
        onClick={() => void escalateToOperator()}
        disabled={busy || !topic}
        className="pressable mt-6 min-h-[52px] w-full rounded-card bg-accent py-3.5 text-base font-semibold text-white transition-colors duration-ui hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Отправка..." : "Связаться с оператором"}
      </button>
    </main>
  );
}
