"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="mb-8 inline-block text-sm font-medium text-[#2563eb] hover:underline">
          ← На сайт
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Политика конфиденциальности</h1>
        <p className="mb-6 text-xs text-neutral-600">Последнее обновление: 2026</p>

        <section className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">
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

        <p className="mt-8 text-sm text-neutral-600">
          Вопросы по данным:{" "}
          <a href="mailto:support@enigma-app.online" className="text-[#2563eb] hover:underline">
            support@enigma-app.online
          </a>
        </p>
      </div>
    </main>
  );
}
