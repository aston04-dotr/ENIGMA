"use client";

import { ErrorUi, FETCH_ERROR_MESSAGE } from "@/components/ErrorUi";
import { ListingActionsMenu, type ListingMenuAction } from "@/components/ListingActionsMenu";
import { ListingFavoriteIconButton } from "@/components/ListingFavoriteIconButton";
import { SimpleToast } from "@/components/SimpleToast";
import { ListingMetricsRow } from "@/components/ListingMetricsRow";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import {
  defaultBoostCtaPriceRub,
  defaultTopCtaPriceRub,
  defaultVipCtaPriceRub,
  webBoostPaymentQuery,
  webTopPaymentQuery,
  webVipPaymentQuery,
} from "@/lib/boostPay";
import { getOrCreateChat } from "@/lib/chats";
import {
  fetchListingFavoriteCounts,
  fetchListingById,
  incrementViews,
  normalizeListingImages,
  toggleFavorite,
} from "@/lib/listings";
import { tryLightVibrate } from "@/lib/nativeHaptics";
import { renewListingPublication } from "@/lib/listingRenewal";
import { ownerDeleteListing } from "@/lib/listingOwnerActions";
import { getListingRenewalPriceRub } from "@/lib/runtimeConfig";
import { reportListingTrustPenalty } from "@/lib/trust";
import { categoryLabel } from "@/lib/categories";
import { shareListingUrl } from "@/lib/shareListing";
import { useListingFavoriteRealtime } from "@/lib/useListingFavoriteRealtime";
import { formatRealEstateListingFacts } from "@/lib/realEstateDisplay";
import {
  chatPath,
  listingEditPath,
  listingPath,
  resolveRuntimeRouteId,
} from "@/lib/mobileRuntime";
import { primaryImageAvifUrl } from "@/lib/mediaDerivativeUrls";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  recordMeaningfulAction,
  rememberPendingChatIntent,
  rememberSaveEnigmaContinuationRoute,
} from "@/lib/saveEnigmaFlow";

const FEED_STATE_KEY = "feed_state";

