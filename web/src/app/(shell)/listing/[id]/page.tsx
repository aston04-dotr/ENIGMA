"use client";

import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { ListingMetricsRow } from "@/components/ListingMetricsRow";
import { useAuth } from "@/context/auth-context";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import { webBoostPaymentQuery } from "@/lib/boostPay";
import { getOrCreateChat } from "@/lib/chats";
import {
  fetchListingFavoriteCounts,
  fetchListingById,
  incrementViews,
  normalizeListingImages,
  toggleFavorite,
} from "@/lib/listings";
import { categoryLabel } from "@/lib/categories";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

// Simple toast component
function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === "success"
      ? "bg-[#22c55e]"
      : type === "error"
        ? "bg-danger"
        : "bg-accent";

  return (
    <div
      className={`fixed top-4 left-4 right-4 z-[100] ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg transition-all duration-300 animate-fade-in`}
    >
      <p className="text-sm font-medium text-center">{message}</p>
    </div>
  );
}

export default function ListingDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const id = Array.isArray(params?.id) ? params?.id?.[0] : params?.id;
  const { session } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<import("@/lib/types").ListingRow | null>(null);
  const [showStickyBoost, setShowStickyBoost] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatOpenInFlightRef = useRef(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (!id) {
      setErr("Не найдено");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchListingById(String(id));
        if (cancelled) return;
        if (res.row) {
          const loadedRow = res.row;
          setRow(loadedRow);
          void incrementViews(loadedRow.id).then((ok) => {
            if (!ok || cancelled) return;
            setRow((prev) =>
              prev && prev.id === loadedRow.id
                ? { ...prev, view_count: Number(prev.view_count ?? 0) + 1 }
                : prev,
            );
          });
          void fetchListingFavoriteCounts([loadedRow.id]).then((counts) => {
            if (cancelled) return;
            const fav = counts.get(loadedRow.id);
            if (fav == null) return;
            setRow((prev) =>
              prev && prev.id === loadedRow.id
                ? { ...prev, favorite_count: fav }
                : prev,
            );
          });
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

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [row?.id]);

  const viewerId = session?.user?.id ?? null;
  const safeItem = (row || {}) as Partial<import("@/lib/types").ListingRow>;
  const rowId = typeof safeItem.id === "string" ? safeItem.id : "";
  const ownerId = typeof safeItem.user_id === "string" ? safeItem.user_id : "";
  const favoriteStateRaw = safeItem as {
    is_favorited?: unknown;
    isFavorited?: unknown;
    favorite_count?: unknown;
  };
  const favoriteCountFromRow = Number.isFinite(Number(favoriteStateRaw.favorite_count))
    ? Number(favoriteStateRaw.favorite_count)
    : 0;
  const isFavoritedFromRow =
    favoriteStateRaw.is_favorited === true || favoriteStateRaw.isFavorited === true;
  const [favoriteCountLocal, setFavoriteCountLocal] = useState(favoriteCountFromRow);
  const [isFavoritedLocal, setIsFavoritedLocal] = useState(isFavoritedFromRow);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const isOwnListing = Boolean(
    row && viewerId && ownerId && ownerId === viewerId,
  );
  const partnerListing = safeItem?.is_partner_ad === true;

  useEffect(() => {
    if (!isOwnListing || partnerListing || !row) return;
    const onScroll = () => setShowStickyBoost(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isOwnListing, partnerListing, row]);

  useEffect(() => {
    setFavoriteCountLocal(favoriteCountFromRow);
  }, [favoriteCountFromRow, rowId]);

  useEffect(() => {
    setIsFavoritedLocal(isFavoritedFromRow);
  }, [isFavoritedFromRow, rowId]);

  const openChat = useCallback(
    async (sellerUserId: string) => {
      setChatError(null);

      if (!sellerUserId) {
        setChatError("Не удалось открыть чат");
        return;
      }

      const uid = session?.user?.id;
      if (!uid) {
        router.push("/login");
        return;
      }

      if (uid === sellerUserId) {
        setChatError("Не удалось открыть чат");
        return;
      }

      if (chatOpenInFlightRef.current) return;
      chatOpenInFlightRef.current = true;
      setIsChatLoading(true);
      try {
        const chatRes = await getOrCreateChat(sellerUserId);

        if (chatRes.ok) {
          router.push(`/chat/${chatRes.id}`);
        } else {
          console.error(chatRes.error);
          setChatError("Не удалось открыть чат");
        }
      } finally {
        chatOpenInFlightRef.current = false;
        setIsChatLoading(false);
      }
    },
    [session?.user?.id, router],
  );

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
        {err === FETCH_ERROR_MESSAGE ? (
          <ErrorUi />
        ) : (
          <p className="text-sm text-muted">Объявление не найдено</p>
        )}
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-accent transition-colors duration-ui hover:text-accent-hover"
        >
          На ленту
        </Link>
      </main>
    );
  }

  const images = Array.isArray(safeItem.images) ? safeItem.images : [];
  const imgs = normalizeListingImages(images).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const safeIndex =
    imgs.length > 0
      ? Math.min(Math.max(currentImageIndex, 0), imgs.length - 1)
      : 0;
  const image = imgs?.[safeIndex] || null;
  const uri = image?.url || null;
  const hasMultipleImages = imgs.length > 1;
  const title =
    typeof safeItem.title === "string" && safeItem.title.trim()
      ? safeItem.title
      : "Без названия";
  const description =
    typeof safeItem.description === "string" && safeItem.description.trim()
      ? safeItem.description
      : "Без описания";
  const city =
    typeof safeItem.city === "string" && safeItem.city.trim()
      ? safeItem.city
      : "-";
  const category =
    typeof safeItem.category === "string" ? safeItem.category : "";
  const viewCount = Number.isFinite(Number(safeItem.view_count))
    ? Number(safeItem.view_count)
    : 0;
  const liveViewersRaw = (safeItem as { live_viewers?: unknown }).live_viewers;
  const liveViewers =
    Number.isFinite(Number(liveViewersRaw)) && Number(liveViewersRaw) > 0
      ? Number(liveViewersRaw)
      : null;
  const price = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(
    Number.isFinite(Number(safeItem.price)) ? Number(safeItem.price) : 0,
  );

  const boostHref =
    viewerId && rowId
      ? `/payment?${webBoostPaymentQuery(String(rowId), viewerId)}`
      : "/login";
  const ownerPhone =
    typeof safeItem.contact_phone === "string" && safeItem.contact_phone.trim()
      ? safeItem.contact_phone.trim()
      : null;

  async function copyPhone() {
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
  }

  try {
    return (
      <main
        className={`safe-pt ${isOwnListing && !partnerListing ? "pb-28" : "pb-8"}`}
      >
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <div className="relative aspect-[4/3] w-full bg-elev-2">
          {uri ? (
            <Image
              src={uri}
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-medium tracking-widest text-muted">
              ENIGMA
            </div>
          )}
          {imgs.length > 0 ? (
            <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {safeIndex + 1} из {imgs.length}
            </div>
          ) : null}
          {hasMultipleImages ? (
            <>
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIndex((prev) =>
                    prev <= 0 ? imgs.length - 1 : prev - 1,
                  )
                }
                className="absolute left-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-black/45 text-xl font-bold text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-150 hover:bg-black/60 active:scale-95"
                aria-label="Предыдущее фото"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIndex((prev) =>
                    prev >= imgs.length - 1 ? 0 : prev + 1,
                  )
                }
                className="absolute right-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-black/45 text-xl font-bold text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-150 hover:bg-black/60 active:scale-95"
                aria-label="Следующее фото"
              >
                ›
              </button>
            </>
          ) : null}
        </div>
        <div className="p-5">
          <p className="text-3xl font-bold tracking-tight text-fg">{price}</p>
          <h1 className="mt-2 text-xl font-semibold leading-snug text-fg">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted">{city} · {categoryLabel(category)}</p>
          <div className="mt-2">
            <ListingMetricsRow
              views={viewCount}
              favorites={favoriteCountLocal}
              live={liveViewers ?? undefined}
              isFavorited={isFavoritedLocal}
              variant="detail"
              onToggleFavorite={() => {
                if (favoriteBusy || !rowId) return;
                if (!viewerId) {
                  router.push("/login");
                  return;
                }
                setFavoriteBusy(true);
                void toggleFavorite({
                  listingId: rowId,
                  state: {
                    isFavorited: isFavoritedLocal,
                    favoriteCount: favoriteCountLocal,
                  },
                  onOptimistic: (next) => {
                    setIsFavoritedLocal(next.isFavorited);
                    setFavoriteCountLocal(next.favoriteCount);
                  },
                  onRollback: (prev) => {
                    setIsFavoritedLocal(prev.isFavorited);
                    setFavoriteCountLocal(prev.favoriteCount);
                  },
                }).finally(() => setFavoriteBusy(false));
              }}
            />
          </div>
          <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-fg opacity-90">
            {description}
          </p>

          {/* Action buttons */}
          {isOwnListing ? (
            /* Owner sees: Edit + Boost */
            <div className="mt-8 space-y-3">
              <Link
                href={`/listing/edit/${rowId}`}
                className="flex w-full min-h-[56px] items-center justify-center rounded-card border border-line bg-elevated py-4 text-[16px] font-semibold text-fg transition-all duration-200 hover:bg-elev-2 hover:shadow-md active:scale-[0.98]"
              >
                ✏️ Редактировать объявление
              </Link>
              <Link
                href={boostHref}
                onClick={() =>
                  trackBoostEvent("boost_click", {
                    listingId: rowId,
                    own: true,
                    surface: "listing_detail",
                  })
                }
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
                onClick={() => void openChat(ownerId)}
                className="w-full min-h-[56px] rounded-card bg-accent py-4 text-[17px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
              >
                {isChatLoading ? "Открываем чат…" : "💬 Написать"}
              </button>
              {chatError ? (
                <p className="text-sm font-medium text-danger">{chatError}</p>
              ) : null}
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
            className={`fixed bottom-0 left-1/2 z-40 w-full -translate-x-1/2 view-mode-nav border-t border-line/50 bg-[#0b0f14]/98 px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-300 dark:bg-[#0b0f14]/98 light:bg-white/98 ${
              showStickyBoost
                ? "translate-y-0"
                : "pointer-events-none translate-y-full opacity-0"
            }`}
          >
            <Link
              href={boostHref}
              onClick={() =>
                trackBoostEvent("boost_click", {
                  listingId: rowId,
                  own: true,
                  surface: "listing_sticky",
                })
              }
              className="flex min-h-[54px] w-full items-center justify-center rounded-[18px] bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] text-[16px] font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            >
              Поднять объявление - 149 ₽
            </Link>
          </div>
        ) : null}
      </main>
    );
  } catch (e) {
    console.error("LISTING CRASH:", e);
    return (
      <main className="p-5">
        <div className="rounded-card border border-line bg-elevated p-4 text-sm text-fg">
          Ошибка загрузки объявления
        </div>
      </main>
    );
  }
}
