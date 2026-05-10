"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { categoryLabel } from "@/lib/categories";
import { ListingActionsMenu, type ListingMenuAction } from "@/components/ListingActionsMenu";
import { ListingFavoriteIconButton } from "@/components/ListingFavoriteIconButton";
import { SimpleToast } from "@/components/SimpleToast";
import { ListingMetricsRow } from "@/components/ListingMetricsRow";
import { trackEvent } from "@/lib/analytics";
import { defaultBoostCtaPriceRub, defaultVipCtaPriceRub, defaultTopCtaPriceRub, webBoostPaymentQuery, webVipPaymentQuery, webTopPaymentQuery } from "@/lib/boostPay";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import { isBoostActive, isTopActive, isVipActive } from "@/lib/monetization";
import {
  PROMOTION_LABEL,
  PROMO_CARD_CLASS,
  promoCardBoostTop,
  promoCardLeftTop,
} from "@/lib/promotionUi";
import { promotionTierForAnalytics } from "@/lib/promotionAnalytics";
import { usePromotionImpressionRef } from "@/lib/usePromotionImpression";
import { ownerDeleteListing } from "@/lib/listingOwnerActions";
import { normalizeListingImages, toggleFavorite } from "@/lib/listings";
import { tryLightVibrate } from "@/lib/nativeHaptics";
import type { ListingRow } from "@/lib/types";
import { shareListingUrl } from "@/lib/shareListing";
import {
  recordMeaningfulAction,
  rememberSaveEnigmaContinuationRoute,
} from "@/lib/saveEnigmaFlow";
import { reportListingTrustPenalty } from "@/lib/trust";
import { useListingFavoriteRealtime } from "@/lib/useListingFavoriteRealtime";
import { formatRealEstateListingFacts } from "@/lib/realEstateDisplay";
import { listingEditPath, listingPath } from "@/lib/mobileRuntime";
import { primaryImageThumbUrl } from "@/lib/mediaDerivativeUrls";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const listingCardShell = (isLight: boolean): CSSProperties =>
  isLight
    ? {
        borderColor: "rgba(29, 118, 232, 0.16)",
        backgroundImage:
          "linear-gradient(172deg, rgba(255,255,255,0.98) 0%, rgba(236,246,255,0.95) 40%, rgba(226,237,253,1) 100%)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.98) inset, 0 1px 3px rgba(15,52,110,0.06), 0 18px 42px rgba(15,52,110,0.1), 0 0 0 0.65px rgba(29,118,232,0.08), 0 0 48px rgba(29,118,232,0.05)",
      }
    : {
        borderColor: "rgba(100, 180, 255, 0.14)",
        backgroundImage:
          "linear-gradient(175deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 35%, transparent 72%), radial-gradient(90% 60% at 12% -4%, rgba(84,169,255,0.09), transparent 58%), linear-gradient(180deg, rgba(18,26,42,0.65) 0%, rgba(8,11,18,0.92) 100%)",
        boxShadow:
          "0 1px 0 rgba(133,210,255,0.1) inset, 0 8px 24px rgba(0,0,0,0.28), 0 28px 56px rgba(0,8,22,0.48), 0 0 40px rgba(84,169,255,0.045)",
      };

