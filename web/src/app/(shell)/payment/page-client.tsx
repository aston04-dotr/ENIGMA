"use client";

import { useAuth } from "@/context/auth-context";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import { defaultBoostCtaPriceRub } from "@/lib/boostPay";
import { parsePromotionTariffKind } from "@/lib/monetization";
import { logPaymentEvent } from "@/lib/paymentLogs";
import type { PersistedPaymentCheckout } from "@/lib/paymentReturnSession";
import {
  clearPersistedPaymentCheckout,
  readPersistedPaymentCheckout,
  writePersistedPaymentCheckout,
} from "@/lib/paymentReturnSession";
import { validatePromotionPaymentAmount } from "@/lib/paymentValidation";
import { createPaymentIntent, type PaymentRail } from "@/lib/payments";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense, type ReactNode } from "react";

const RAILS: { id: PaymentRail; title: string }[] = [
  { id: "sbp", title: "СБП" },
  { id: "sber", title: "СберБанк" },
  { id: "tinkoff", title: "Тинькофф" },
  { id: "card_mir", title: "Карта" },
];

const POLL_INTERVAL_MS = 2300;
const POLL_DEADLINE_MS = 82_000;

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

type PaymentUiState = "idle" | "creating" | "pending" | "failed";

function activationCopy(ctx: PersistedPaymentCheckout): { headline: string; subtitle: string } {
  const p = ctx.promoKind.toLowerCase().trim();
  if (p === "listing_pack" || p === "listing_slot_pack") {
    const slots = ctx.listingPackSlots?.trim();
    return {
      headline: "Лимит объявлений расширен",
      subtitle: slots
        ? `+${slots} активных мест применены к аккаунту. Уточнить баланс — в профиле.`
        : "Дополнительная ёмкость уже на аккаунте — см. профиль.",
    };
  }
  if (p === "renew_30" || p === "renewal_30" || p === "listing_renew_30") {
    return {
      headline: "Объявление продлено",
      subtitle: "Срок активности карточки обновлён.",
    };
  }
  if (p === "top_7" || p === "top7") {
    return {
      headline: "Продвижение активировано",
      subtitle: "TOP закреплён в выдаче на срок тарифа.",
    };
  }
  if (p === "vip_3" || p === "vip_7" || p === "vip_30") {
    return {
      headline: "Продвижение активировано",
      subtitle: "VIP-статус и приоритет в ленте на срок тарифа.",
    };
  }
  if (p === "boost_3" || p === "boost_7") {
    return {
      headline: "Продвижение активировано",
      subtitle: "BOOST уже усиливает показы объявления.",
    };
  }
  return {
    headline: "Продвижение активировано",
    subtitle: "Изменения применены — можно вернуться к объявлению или ленте.",
  };
}

