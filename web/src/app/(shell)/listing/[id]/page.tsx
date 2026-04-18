"use client";

import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { useAuth } from "@/context/auth-context";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import { webBoostPaymentQuery } from "@/lib/boostPay";
import { getOrCreateChat } from "@/lib/chats";
import { fetchListingById, incrementViews } from "@/lib/listings";
import { categoryLabel } from "@/lib/categories";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

// Simple toast component
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? "bg-[#22c55e]" : type === "error" ? "bg-danger" : "bg-accent";
  
  return (
    <div className={`fixed top-4 left-4 right-4 z-[100] ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg transition-all duration-300 animate-fade-in`}>
      <p className="text-sm font-medium text-center">{message}</p>
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<import("@/lib/types").ListingRow | null>(null);
  const [showStickyBoost, setShowStickyBoost] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchListingById(String(id));
        if (cancelled) return;
        if (res.row) {
          setRow(res.row);
          void incrementViews(res.row.id);
        } else {
          const msg = res.loadError ?? "Не найдено";
          console.error("FETCH ERROR", msg);
          setErr(msg);
        }
      } catch (e) {
        console.error("FETCH ERROR", e);
        setErr(FETCH_ERROR_MESSAGE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const viewerId = session?.user?.id ?? null;
  const isOwnListing = Boolean(row && viewerId && row.user_id === viewerId);
  const partnerListing = row?.is_partner_ad === true;

  useEffect(() => {
    if (!isOwnListing || partnerListing || !row) return;
    const onScroll = () => setShowStickyBoost(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isOwnListing, partnerListing, row]);

  const openChat = useCallback(async (ownerId: string) => {
    const uid = session?.user?.id;
    if (!uid) {
      router.push("/login");
      return;
    }
    if (uid === ownerId) {
      setToast({ message: "Нельзя написать самому себе", type: "error" });
      return;
    }
    setIsChatLoading(true);
    const chatRes = await getOrCreateChat(ownerId);
    setIsChatLoading(false);
    if (!chatRes.ok) {
      setToast({ message: "Не удалось открыть чат", type: "error" });
      return;
    }
    router.push(`/chat/${chatRes.id}`);
  }, [session?.user?.id, router]);

  if (loading) {
    return (
      <main className="p-5">
        <div className="aspect-[4/3] animate-skeleton rounded-card bg-elev-2" />
        <div className="mt-6 space-y-3">
          <div className="h-8 w-40 animate-skeleton rounded bg-elev-2" />
          <div className="h-4 w-full animate-skeleton rounded bg-elev-2" />
        </div>
      </main>
    );
  }
  if (err || !row) {
    return (
      <main className="p-5">
        {err === FETCH_ERROR_MESSAGE ? <ErrorUi /> : <p className="text-sm text-muted">{err ?? "Нет данных"}</p>}
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-accent transition-colors duration-ui hover:text-accent-hover">
          На ленту
        </Link>
      </main>
    );
  }

  const imgs = [...(row.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const uri = imgs[0]?.url;
  const price = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(row.price));

  const boostHref =
    viewerId && row.id ? `/payment?${webBoostPaymentQuery(String(row.id), viewerId)}` : "/login";
  const ownerPhone = row.contact_phone?.trim() || null;

  const copyPhone = useCallback(async () => {
    if (!ownerPhone) {
      setToast({ message: "Продавец не указал номер", type: "info" });
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ownerPhone);
      } else if (typeof window !== "undefined") {
        window.prompt("Скопируйте номер", ownerPhone);
      }
      setToast({ message: "Copied!", type: "success" });
    } catch (copyError) {
      console.error("COPY PHONE ERROR", copyError);
      setToast({ message: "Не удалось скопировать номер", type: "error" });
    }
  }, [ownerPhone]);

  return (
    <main className={`safe-pt ${isOwnListing && !partnerListing ? "pb-28" : "pb-8"}`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="relative aspect-[4/3] w-full bg-elev-2">
        {uri ? (
          <Image src={uri} alt="" fill className="object-cover" sizes="100vw" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-medium tracking-widest text-muted">ENIGMA</div>
        )}
      </div>
      <div className="p-5">
        <p className="text-3xl font-bold tracking-tight text-fg">{price}</p>
        <h1 className="mt-2 text-xl font-semibold leading-snug text-fg">{row.title}</h1>
        <p className="mt-3 text-sm text-muted">
          {row.city} · {categoryLabel(row.category)} · {row.view_count} просм.
        </p>
        <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-fg opacity-90">{row.description}</p>
        
        {/* Action buttons */}
        {isOwnListing ? (
          /* Owner sees: Edit + Boost */
          <div className="mt-8 space-y-3">
            <Link
              href={`/listing/edit/${row.id}`}
              className="flex w-full min-h-[56px] items-center justify-center rounded-card border border-line bg-elevated py-4 text-[16px] font-semibold text-fg transition-all duration-200 hover:bg-elev-2 hover:shadow-md active:scale-[0.98]"
            >
              ✏️ Редактировать объявление
            </Link>
            <Link
              href={boostHref}
              onClick={() => trackBoostEvent("boost_click", { listingId: row.id, own: true, surface: "listing_detail" })}
              className="flex w-full min-h-[56px] items-center justify-center rounded-[16px] bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-[16px] font-bold text-white shadow-[0_8px_32px_rgba(139,92,246,0.4)] transition-all duration-200 hover:shadow-[0_12px_40px_rgba(139,92,246,0.5)] active:scale-[0.98]"
            >
              🚀 Продвинуть
            </Link>
          </div>
        ) : (
          /* Others see: Write + Copy Phone */
          <div className="mt-8 space-y-3">
            <button
              type="button"
              disabled={isChatLoading}
              onClick={() => void openChat(row.user_id)}
              className="w-full min-h-[56px] rounded-card bg-accent py-4 text-[17px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
            >
              {isChatLoading ? "Открываем чат…" : "💬 Написать"}
            </button>
            <button
              type="button"
              onClick={() => void copyPhone()}
              className="w-full min-h-[56px] rounded-card border border-line bg-elevated py-4 text-[17px] font-semibold text-fg transition-all duration-200 hover:bg-elev-2 hover:shadow-md active:scale-[0.98]"
            >
              {ownerPhone ? "📋 Copy Phone" : "Телефон не указан"}
            </button>
            <p className="text-center text-sm text-muted">
              {ownerPhone ? ownerPhone : "Телефон не указан"}
            </p>
          </div>
        )}
      </div>
      {isOwnListing && !partnerListing ? (
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 border-t border-line/50 bg-[#0b0f14]/98 px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-300 md:left-1/2 md:max-w-md md:-translate-x-1/2 dark:bg-[#0b0f14]/98 light:bg-white/98 ${
            showStickyBoost ? "translate-y-0" : "pointer-events-none translate-y-full opacity-0"
          }`}
        >
          {/* Header */}
          <h3 className="text-center text-[18px] font-semibold tracking-tight text-fg">
            Увеличьте отклик на объявление
          </h3>
          
          {/* Subheader */}
          <p className="mt-1.5 text-center text-[14px] text-muted leading-relaxed">
            Поднимите объявление, чтобы его увидело больше людей
          </p>
          
          {/* Comparison Block */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {/* Left - Without Boost */}
            <div className="rounded-2xl bg-elevated/50 p-3.5 dark:bg-elevated/50 light:bg-gray-50/80">
              <p className="text-[12px] font-medium text-muted uppercase tracking-wide">Без продвижения</p>
              <div className="mt-2 space-y-1">
                <p className="text-[13px] text-fg"><span className="opacity-60">~</span>143 просмотра</p>
                <p className="text-[13px] text-fg">1–2 сообщения</p>
                <p className="text-[13px] text-muted">Низкая позиция</p>
              </div>
            </div>
            
            {/* Right - With Boost */}
            <div className="rounded-2xl bg-elevated/80 p-3.5 dark:bg-elevated/80 light:bg-gray-100/90 border border-accent/10">
              <p className="text-[12px] font-medium text-accent uppercase tracking-wide">С продвижением</p>
              <div className="mt-2 space-y-1">
                <p className="text-[13px] text-fg font-medium"><span className="text-accent">~</span>2 300 просмотров</p>
                <p className="text-[13px] text-fg font-medium">15+ сообщений</p>
                <p className="text-[13px] text-accent font-medium">В топе</p>
              </div>
            </div>
          </div>
          
          {/* CTA Button */}
          <Link
            href={boostHref}
            onClick={() => trackBoostEvent("boost_click", { listingId: row.id, own: true, surface: "listing_sticky" })}
            className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-[18px] bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-[16px] font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            Поднять объявление - 149 ₽
          </Link>
          
          {/* Footer */}
          <p className="mt-3 text-center text-[14px] text-muted/70">
            Больше просмотров и откликов
          </p>
        </div>
      ) : null}
    </main>
  );
}