function formatPriceNumber(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

/** Длинные суммы: легче по весу, без «тяжёлой» строки из цифр. */
function listingPricePresentation(n: number): {
  amountClass: string;
  rubClass: string;
  rowGapClass: string;
} {
  const abs = Math.floor(Math.abs(Number(n)));
  const digits =
    Number.isFinite(abs) && abs > 0 ? abs.toString().length : 1;
  if (digits >= 10) {
    return {
      rowGapClass: "gap-1.5",
      amountClass:
        "text-[21px] sm:text-[22px] font-medium tabular-nums tracking-[-0.018em]",
      rubClass: "text-[14px] font-normal tabular-nums tracking-normal align-baseline",
    };
  }
  if (digits >= 8) {
    return {
      rowGapClass: "gap-1.5",
      amountClass: "text-[24px] font-medium tabular-nums tracking-[-0.021em]",
      rubClass: "text-[15px] font-medium tabular-nums tracking-normal align-baseline",
    };
  }
  return {
    rowGapClass: "gap-2",
    amountClass: "text-[26px] font-semibold tabular-nums tracking-[-0.02em]",
    rubClass: "text-[17px] font-medium tabular-nums tracking-normal align-baseline",
  };
}

type Props = {
  item?: ListingRow | null;
  index?: number;
  compact?: boolean;
  /** В ленте/списках из многих карточек — false, чтобы не открывать N realtime-каналов на favorite_count */
  favoriteRealtime?: boolean;
  /** Виртуализованная лента: отступ снизу даёт wrapper, чтобы measureElement включал промежуток */
  omitOuterMargin?: boolean;
  onOpen?: () => void;
};

function LocationTinyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

function EyeTinyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

export function ListingCard({
  item,
  index = 0,
  compact = false,
  favoriteRealtime = true,
  omitOuterMargin = false,
  onOpen,
}: Props) {
  const { session } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const safeItem = item && typeof item === "object" ? (item as ListingRow) : null;

  const imgs = normalizeListingImages(
    (safeItem as ListingRow & { images?: unknown } | null)?.images,
  ).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const uri = imgs[0]?.url?.trim() ?? null;
  /** Сначала пробуем thumb (если .webp); при 404 падаем обратно на оригинал — иначе серый «broken». */
  const thumbCandidate = uri ? primaryImageThumbUrl(uri) : null;
  const [heroSrc, setHeroSrc] = useState<string | null>(null);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [heroFatal, setHeroFatal] = useState(false);
  const heroFallbackTriedRef = useRef(false);

  useEffect(() => {
    if (!uri) {
      setHeroSrc(null);
      setHeroLoaded(false);
      setHeroFatal(false);
      heroFallbackTriedRef.current = false;
      return;
    }
    setHeroSrc(thumbCandidate ?? uri);
    setHeroLoaded(false);
    setHeroFatal(false);
    heroFallbackTriedRef.current = false;
  }, [uri, thumbCandidate]);

  const listingCardImgSrc = heroSrc;
  const itemTitle =
    typeof safeItem?.title === "string" && safeItem.title.trim()
      ? safeItem.title
      : "Без названия";
  const itemCity =
    typeof safeItem?.city === "string" && safeItem.city.trim()
      ? safeItem.city
      : "Город не указан";
  const itemDistrict =
    typeof safeItem?.district === "string" && safeItem.district.trim()
      ? safeItem.district.trim()
      : "";
  const itemLocation = itemDistrict ? `${itemCity}, ${itemDistrict}` : itemCity;
  const boosted = safeItem ? isBoostActive(safeItem) : false;
  const topActive = safeItem ? isTopActive(safeItem) : false;
  const vipActive = safeItem ? isVipActive(safeItem) : false;
  const lid = String(safeItem?.id ?? "").trim();
  const viewerId = session?.user?.id ?? null;
  const isOwn = Boolean(viewerId && safeItem?.user_id && safeItem.user_id === viewerId);
  const partner = safeItem?.is_partner_ad === true;
  const views = Number.isFinite(Number(safeItem?.view_count))
    ? Number(safeItem?.view_count)
    : 0;
  const favorites = Number.isFinite(Number(safeItem?.favorite_count))
    ? Number(safeItem?.favorite_count)
    : 0;
  const liveViewersRaw = (safeItem as ListingRow & { live_viewers?: unknown } | null)
    ?.live_viewers;
  const liveViewers =
    Number.isFinite(Number(liveViewersRaw)) && Number(liveViewersRaw) > 0
      ? Number(liveViewersRaw)
      : null;
  const favoriteStateRaw = (safeItem ?? {}) as {
    is_favorited?: unknown;
    isFavorited?: unknown;
  };
  const isFavorited =
    favoriteStateRaw.is_favorited === true || favoriteStateRaw.isFavorited === true;
  const [favoriteCountLocal, setFavoriteCountLocal] = useState(favorites);
  const [isFavoritedLocal, setIsFavoritedLocal] = useState(isFavorited);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const listingActionsAnchorRef = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const priceRub = defaultBoostCtaPriceRub();

  useListingFavoriteRealtime(
    favoriteRealtime ? lid : null,
    setFavoriteCountLocal,
  );

  const listingSheetActions = useMemo((): ListingMenuAction[] => {
    const id = String(lid ?? "").trim();
    if (!id) return [];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/listing/${id}`;
    const shareAction: ListingMenuAction = {
      id: "share",
      label: "Поделиться",
      onSelect: async () => {
        const r = await shareListingUrl({ url: shareUrl, title: itemTitle });
        if (r === "copied") {
          setToast({ message: "Ссылка скопирована в буфер обмена", type: "success" });
        } else if (r === "failed") {
          setToast({ message: "Не удалось открыть «Поделиться» или скопировать ссылку", type: "error" });
        }
      },
    };

    if (!isOwn) {
      return [
        {
          id: "report",
          label: "Пожаловаться",
          onSelect: () => {
            if (!viewerId) {
              router.push("/login");
              return;
            }
            if (!window.confirm("Отправить жалобу на это объявление?")) return;
            void reportListingTrustPenalty(id, "feed_report").then(({ error }) => {
              if (error && process.env.NODE_ENV === "development") {
                console.warn("reportListingTrustPenalty", error);
              }
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
              if (process.env.NODE_ENV === "development") {
                console.warn("ownerDeleteListing", res.error);
              }
              return;
            }
            router.push("/profile/listings");
          });
        },
      },
      shareAction,
    ];
  }, [isOwn, itemTitle, lid, router, viewerId]);

  useEffect(() => {
    setFavoriteCountLocal(favorites);
  }, [favorites, lid]);

  useEffect(() => {
    setIsFavoritedLocal(isFavorited);
  }, [isFavorited, lid]);

  function boostHref(): string {
    if (!viewerId || !lid) return "/login";
    if (!isOwn) return listingPath(lid);
    return `/payment?${webBoostPaymentQuery(lid, viewerId)}`;
  }

  function vipHref(): string {
    if (!viewerId || !lid) return "/login";
    if (!isOwn) return listingPath(lid);
    return `/payment?${webVipPaymentQuery(lid, viewerId)}`;
  }

  function topHref(): string {
    if (!viewerId || !lid) return "/login";
    if (!isOwn) return listingPath(lid);
    return `/payment?${webTopPaymentQuery(lid, viewerId)}`;
  }

  const numericPrice = Number(safeItem?.price ?? 0);
  const priceStyle = listingPricePresentation(numericPrice);
  const reFacts =
    safeItem?.category === "realestate" && safeItem
      ? formatRealEstateListingFacts(safeItem as ListingRow, { compact: true })
      : null;

  const imageHeightClass = compact
    ? "aspect-[16/11] max-h-[200px] min-h-[144px] sm:aspect-video sm:min-h-[160px] lg:h-auto lg:aspect-video lg:max-h-none"
    : "h-[216px] sm:h-[236px] lg:h-auto lg:aspect-video";
  const contentSpacingClass = compact
    ? "flex flex-col gap-2 px-[15px] py-3.5 sm:px-4 sm:py-4"
    : "flex flex-col gap-2.5 p-4 sm:p-[14px]";

  function handleToggleFavorite() {
    if (favoriteBusy || !lid) return;
    if (!viewerId) {
      recordMeaningfulAction("favorite_intent", 2);
      rememberSaveEnigmaContinuationRoute();
      router.push("/login?reason=save_enigma&source=favorite");
      return;
    }
    setFavoriteBusy(true);
    void toggleFavorite({
      listingId: lid,
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
    }).then((res) => {
      if (res.ok && res.state.isFavorited) tryLightVibrate();
    }).finally(() => setFavoriteBusy(false));
  }

  const shellStyle = useMemo(
    (): CSSProperties => ({
      ...listingCardShell(theme === "light"),
      animationDelay: `${Math.min(index, 10) * 35}ms`,
    }),
    [theme, index],
  );

  const promoTierForImpression =
    safeItem != null ? promotionTierForAnalytics(safeItem) : ("none" as const);
  const promoImpressionRef = usePromotionImpressionRef({
    listingId: lid,
    tier: promoTierForImpression,
    surface: "feed",
    enabled: promoTierForImpression !== "none",
  });

  if (!safeItem || !lid) return null;

  return (
    <div
      ref={promoImpressionRef}
      className={`feed-card-enter group relative overflow-hidden rounded-[22px] border bg-transparent transition-[transform,box-shadow] duration-[140ms] ease-out max-md:active:scale-[0.985] md:duration-[145ms] md:hover:-translate-y-[1px] ${omitOuterMargin ? "" : "mb-5 md:mb-6"}`}
      style={shellStyle}
    >
      <div
        className={`relative w-full overflow-hidden rounded-t-[22px] ${theme === "light" ? "bg-[#aabdd6]" : "bg-elev-2"} ${imageHeightClass}`}
      >
        {listingCardImgSrc && !heroFatal ? (
          <>
            <div
              className={`enigma-listing-photo-hold pointer-events-none absolute inset-0 z-0 transition-[opacity] duration-500 ease-out ${heroLoaded ? "opacity-0" : "opacity-100"}`}
              aria-hidden
            />
            <Image
              key={listingCardImgSrc}
              src={listingCardImgSrc}
              alt=""
              fill
              className={`relative z-[1] object-cover saturate-[1.04] contrast-[1.03] ${heroLoaded ? "opacity-100" : "opacity-0"} md:group-hover:scale-[1.018]`}
              style={{
                transition:
                  "opacity 480ms cubic-bezier(0.22, 1, 0.36, 1), transform 145ms ease-out",
              }}
              sizes="(max-width: 640px) 92vw, (max-width: 1024px) 680px, 800px"
              priority={index < 10}
              onLoad={() => setHeroLoaded(true)}
              onError={() => {
                if (uri && thumbCandidate && !heroFallbackTriedRef.current) {
                  heroFallbackTriedRef.current = true;
                  setHeroSrc(uri);
                  setHeroLoaded(false);
                  return;
                }
                setHeroFatal(true);
                setHeroLoaded(false);
              }}
            />
          </>
        ) : (
          <div className="enigma-listing-photo-hold z-0" aria-hidden />
        )}
        <Link
          href={listingPath(lid)}
          prefetch
          className="absolute inset-0 z-10"
          aria-label={itemTitle}
          onClick={() => {
            onOpen?.();
            trackEvent("listing_open", {
              listing_id: lid,
              category: safeItem?.category ?? null,
              city: safeItem?.city ?? null,
            });
          }}
        />
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-[11] h-[58%] transition-opacity duration-[145ms] ease-out ${theme === "light" ? "opacity-[0.72] group-hover:opacity-[0.88]" : "opacity-90 group-hover:opacity-100"}`}
          style={{
            background:
              theme === "light"
                ? "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,40,76,0.12) 50%, rgba(8,26,62,0.28) 100%)"
                : "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(12,42,92,0.18) 45%, rgba(0,14,38,0.62) 100%)",
          }}
        />
        {partner ? (
          <span className="pointer-events-none absolute left-3 top-3 z-[12] rounded-lg border border-line bg-elevated/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-fg backdrop-blur-sm">
            Партнёр
          </span>
        ) : null}
        {vipActive ? (
          <span
            className={`left-3 ${promoCardLeftTop("vip", { partner, vipActive, topActive })} ${PROMO_CARD_CLASS.vip}`}
          >
            {PROMOTION_LABEL.vip}
          </span>
        ) : null}
        {topActive ? (
          <span
            className={`left-3 ${promoCardLeftTop("top", { partner, vipActive, topActive })} ${PROMO_CARD_CLASS.top}`}
          >
            {PROMOTION_LABEL.top}
          </span>
        ) : null}
        {boosted ? (
          <span
            className={`${promoCardBoostTop({
              partner,
              vipActive,
              topActive,
            })} ${PROMO_CARD_CLASS.boost}`}
          >
            {PROMOTION_LABEL.boost}
          </span>
        ) : null}
        <div
          className="absolute right-2 top-2 z-20 flex items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {!isOwn ? (
            <ListingFavoriteIconButton filled={isFavoritedLocal} busy={favoriteBusy} onClick={() => handleToggleFavorite()} />
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/22 bg-black/38 text-white shadow-lg backdrop-blur-md transition-[transform,background-color,opacity] duration-150 ease-out hover:bg-black/48 active:scale-[0.97]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
              <circle cx="12" cy="6" r="1.65" />
              <circle cx="12" cy="12" r="1.65" />
              <circle cx="12" cy="18" r="1.65" />
            </svg>
          </button>
        </div>
      </div>
      <Link
        href={listingPath(lid)}
        prefetch
        className="block"
        onClick={() => {
          onOpen?.();
          trackEvent("listing_open", {
            listing_id: lid,
            category: safeItem?.category ?? null,
            city: safeItem?.city ?? null,
          });
        }}
      >
        <div className={contentSpacingClass}>
          <p className="line-clamp-2 overflow-hidden text-[17px] font-semibold leading-[1.32] tracking-[-0.015em] text-fg">
            {itemTitle}
          </p>
          {reFacts ? (
            <p className="line-clamp-3 break-words text-[12px] leading-[1.32] tracking-tight text-muted/74">{reFacts}</p>
          ) : null}
          <div className="mt-1 shrink-0">
            <p
              className={`flex items-baseline leading-none ${priceStyle.rowGapClass} text-fg`}
            >
              <span className={priceStyle.amountClass}>{formatPriceNumber(numericPrice)}</span>
              <span className={`${priceStyle.rubClass} text-muted`}>₽</span>
            </p>
          </div>
          <div className="mt-1.5 shrink-0">
            <ListingMetricsRow
            views={views}
            favorites={favoriteCountLocal}
            live={liveViewers ?? undefined}
            isFavorited={isFavoritedLocal}
            variant="card"
            omitFavorite
            />
          </div>
          <div className="mt-px flex flex-wrap items-baseline gap-x-2.5 gap-y-0 text-[13px] leading-[1.32] tracking-[-0.01em] text-muted/54">
            <span className="inline-flex items-center gap-1 tabular-nums text-muted/56">
              <LocationTinyIcon />
              <span>{itemLocation}</span>
            </span>
            <span className="text-muted/36">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-muted/52">
              <EyeTinyIcon />
              <span>{views}</span>
            </span>
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 tabular-nums text-muted/48">· {categoryLabel(safeItem?.category)}</span>
          </div>
        </div>
      </Link>
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
      {isOwn && !partner ? (
        <div className="flex flex-col gap-1.5 px-4 pb-[18px] pt-2 sm:px-[18px]">
          <Link
            href={boostHref()}
            onClick={() => trackBoostEvent("boost_click", { listingId: lid, own: isOwn })}
            className={`block rounded-[11px] border px-3 py-[11px] transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] ${
              theme === "dark"
                ? "border-[rgba(122,206,255,0.3)] bg-[linear-gradient(152deg,rgba(26,44,78,0.92)_0%,rgba(14,22,40,0.96)_55%,rgba(8,12,22,1)_100%)] shadow-[0_0_26px_rgba(84,169,255,0.12)] hover:border-[rgba(148,214,255,0.4)] hover:shadow-[0_0_34px_rgba(84,169,255,0.14)]"
                : "border-[rgba(120,200,255,0.46)] bg-[linear-gradient(152deg,rgba(22,40,78,0.98)_0%,rgba(12,22,44,0.99)_55%,rgba(6,12,28,1)_100%)] shadow-[0_0_32px_rgba(84,169,255,0.24),0_10px_28px_rgba(29,118,232,0.14)] ring-1 ring-[rgba(120,200,255,0.22)] hover:border-[rgba(150,220,255,0.54)] hover:shadow-[0_0_42px_rgba(84,169,255,0.28)]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-[#b8dcff]">
                BOOST
              </span>
              <span className="text-[14px] tabular-nums font-bold text-[#8ecfff]">
                {priceRub} ₽
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-[1.28] tracking-wide text-sky-100/90 drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
              Больше показов
            </p>
          </Link>

          <Link
            href={topHref()}
            onClick={() => trackBoostEvent("top_click", { listingId: lid, own: isOwn })}
            className="block rounded-[11px] border border-[rgba(108,118,132,0.34)] bg-[linear-gradient(168deg,#cdd3df_0%,#e2e6ef_42%,#f0f2f8_100%)] px-3 py-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),inset_0_-1px_0_rgba(38,46,62,0.1),0_8px_22px_rgba(12,18,32,0.08)] ring-1 ring-black/[0.06] transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] hover:border-[rgba(92,102,118,0.42)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-slate-950">
                TOP
              </span>
              <span className="text-[14px] tabular-nums font-bold text-slate-800">
                {defaultTopCtaPriceRub()} ₽
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-[1.28] tracking-wide text-slate-600">
              Выше в ленте
            </p>
          </Link>

          <Link
            href={vipHref()}
            onClick={() => trackBoostEvent("vip_click", { listingId: lid, own: isOwn })}
            className={`block rounded-[11px] border px-3 py-[11px] transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] ${
              theme === "dark"
                ? "border-[rgba(255,220,155,0.44)] bg-[linear-gradient(168deg,#1c1610_0%,#0c0a08_48%,#050504_100%)] shadow-[0_0_28px_rgba(200,150,72,0.14),inset_0_1px_0_rgba(255,215,165,0.18),inset_0_0_0_1px_rgba(84,169,255,0.06)] hover:border-[rgba(255,224,158,0.52)] hover:shadow-[0_0_36px_rgba(200,150,72,0.18)]"
                : "border-[rgba(212,168,94,0.4)] bg-[linear-gradient(168deg,#1e2a38_0%,#151d28_52%,#0b1018_100%)] text-white ring-1 ring-[rgba(29,118,232,0.16)] shadow-[inset_0_1px_0_rgba(255,215,165,0.14),inset_0_0_0_1px_rgba(84,169,255,0.06)] hover:border-[rgba(250,200,92,0.32)]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-[#ffedd0]">VIP</span>
              <span className="text-[14px] tabular-nums font-bold text-[#f8d58c]">{defaultVipCtaPriceRub()} ₽</span>
            </div>
            <p
              className={`mt-0.5 text-[10.5px] leading-[1.28] tracking-wide ${
                theme === "dark" ? "text-[rgba(255,235,205,0.78)]" : "text-[rgba(245,218,168,0.76)]"
              }`}
            >
              Максимальный приоритет
            </p>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
