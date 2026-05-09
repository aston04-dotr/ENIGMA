"use client";

import { useAuth } from "@/context/auth-context";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import { defaultBoostCtaPriceRub } from "@/lib/boostPay";
import { parsePromotionTariffKind } from "@/lib/monetization";
import { logPaymentEvent } from "@/lib/paymentLogs";
import { validatePromotionPaymentAmount } from "@/lib/paymentValidation";
import { createPaymentIntent, type PaymentRail } from "@/lib/payments";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";

const RAILS: { id: PaymentRail; title: string }[] = [
  { id: "sbp", title: "СБП" },
  { id: "sber", title: "СберБанк" },
  { id: "tinkoff", title: "Тинькофф" },
  { id: "card_mir", title: "Карта" },
];

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function isBoostTariff(k: string | null): boolean {
  return k === "boost_3" || k === "boost_7";
}

type PaymentUiState = "idle" | "creating" | "pending" | "confirmed" | "failed";

function PaymentInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { session } = useAuth();
  const amountStr = sp.get("amount");
  const amountNum = amountStr ? Number(amountStr) : NaN;
  const hasAmount = Number.isFinite(amountNum) && amountNum > 0;
  const orderTitle = (sp.get("title") ?? "").trim() || "Оплата на ENIGMA";
  const listingId = sp.get("listingId");
  const promoKindRaw = sp.get("promoKind");
  const uidParam = sp.get("uid");
  const listingPackSlotsRaw = sp.get("listingPackSlots");
  const showBoostPreview = Boolean(listingId && isBoostTariff(promoKindRaw));
  const defaultBoostPrice = defaultBoostCtaPriceRub();

  const [rail, setRail] = useState<PaymentRail>("sbp");
  const [paymentState, setPaymentState] = useState<PaymentUiState>("idle");
  const [successHeadline, setSuccessHeadline] = useState<string | null>(null);
  const busy = paymentState === "creating" || paymentState === "pending";

  const description = useMemo(() => `ENIGMA - ${orderTitle}`, [orderTitle]);

  useEffect(() => {
    if (showBoostPreview && listingId) {
      trackBoostEvent("boost_payment_open", {
        listingId,
        promoKind: promoKindRaw,
      });
    }
  }, [showBoostPreview, listingId, promoKindRaw]);

  async function pay() {
    if (!session?.user?.id) {
      router.push("/login");
      return;
    }
    if (!hasAmount) return;

    const uid = session.user.id;
    const lid = listingId?.trim() ?? null;
    const tariffKind = parsePromotionTariffKind(promoKindRaw);
    let secureAmount = amountNum;

    if (tariffKind) {
      const amountCheck = validatePromotionPaymentAmount(tariffKind, amountNum);
      if (!amountCheck.valid) {
        setPaymentState("failed");
        setSuccessHeadline(amountCheck.reason ?? "Сумма не прошла проверку.");
        logPaymentEvent({
          user_id: uid,
          listing_id: lid,
          promoKind: tariffKind,
          amount: amountNum,
          status: "invalid",
        });
        return;
      }
      secureAmount = amountCheck.normalizedAmountRub;
    }

    setPaymentState("creating");
    logPaymentEvent({
      user_id: uid,
      listing_id: lid,
      promoKind: promoKindRaw,
      amount: secureAmount,
      status: "creating",
    });

    try {
      const intent = await createPaymentIntent(
        rail,
        secureAmount,
        description,
        {
          user_id: uid,
          listing_id: lid ?? "",
          promoKind: promoKindRaw ?? "",
          listing_pack_slots: listingPackSlotsRaw?.trim() ?? "",
        },
      );

      setPaymentState("pending");
      logPaymentEvent({
        user_id: uid,
        listing_id: lid,
        promoKind: promoKindRaw,
        amount: secureAmount,
        payment_id: intent.id,
        status: "pending",
      });

      if (intent.confirmationUrl) {
        window.location.assign(intent.confirmationUrl);
        return;
      }

      setSuccessHeadline("Платёж создан. Подтверждение ожидается автоматически через webhook.");
    } catch {
      setPaymentState("failed");
      setSuccessHeadline("Платёж завершился с ошибкой. Попробуйте снова.");
    } finally {
      setTimeout(() => {
        setPaymentState((prev) => (prev === "failed" ? "idle" : prev));
      }, 1200);
    }
  }

  if (successHeadline) {
    return (
      <main className="safe-pt px-5 pb-10 pt-6">
        <p className="text-lg font-semibold leading-snug text-fg">
          {successHeadline}
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-card border border-line px-6 text-sm font-bold text-fg"
        >
          На ленту
        </Link>
      </main>
    );
  }

  return (
    <main className="safe-pt boost-fade-in px-5 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-semibold text-[#7dd3fc]"
        >
          ← Назад
        </button>
      </div>
      <h1 className="text-xl font-bold text-fg">Оплата</h1>

      {showBoostPreview ? (
        <div className="mt-5 rounded-card border border-line bg-main/40 p-4">
          <p className="text-[15px] font-medium text-fg">Продвижение в ленте</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Ненавязчиво усилим видимость объявления другим пользователям
          </p>
        </div>
      ) : null}

      <div className="mt-6 rounded-card border border-line bg-elevated p-5 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          К оплате
        </p>
        {hasAmount ? (
          <p className="mt-2 text-3xl font-extrabold text-fg">
            {formatRub(amountNum)}
          </p>
        ) : (
          <p className="mt-2 text-xl text-muted">-</p>
        )}
        <p className="mt-3 text-sm font-medium text-fg">{orderTitle}</p>
        {!hasAmount ? (
          <p className="mt-3 text-sm text-muted">
            Откройте оплату с карточки объявления или из раздела продвижения.
          </p>
        ) : null}
      </div>

      <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted">
        Способ оплаты
      </p>
      <div className="mt-3 space-y-2">
        {RAILS.map((r) => {
          const on = rail === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRail(r.id)}
              className={`flex w-full min-h-[48px] items-center rounded-card border px-4 text-left text-sm font-semibold transition-colors ${
                on
                  ? "border-[#7B4FE8] bg-[rgba(123,79,232,0.12)] text-fg"
                  : "border-line bg-elevated text-fg"
              }`}
            >
              {r.title}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-1/2 z-40 w-full -translate-x-1/2 border-t border-line bg-main/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md view-mode-nav">
        {hasAmount ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pay()}
              className={`flex h-[52px] w-full items-center justify-center rounded-card text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${
                showBoostPreview
                  ? "border border-line bg-elevated text-fg hover:bg-elev-2"
                  : "bg-gradient-to-r from-[#9353FF] via-[#7B4FE8] to-[#22d3ee] text-white hover:brightness-110"
              }`}
            >
              {busy
                ? "…"
                : showBoostPreview
                  ? `Оплатить ${hasAmount ? amountNum : defaultBoostPrice} ₽`
                  : `Оплатить ${formatRub(amountNum)}`}
            </button>
            {showBoostPreview ? (
              <p className="mt-2 text-center text-[12px] leading-snug text-muted/65">
                После оплаты объявление получит усиление в соответствии с выбранным тарифом
              </p>
            ) : null}
          </>
        ) : (
          <Link
            href="/"
            className="flex h-12 w-full items-center justify-center rounded-card border border-line text-sm font-semibold"
          >
            На ленту
          </Link>
        )}
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="safe-pt p-5">
          <p className="text-sm text-muted">Загрузка…</p>
        </main>
      }
    >
      <PaymentInner />
    </Suspense>
  );
}
