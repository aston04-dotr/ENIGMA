"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-main px-6 pb-12 pt-[max(2rem,env(safe-area-inset-top))]">
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-accent transition-colors duration-ui hover:text-accent-hover"
      >
        ← На ленту
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-fg">
        Пользовательское соглашение
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        Пользовательское соглашение Enigma. В разработке.
      </p>
    </main>
  );
}