function PremiumShell(props: {
  eyebrow: string;
  headline: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <main className="safe-pt px-5 pb-12 pt-8">
      <div
        className="rounded-card border border-line bg-elevated p-7 shadow-soft"
        style={{
          boxShadow: "var(--shadow-card), 0 0 40px var(--enigma-glow-accent)",
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{props.eyebrow}</p>
        <h1 className="mt-4 text-[1.35rem] font-bold leading-snug text-fg">{props.headline}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{props.subtitle}</p>
        {props.children ? <div className="mt-8 space-y-3">{props.children}</div> : null}
      </div>
    </main>
  );
}

export default function PaymentPageClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const { session, authResolved } = useAuth();
  const amountStr = sp.get("amount");
  const amountNum = amountStr ? Number(amountStr) : NaN;
  const hasAmount = Number.isFinite(amountNum) && amountNum > 0;
  /** Свежий переход на оплату с лендинга карточки — не подмешиваем старый pending из sessionStorage. */
  const hasFreshPayIntent = hasAmount;
  const orderTitle = (sp.get("title") ?? "").trim() || "Оплата на ENIGMA";
  const listingId = sp.get("listingId");
  const promoKindRaw = sp.get("promoKind");
  const listingPackSlotsRaw = sp.get("listingPackSlots");
  const showBoostPreview = Boolean(listingId && isBoostTariff(promoKindRaw));
  const defaultBoostPrice = defaultBoostCtaPriceRub();

  const [rail, setRail] = useState<PaymentRail>("sbp");
  const [paymentState, setPaymentState] = useState<PaymentUiState>("idle");
  const [checkoutHydrated, setCheckoutHydrated] = useState(false);
  const [returnCheckout, setReturnCheckout] = useState<PersistedPaymentCheckout | null>(null);
  /** Опрос YooKassa после возврата по return_url. */
  const [activationPhase, setActivationPhase] = useState<
    "idle" | "polling" | "done" | "timeout" | "failed"
  >("idle");
  const [completedCheckout, setCompletedCheckout] = useState<PersistedPaymentCheckout | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  /** Редкий случай без redirect (mock / тест провайдера). */
  const [deferNotice, setDeferNotice] = useState<{ title: string; subtitle: string } | null>(null);

  const busy = paymentState === "creating" || paymentState === "pending";

  const description = useMemo(() => `ENIGMA - ${orderTitle}`, [orderTitle]);

  useLayoutEffect(() => {
    if (hasFreshPayIntent) {
      clearPersistedPaymentCheckout();
      setReturnCheckout(null);
      setActivationPhase("idle");
    } else {
      const c = readPersistedPaymentCheckout();
      setReturnCheckout(c);
      if (c) {
        setActivationPhase("polling");
      } else {
        setActivationPhase("idle");
      }
    }
    setCheckoutHydrated(true);
  }, [hasFreshPayIntent]);

  useEffect(() => {
    if (showBoostPreview && listingId) {
      trackBoostEvent("boost_payment_open", {
        listingId,
        promoKind: promoKindRaw,
      });
    }
  }, [showBoostPreview, listingId, promoKindRaw]);

  const resolvedPollingRef = useRef(false);

  useEffect(() => {
    resolvedPollingRef.current = false;
    if (!checkoutHydrated || !returnCheckout || !authResolved || !session?.user?.id) {
      return;
    }

    const checkout = returnCheckout;
    let intervalId = 0;
    let watchdogId = 0;
    let cancelled = false;

    async function probeOnce(): Promise<boolean> {
      try {
        const res = await fetch(
          `/api/payment/status?paymentId=${encodeURIComponent(checkout.paymentId)}`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            resolvedPollingRef.current = true;
            setActivationPhase("failed");
            clearPersistedPaymentCheckout();
            setReturnCheckout(null);
          }
          return true;
        }
        if (!res.ok) return false;
        const data = (await res.json()) as {
          ok?: boolean;
          status?: "pending" | "succeeded" | "failed";
        };
        if (!data.ok) return false;

        if (data.status === "succeeded") {
          if (!cancelled) {
            resolvedPollingRef.current = true;
            setCompletedCheckout(checkout);
            setActivationPhase("done");
            clearPersistedPaymentCheckout();
            setReturnCheckout(null);

            const pk = checkout.promoKind?.trim().toLowerCase();
            if (pk === "boost_3" || pk === "boost_7") {
              trackBoostEvent("boost_payment_activated_ui", {
                listingId: checkout.listingId ?? undefined,
                promoKind: pk,
              });
            }
          }
          return true;
        }
        if (data.status === "failed") {
          if (!cancelled) {
            resolvedPollingRef.current = true;
            setActivationPhase("failed");
            clearPersistedPaymentCheckout();
            setReturnCheckout(null);
          }
          return true;
        }
      } catch {
        /* следующий интервал */
      }
      return false;
    }

    setActivationPhase("polling");

    void (async () => {
      await probeOnce();
    })();

    intervalId = window.setInterval(() => {
      void (async () => {
        const done = await probeOnce();
        if (done || cancelled) {
          window.clearInterval(intervalId);
        }
      })();
    }, POLL_INTERVAL_MS);

    watchdogId = window.setTimeout(() => {
      if (cancelled || resolvedPollingRef.current) return;
      resolvedPollingRef.current = true;
      window.clearInterval(intervalId);
      clearPersistedPaymentCheckout();
      setReturnCheckout(null);
      setActivationPhase("timeout");
    }, POLL_DEADLINE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(watchdogId);
    };
  }, [checkoutHydrated, returnCheckout, authResolved, session?.user?.id]);

  useEffect(() => {
    if (!checkoutHydrated || !authResolved) return;
    if (!session?.user?.id && returnCheckout) {
      clearPersistedPaymentCheckout();
      setReturnCheckout(null);
      setActivationPhase("idle");
    }
  }, [checkoutHydrated, authResolved, session?.user?.id, returnCheckout]);

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
        setErrorNotice(amountCheck.reason ?? "Сумма не прошла проверку.");
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

    setErrorNotice(null);
    setDeferNotice(null);
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
        writePersistedPaymentCheckout({
          paymentId: intent.id,
          promoKind: promoKindRaw ?? "",
          listingId: lid,
          orderTitle,
          listingPackSlots: listingPackSlotsRaw?.trim() ?? null,
        });
        window.location.assign(intent.confirmationUrl);
        return;
      }

      setDeferNotice({
        title: "Запрос принят",
        subtitle:
          "Платёж создан без редиректа (тестовый режим). Подтверждение придёт как обычно; при необходимости обновите объявление.",
      });
    } catch (e) {
      setPaymentState("failed");
      const code = e instanceof Error ? e.message : "";
      if (code === "yookassa_upstream") {
        setErrorNotice(
          "Не удалось открыть страницу ЮKassa. Проверьте лимиты аккаунта YooKassa и лог сервера /api/payment/create.",
        );
      } else {
        setErrorNotice(
          code && code.startsWith("payment_create_")
            ? "Не удалось создать платёж. Проверьте сеть и повторите."
            : "Не удалось создать платёж. Попробуйте снова или откройте поддержку.",
        );
      }
    } finally {
      setTimeout(() => {
        setPaymentState((prev) => (prev === "failed" ? "idle" : prev));
      }, 1400);
    }
  }

  if (!checkoutHydrated) {
    return (
      <main className="safe-pt px-5 pt-10">
        <p className="text-sm text-muted">Загрузка…</p>
      </main>
    );
  }

  if (activationPhase === "polling" && returnCheckout) {
    return (
      <PremiumShell
        eyebrow="Enigma"
        headline="Активируем…"
        subtitle="Обычно несколько секунд после возврата с оплаты. Не закрывайте вкладку."
      >
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full w-[38%] animate-pulse rounded-full bg-accent/35" />
        </div>
      </PremiumShell>
    );
  }

  if (activationPhase === "done" && completedCheckout) {
    const lid = completedCheckout.listingId?.trim();
    const pack = completedCheckout.promoKind.toLowerCase().trim().includes("pack");
    const showListing = Boolean(lid) && !pack;
    const copy = activationCopy(completedCheckout);
    return (
      <PremiumShell eyebrow="Enigma" headline={copy.headline} subtitle={copy.subtitle}>
        {showListing ? (
          <Link
            href={`/listing/${lid}`}
            className="flex min-h-[50px] w-full items-center justify-center rounded-card border border-accent/45 bg-gradient-to-r from-accent/15 via-accent/10 to-transparent text-[15px] font-semibold text-fg hover:border-accent/70"
          >
            К объявлению
          </Link>
        ) : (
          <Link
            href="/profile"
            className="flex min-h-[50px] w-full items-center justify-center rounded-card border border-line bg-main/35 text-[15px] font-semibold text-fg hover:border-accent/40"
          >
            В профиль
          </Link>
        )}
        <Link
          href="/"
          className="flex min-h-[48px] w-full items-center justify-center rounded-card border border-line text-sm font-semibold text-muted hover:border-accent/30 hover:text-fg"
        >
          На ленту
        </Link>
      </PremiumShell>
    );
  }

  if (activationPhase === "timeout") {
    return (
      <PremiumShell
        eyebrow="Enigma"
        headline="Почти готово"
        subtitle="Иногда начисление занимает до минуты. Обновите карточку объявления или откройте профиль."
      >
        <Link
          href="/profile"
          className="flex min-h-[50px] w-full items-center justify-center rounded-card border border-accent/45 bg-main/35 text-[15px] font-semibold text-fg hover:border-accent/70"
        >
          Профиль
        </Link>
        <Link
          href="/"
          className="flex min-h-[48px] w-full items-center justify-center rounded-card border border-line text-sm font-semibold text-muted hover:border-accent/30 hover:text-fg"
        >
          На ленту
        </Link>
      </PremiumShell>
    );
  }

  if (activationPhase === "failed") {
    return (
      <PremiumShell
        eyebrow="Enigma"
        headline="Оплата не завершена"
        subtitle="Если средства списали, статус скоро обновится автоматически. Иначе начните оплату заново из объявления."
      >
        <Link
          href="/"
          className="flex min-h-[50px] w-full items-center justify-center rounded-card border border-line text-[15px] font-semibold text-fg hover:border-accent/40"
        >
          На ленту
        </Link>
      </PremiumShell>
    );
  }

  if (deferNotice) {
    return (
      <PremiumShell
        eyebrow="Enigma"
        headline={deferNotice.title}
        subtitle={deferNotice.subtitle}
      >
        <Link
          href="/"
          className="flex min-h-[48px] w-full items-center justify-center rounded-card border border-line text-sm font-semibold text-fg hover:border-accent/40"
        >
          На ленту
        </Link>
      </PremiumShell>
    );
  }

  if (errorNotice) {
    return (
      <main className="safe-pt px-5 pb-12 pt-8">
        <div className="rounded-card border border-line bg-elevated p-6 shadow-soft">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Не удалось</p>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--color-danger)" }}>
            {errorNotice}
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-card border border-line px-6 text-sm font-semibold text-fg hover:border-accent/40"
          >
            На ленту
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="safe-pt boost-fade-in px-5 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-semibold text-accent hover:text-accent-hover"
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
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">К оплате</p>
        {hasAmount ? (
          <p className="mt-2 text-3xl font-extrabold text-fg">{formatRub(amountNum)}</p>
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

      <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted">Способ оплаты</p>
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
                  ? "border-accent/65 bg-accent/10 text-fg shadow-[inset_0_0_0_1px_var(--color-accent-muted)]"
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
              className="flex h-[52px] w-full items-center justify-center rounded-card enigma-premium-save enigma-premium-save--extended text-[15px] font-semibold shadow-soft transition-all duration-200 active:scale-[0.985] disabled:opacity-60"
            >
              {busy
                ? "…"
                : showBoostPreview
                  ? `Оплатить ${hasAmount ? amountNum : defaultBoostPrice} ₽`
                  : `Оплатить ${formatRub(amountNum)}`}
            </button>
            {showBoostPreview ? (
              <p className="mt-2 text-center text-[12px] leading-snug text-muted">
                После оплаты активируем продвижение — статус ниже после возврата
              </p>
            ) : null}
          </>
        ) : (
          <Link
            href="/"
            className="flex h-12 w-full items-center justify-center rounded-card border border-line text-sm font-semibold hover:border-accent/35"
          >
            На ленту
          </Link>
        )}
      </div>
    </main>
  );
}
