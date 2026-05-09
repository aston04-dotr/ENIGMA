import { Suspense } from "react";
import PaymentPageClient from "./page-client";

/** useSearchParams + post-YooKassa return без статического prerender. */
export const dynamic = "force-dynamic";

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="safe-pt p-5">
          <p className="text-sm text-muted">Загрузка…</p>
        </main>
      }
    >
      <PaymentPageClient />
    </Suspense>
  );
}
