"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-main">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/"
          className="mb-8 inline-block text-sm font-medium text-accent transition-colors duration-ui hover:text-accent-hover"
        >
          ← На ленту
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-fg">Политика конфиденциальности</h1>
        <p className="mb-6 text-xs text-muted">Последнее обновление: 2026</p>

        <section className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
          {`ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ

Платформа ENIGMA обрабатывает следующие данные:
— email
— номер телефона (при наличии)
— технические данные

Данные используются для:
— авторизации
— работы сервиса
— уведомлений

Платформа не передаёт данные третьим лицам, за исключением случаев, предусмотренных законодательством Российской Федерации.`}
        </section>
      </div>
    </main>
  );
}
