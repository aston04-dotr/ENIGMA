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
import { isBoostActive } from "@/lib/monetization";
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
import { useEffect, useMemo, useRef, useState } from "react";

function formatPriceNumber(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
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
  const uri = imgs[0]?.url ?? null;
  const listingCardImgSrc = uri ? primaryImageThumbUrl(uri) ?? uri : null;
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
  const reFacts =
    safeItem?.category === "realestate" && safeItem
      ? formatRealEstateListingFacts(safeItem as ListingRow, { compact: true })
      : null;

  const imageHeightClass = compact
    ? "h-[146px] sm:h-[156px] lg:h-auto lg:aspect-video"
    : "h-[210px] sm:h-[230px] lg:h-auto lg:aspect-video";
  const contentSpacingClass = compact ? "space-y-1.5 p-3 sm:p-3.5" : "space-y-2 p-4 sm:p-[14px]";

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

  if (!safeItem || !lid) return null;

  return (
    <div
      className={`feed-card-enter group relative overflow-hidden rounded-[16px] border bg-elevated/95 transition-all duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] md:hover:-translate-y-[3px] ${omitOuterMargin ? "" : "mb-4 md:mb-5"}`}
      style={{
        borderColor: "rgba(255,255,255,0.04)",
        backgroundImage:
          "radial-gradient(110% 72% at 0% 0%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(255,255,255,0.024) 0%, rgba(255,255,255,0.008) 100%)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 18px rgba(0,0,0,0.1), 0 20px 34px rgba(0,0,0,0.14)",
        animationDelay: `${Math.min(index, 10) * 35}ms`,
      }}
    >
      <div className={`relative w-full overflow-hidden rounded-t-[16px] bg-elev-2 ${imageHeightClass}`}>
        {listingCardImgSrc ? (
          <Image
            src={listingCardImgSrc}
            alt=""
            fill
            className="relative z-0 object-cover saturate-[1.06] contrast-[1.04] transition-all duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 640px, 800px"
            priority={index < 6}
          />
        ) : (
          <div className="relative z-0 flex h-full items-center justify-center text-[11px] font-semibold tracking-[0.2em] text-muted">
            ENIGMA
          </div>
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
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] h-16 opacity-80 transition-opacity duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.44) 100%)",
          }}
        />
        {partner ? (
          <span className="pointer-events-none absolute left-3 top-3 z-[12] rounded-lg border border-line bg-elevated/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-fg backdrop-blur-sm">
            Партнёр
          </span>
        ) : null}
        {boosted ? (
          <span className="pointer-events-none absolute right-3 top-14 z-[12] rounded-lg bg-accent/90 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            В топе
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all duration-150 hover:bg-black/55 active:scale-95"
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
          <p className="line-clamp-2 overflow-hidden text-[17px] font-semibold leading-snug text-fg">
            {itemTitle}
          </p>
          {reFacts ? (
            <p className="line-clamp-3 break-words text-[12px] leading-snug text-muted">{reFacts}</p>
          ) : null}
          <p
            className={`flex items-baseline gap-1.5 text-[24px] font-extrabold leading-none tracking-[0.01em] ${
              theme === "light" ? "text-[#0f172a]" : "text-white"
            }`}
          >
            <span>{formatPriceNumber(numericPrice)}</span>
            <span
              className={`text-[18px] font-semibold tracking-normal ${
                theme === "light" ? "text-[#0f172a]/65" : "text-white/70"
              }`}
            >
              ₽
            </span>
          </p>
          <ListingMetricsRow
            views={views}
            favorites={favoriteCountLocal}
            live={liveViewers ?? undefined}
            isFavorited={isFavoritedLocal}
            variant="card"
            omitFavorite
          />
          <div className="flex items-center gap-2.5 text-[13px] text-muted/70">
            <span className="inline-flex items-center gap-1 text-muted/70">
              <LocationTinyIcon />
              <span>{itemLocation}</span>
            </span>
            <span className="text-muted/60">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-muted/70">
              <EyeTinyIcon />
              <span>{views}</span>
            </span>
            <span className="truncate text-muted/65">· {categoryLabel(safeItem?.category)}</span>
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
        <div className="space-y-2 px-[14px] pb-[14px] pt-1">
          <Link
            href={boostHref()}
            onClick={() => trackBoostEvent("boost_click", { listingId: lid, own: isOwn })}
            className={`block rounded-xl border px-3 py-3 transition-colors duration-200 active:scale-[0.99] ${
              theme === "dark"
                ? "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]"
                : "border-black/[0.06] bg-white hover:bg-[#fafafa]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[13px] font-medium ${theme === "light" ? "text-[#0f172a]" : "text-white/92"}`}>
                Поднять в поиске
              </span>
              <span className={`text-[13px] tabular-nums font-medium ${theme === "light" ? "text-[#475569]" : "text-white/65"}`}>
                {priceRub} ₽
              </span>
            </div>
            <div className={`mt-0.5 text-[11px] leading-snug ${theme === "light" ? "text-slate-500" : "text-white/48"}`}>
              Аккуратно выделим в общей ленте
            </div>
          </Link>

          <Link
            href={topHref()}
            onClick={() => trackBoostEvent("top_click", { listingId: lid, own: isOwn })}
            className={`block rounded-xl border px-3 py-3 transition-colors duration-200 active:scale-[0.99] ${
              theme === "dark"
                ? "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]"
                : "border-black/[0.06] bg-white hover:bg-[#fafafa]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[13px] font-medium ${theme === "light" ? "text-[#0f172a]" : "text-white/92"}`}>
                Приоритет в ленте
              </span>
              <span className={`text-[13px] tabular-nums font-medium ${theme === "light" ? "text-[#475569]" : "text-white/65"}`}>
                {defaultTopCtaPriceRub()} ₽
              </span>
            </div>
            <div className={`mt-0.5 text-[11px] leading-snug ${theme === "light" ? "text-slate-500" : "text-white/48"}`}>
              TOP — без лишнего шума в интерфейсе
            </div>
          </Link>

          <Link
            href={vipHref()}
            onClick={() => trackBoostEvent("vip_click", { listingId: lid, own: isOwn })}
            className={`block rounded-xl border px-3 py-3 transition-colors duration-200 active:scale-[0.99] ${
              theme === "dark"
                ? "border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]"
                : "border-black/[0.06] bg-white hover:bg-[#fafafa]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[13px] font-medium ${theme === "light" ? "text-[#0f172a]" : "text-white/92"}`}>
                VIP-зона
              </span>
              <span className={`text-[13px] tabular-nums font-medium ${theme === "light" ? "text-[#475569]" : "text-white/65"}`}>
                {defaultVipCtaPriceRub()} ₽
              </span>
            </div>
            <div className={`mt-0.5 text-[11px] leading-snug ${theme === "light" ? "text-slate-500" : "text-white/48"}`}>
              Максимальная заметность, спокойная подача
            </div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