export default function ListingDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const searchParams = useSearchParams();
  const rawRouteId = Array.isArray(params?.id) ? params?.id?.[0] : params?.id;
  const id = resolveRuntimeRouteId(rawRouteId, searchParams.get("id"));
  const { session } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<import("@/lib/types").ListingRow | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatOpenInFlightRef = useRef(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [renewingPublication, setRenewingPublication] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const listingActionsAnchorRef = useRef<HTMLButtonElement>(null);
  const meaningfulViewTrackedRef = useRef<string>("");

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
          if (process.env.NODE_ENV === "development") {
            console.log("LISTING DATA:", loadedRow);
          }
          setRow(loadedRow);
          if (meaningfulViewTrackedRef.current !== loadedRow.id) {
            meaningfulViewTrackedRef.current = loadedRow.id;
            recordMeaningfulAction("listing_open", 1);
          }
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
  const ownerId =
    (typeof safeItem.user_id === "string" && safeItem.user_id.trim()) ||
    (typeof (safeItem as { owner_id?: unknown }).owner_id === "string"
      ? String((safeItem as { owner_id?: unknown }).owner_id ?? "").trim()
      : "");
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
  const listingExpired = String(safeItem.status ?? "") === "expired";

  const handleRenewPublication = useCallback(async () => {
    if (!rowId) return;
    const priceRub = getListingRenewalPriceRub();
    if (priceRub > 0) {
      router.push(
        `/payment?type=listing_renew&listingId=${encodeURIComponent(rowId)}&amount=${encodeURIComponent(String(priceRub))}&title=${encodeURIComponent("Продление публикации объявления")}`,
      );
      return;
    }
    setRenewingPublication(true);
    const res = await renewListingPublication(rowId);
    setRenewingPublication(false);
    if (!res.ok) {
      setToast({
        message: res.error ?? "Не удалось продлить публикацию",
        type: "error",
      });
      return;
    }
    const refreshed = await fetchListingById(rowId);
    if (refreshed.row) setRow(refreshed.row);
    setToast({ message: "Публикация продлена на 30 дней", type: "success" });
  }, [rowId, router]);

  useEffect(() => {
    setFavoriteCountLocal(favoriteCountFromRow);
  }, [favoriteCountFromRow, rowId]);

  useEffect(() => {
    setIsFavoritedLocal(isFavoritedFromRow);
  }, [isFavoritedFromRow, rowId]);

  useListingFavoriteRealtime(rowId, setFavoriteCountLocal);

  const openChat = useCallback(
    async (sellerUserId: string) => {
      setChatError(null);

      if (!sellerUserId) {
        setChatError("Не удалось открыть чат");
        return;
      }

      const uid = session?.user?.id;
      if (!uid) {
        recordMeaningfulAction("chat_intent", 2);
        const continuation =
          rowId && String(rowId).trim().length > 0
            ? listingPath(String(rowId))
            : undefined;
        rememberSaveEnigmaContinuationRoute(continuation);
        rememberPendingChatIntent(sellerUserId, rowId || null);
        router.push("/login?reason=save_enigma&source=write_seller");
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
        const chatRes = await getOrCreateChat(sellerUserId, {
          listingId: rowId || null,
        });

        if (chatRes.ok) {
          router.push(chatPath(chatRes.id));
        } else {
          console.error(chatRes.error);
          setChatError(chatRes.error || "Не удалось открыть чат");
        }
      } finally {
        chatOpenInFlightRef.current = false;
        setIsChatLoading(false);
      }
    },
    [session?.user?.id, router],
  );

  const handleBackToFeed = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(FEED_STATE_KEY);
        if (saved) {
          router.push("/");
          return;
        }
      } catch {
        // noop
      }
    }
    if (
      typeof window !== "undefined" &&
      document.referrer &&
      document.referrer.includes(window.location.origin)
    ) {
      router.back();
      return;
    }
    router.push("/");
  }, [router]);

  const handleToggleFavorite = useCallback(() => {
    if (favoriteBusy || !rowId) return;
    if (!viewerId) {
      recordMeaningfulAction("favorite_intent", 2);
      rememberSaveEnigmaContinuationRoute();
      router.push("/login?reason=save_enigma&source=favorite");
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
    })
      .then((res) => {
        if (res.ok && res.state.isFavorited) tryLightVibrate();
      })
      .finally(() => setFavoriteBusy(false));
  }, [
    favoriteBusy,
    favoriteCountLocal,
    isFavoritedLocal,
    rowId,
    router,
    viewerId,
  ]);

  const listingSheetActions = useMemo((): ListingMenuAction[] => {
    const id = String(rowId ?? "").trim();
    if (!id) return [];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/listing/${id}`;
    const shareTitle =
      typeof safeItem.title === "string" && safeItem.title.trim()
        ? safeItem.title.trim()
        : "Объявление Enigma";

    const shareAction: ListingMenuAction = {
      id: "share",
      label: "Поделиться",
      onSelect: async () => {
        const r = await shareListingUrl({ url: shareUrl, title: shareTitle });
        if (r === "copied") {
          setToast({ message: "Ссылка скопирована в буфер обмена", type: "success" });
        } else if (r === "failed") {
          setToast({ message: "Не удалось открыть «Поделиться» или скопировать ссылку", type: "error" });
        }
      },
    };

    if (!isOwnListing) {
      return [
        {
          id: "report",
          label: "Пожаловаться",
          onSelect: () => {
            if (!viewerId) {
              recordMeaningfulAction("report_intent", 1);
              rememberSaveEnigmaContinuationRoute();
              router.push("/login?reason=save_enigma&source=report");
              return;
            }
            if (!window.confirm("Отправить жалобу на это объявление?")) return;
            void reportListingTrustPenalty(id, "listing_detail_report").then(({ error }) => {
              setToast({
                message: error ? error : "Жалоба отправлена",
                type: error ? "error" : "success",
              });
            });
          },
        },
        shareAction,
      ];
    }

    return [
      {
        id: "edit",
        label: "Редактировать",
        onSelect: () => router.push(listingEditPath(id)),
      },
      {
        id: "delete",
        label: "Удалить",
        destructive: true,
        onSelect: () => {
          if (!window.confirm("Удалить объявление безвозвратно?")) return;
          void ownerDeleteListing(id).then((res) => {
            if (!res.ok) {
              setToast({ message: res.error ?? "Не удалось удалить", type: "error" });
              return;
            }
            router.push("/profile/listings");
          });
        },
      },
      shareAction,
    ];
  }, [isOwnListing, router, rowId, viewerId, safeItem.title]);

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
  const heroAvif = uri ? primaryImageAvifUrl(uri) : null;
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
  const district =
    typeof safeItem.district === "string" && safeItem.district.trim()
      ? safeItem.district.trim()
      : "";
  const location = district ? `${city}, ${district}` : city;
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

  const listingFacts =
    category === "realestate" && row ? formatRealEstateListingFacts(row) : null;

  const boostHref =
    viewerId && rowId
      ? `/payment?${webBoostPaymentQuery(String(rowId), viewerId)}`
      : "/login";
  const topHref =
    viewerId && rowId
      ? `/payment?${webTopPaymentQuery(String(rowId), viewerId)}`
      : "/login";
  const vipHref =
    viewerId && rowId
      ? `/payment?${webVipPaymentQuery(String(rowId), viewerId)}`
      : "/login";
  const boostPriceRub = defaultBoostCtaPriceRub();
  const ownerName =
    typeof safeItem.seller?.name === "string" && safeItem.seller.name.trim()
      ? safeItem.seller.name.trim()
      : null;
  const ownerPhoneFromProfile =
    typeof safeItem.seller?.phone === "string" && safeItem.seller.phone.trim()
      ? safeItem.seller.phone.trim()
      : null;
  const ownerPhoneFromListing =
    typeof safeItem.contact_phone === "string" && safeItem.contact_phone.trim()
      ? safeItem.contact_phone.trim()
      : null;
  const ownerPhone = ownerPhoneFromProfile || ownerPhoneFromListing;

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
      setToast({ message: "Номер скопирован", type: "success" });
    } catch (copyError) {
      console.error("COPY PHONE ERROR", copyError);
      setToast({ message: "Не удалось скопировать номер", type: "error" });
    }
  }

  try {
    return (
      <main
        className="safe-pt pb-8"
      >
        {toast ? (
          <SimpleToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        ) : null}
        <ListingActionsMenu
          open={actionsOpen}
          anchorRef={listingActionsAnchorRef}
          theme={theme}
          actions={listingSheetActions}
          onClose={() => setActionsOpen(false)}
        />
        <div className="relative aspect-[4/3] w-full bg-elev-2">
          {uri ? (
            <picture className="absolute inset-0 block h-full w-full">
              {heroAvif ? <source srcSet={heroAvif} type="image/avif" /> : null}
              <Image
                src={uri}
                alt=""
                fill
                priority
                className="object-cover"
                sizes="100vw"
              />
            </picture>
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
          <div
            className="absolute right-3 top-3 z-30 flex items-center gap-2"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {!isOwnListing ? (
              <ListingFavoriteIconButton filled={isFavoritedLocal} busy={favoriteBusy} onClick={handleToggleFavorite} />
            ) : null}
            <button
              ref={listingActionsAnchorRef}
              type="button"
              aria-label="Действия"
              aria-expanded={actionsOpen}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActionsOpen((o) => !o);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all duration-150 hover:bg-black/55 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
                <circle cx="12" cy="6" r="1.65" />
                <circle cx="12" cy="12" r="1.65" />
                <circle cx="12" cy="18" r="1.65" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={handleBackToFeed}
            className="absolute left-3 top-12 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-sm font-semibold text-blue-500 shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-white active:scale-95 dark:bg-[#0b0f14]/85"
            aria-label="Назад"
          >
            <span aria-hidden>←</span>
            <span>Назад</span>
          </button>
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
          {listingFacts ? (
            <p className="mt-2 break-words text-[13px] leading-snug text-muted">{listingFacts}</p>
          ) : null}
          <p className="mt-3 text-sm text-muted">{location} · {categoryLabel(category)}</p>
          <div className="mt-2">
            <ListingMetricsRow
              views={viewCount}
              favorites={favoriteCountLocal}
              live={liveViewers ?? undefined}
              isFavorited={isFavoritedLocal}
              variant="detail"
              omitFavorite
            />
          </div>
          {listingExpired ? (
            <div className="mt-4 rounded-[14px] border border-amber-500/35 bg-amber-500/[0.09] px-4 py-3 text-[14px] leading-snug text-fg">
              {isOwnListing ? (
                <>
                  <span className="font-semibold text-amber-800 dark:text-amber-200">В архиве.</span>{" "}
                  Срок публикации истёк — объявление не показывается в ленте. Продлите публикацию, чтобы вернуть его.
                </>
              ) : (
                <>
                  <span className="font-semibold text-amber-800 dark:text-amber-200">Снято с публикации.</span>{" "}
                  Чат по объявлению недоступен; при необходимости свяжитесь по телефону ниже.
                </>
              )}
            </div>
          ) : null}
          <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-fg opacity-90">
            {description}
          </p>

          {/* Action buttons */}
          {isOwnListing ? (
            /* Owner sees: Edit + Boost */
            <div className="mt-8 space-y-3">
              {listingExpired ? (
                <button
                  type="button"
                  disabled={renewingPublication}
                  onClick={() => void handleRenewPublication()}
                  className="flex w-full min-h-[56px] items-center justify-center rounded-card border border-amber-500/30 bg-amber-500/[0.08] py-4 text-[16px] font-semibold text-amber-900 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-100 transition-all duration-200 hover:bg-amber-500/[0.12] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {renewingPublication ? "Продление…" : "Продлить публикацию"}
                </button>
              ) : null}
              <Link
                href={listingEditPath(String(rowId))}
                className="flex w-full min-h-[56px] items-center justify-center rounded-card border border-line bg-elevated py-4 text-[16px] font-semibold text-fg transition-all duration-200 hover:bg-elev-2 hover:shadow-sm active:scale-[0.98]"
              >
                Редактировать объявление
              </Link>
              {!listingExpired ? (
                <div className="space-y-2.5 pt-1">
                  <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/85">
                    Продвижение
                  </p>
                  <Link
                    href={boostHref}
                    onClick={() =>
                      trackBoostEvent("boost_click", {
                        listingId: rowId,
                        own: true,
                        surface: "listing_detail",
                      })
                    }
                    className={`flex min-h-[52px] flex-col justify-center rounded-2xl border px-4 py-3.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] ${
                      theme === "dark"
                        ? "border-[rgba(122,206,255,0.3)] bg-[linear-gradient(152deg,rgba(26,44,78,0.92)_0%,rgba(14,22,40,0.96)_55%,rgba(8,12,22,1)_100%)] shadow-[0_0_26px_rgba(84,169,255,0.12)] hover:border-[rgba(148,214,255,0.4)] hover:shadow-[0_0_36px_rgba(84,169,255,0.14)]"
                        : "border-[rgba(120,200,255,0.46)] bg-[linear-gradient(152deg,rgba(22,40,78,0.98)_0%,rgba(12,22,44,0.99)_55%,rgba(6,12,28,1)_100%)] shadow-[0_0_32px_rgba(84,169,255,0.24),0_10px_28px_rgba(29,118,232,0.14)] ring-1 ring-[rgba(120,200,255,0.22)] hover:border-[rgba(150,220,255,0.54)] hover:shadow-[0_0_42px_rgba(84,169,255,0.28)]"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold tracking-[0.14em] text-[#b8dcff]">
                        BOOST
                      </span>
                      <span className="text-[15px] tabular-nums font-bold text-[#8ecfff]">
                        {boostPriceRub} ₽
                      </span>
                    </span>
                    <span className="mt-1 text-[11px] leading-[1.28] tracking-tight text-white/48">
                      Больше показов
                    </span>
                  </Link>
                  <Link
                    href={topHref}
                    onClick={() =>
                      trackBoostEvent("top_click", {
                        listingId: rowId,
                        own: true,
                        surface: "listing_detail",
                      })
                    }
                    className={`flex min-h-[52px] flex-col justify-center rounded-2xl border px-4 py-3.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] ${
                      theme === "dark"
                        ? "border-[rgba(200,218,238,0.22)] bg-gradient-to-br from-[#1f283a]/96 via-[#141c2f]/98 to-[#0a101e] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_12px_36px_rgba(0,0,0,0.26)] hover:border-[rgba(214,228,246,0.32)]"
                        : "border-[rgba(108,118,132,0.34)] bg-[linear-gradient(168deg,#cdd3df_0%,#e2e6ef_42%,#f0f2f8_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(38,46,62,0.1),0_8px_22px_rgba(12,18,32,0.08)] ring-1 ring-black/[0.06] hover:border-[rgba(92,102,118,0.42)]"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className={`text-[12px] font-semibold tracking-[0.14em] ${theme === "dark" ? "text-[#e2ebfb]" : "text-slate-950"}`}>
                        TOP
                      </span>
                      <span className={`text-[15px] tabular-nums font-bold ${theme === "dark" ? "text-[#aabdd6]" : "text-slate-800"}`}>
                        {defaultTopCtaPriceRub()} ₽
                      </span>
                    </span>
                    <span className={`mt-1 text-[11px] leading-[1.28] tracking-tight ${theme === "dark" ? "text-slate-400/75" : "text-slate-600"}`}>
                      Выше в ленте
                    </span>
                  </Link>
                  <Link
                    href={vipHref}
                    onClick={() =>
                      trackBoostEvent("vip_click", {
                        listingId: rowId,
                        own: true,
                        surface: "listing_detail",
                      })
                    }
                    className={`flex min-h-[52px] flex-col justify-center rounded-2xl border px-4 py-3.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] ${
                      theme === "dark"
                        ? "border-[rgba(255,220,155,0.44)] bg-[linear-gradient(168deg,#1c1610_0%,#0c0a08_48%,#050504_100%)] shadow-[0_0_28px_rgba(200,150,72,0.14),inset_0_1px_0_rgba(255,215,165,0.18),inset_0_0_0_1px_rgba(84,169,255,0.06)] hover:border-[rgba(255,224,158,0.52)] hover:shadow-[0_0_36px_rgba(200,150,72,0.18)]"
                        : "border-[rgba(212,168,94,0.4)] bg-[linear-gradient(168deg,#1e2a38_0%,#151d28_52%,#0b1018_100%)] text-white ring-1 ring-[rgba(29,118,232,0.16)] shadow-[inset_0_1px_0_rgba(255,215,165,0.14),inset_0_0_0_1px_rgba(84,169,255,0.06)] hover:border-[rgba(250,200,92,0.32)]"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold tracking-[0.14em] text-[#ffedd0]">VIP</span>
                      <span className="text-[15px] tabular-nums font-bold text-[#f8d58c]">{defaultVipCtaPriceRub()} ₽</span>
                    </span>
                    <span
                      className={`mt-1 text-[11px] leading-[1.28] tracking-tight ${
                        theme === "dark" ? "text-[rgba(255,235,205,0.78)]" : "text-[rgba(245,218,168,0.76)]"
                      }`}
                    >
                      Максимальный приоритет
                    </span>
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            /* Others see: Write + Copy Phone */
            <div className="mt-8 space-y-3">
              {!listingExpired ? (
                <button
                  type="button"
                  disabled={isChatLoading}
                  onClick={() => void openChat(ownerId)}
                  className="w-full min-h-[56px] rounded-card bg-accent py-4 text-[17px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
                >
                  {isChatLoading ? "Открываем чат…" : "💬 Написать"}
                </button>
              ) : (
                <div className="flex w-full min-h-[56px] items-center justify-center rounded-card border border-line bg-elev-2 px-4 py-4 text-center text-[15px] font-semibold text-muted">
                  Чат недоступен — объявление в архиве
                </div>
              )}
              {chatError ? (
                <p className="text-sm font-medium text-danger">{chatError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void copyPhone()}
                className="w-full min-h-[56px] rounded-card border border-line bg-elevated py-4 text-[17px] font-semibold text-fg transition-all duration-200 hover:bg-elev-2 hover:shadow-md active:scale-[0.98]"
              >
                {ownerPhone ? "📋 Скопировать номер" : "Телефон не указан"}
              </button>
              {ownerName ? (
                <p className="text-center text-sm text-muted">
                  Продавец: {ownerName}
                </p>
              ) : null}
              <p className="text-center text-sm text-muted">
                {ownerPhone ? ownerPhone : "Телефон не указан"}
              </p>
            </div>
          )}
        </div>
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
