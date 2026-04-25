"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { categoryLabel } from "@/lib/categories";
import { ListingMetricsRow } from "@/components/ListingMetricsRow";
import { trackEvent } from "@/lib/analytics";
import { defaultBoostCtaPriceRub, defaultVipCtaPriceRub, defaultTopCtaPriceRub, webBoostPaymentQuery, webVipPaymentQuery, webTopPaymentQuery } from "@/lib/boostPay";
import { trackBoostEvent } from "@/lib/boostAnalytics";
import { isBoostActive } from "@/lib/monetization";
import { normalizeListingImages, toggleFavorite } from "@/lib/listings";
import type { ListingRow } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { useEffect, useState } from "react";

function formatPrice(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

type Props = {
  item?: ListingRow | null;
};

export function ListingCard({ item }: Props) {
  const { session } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  if (!item || typeof item !== "object") return null;

  const imgs = normalizeListingImages((item as ListingRow & { images?: unknown })?.images).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const uri = imgs[0]?.url ?? null;
  const itemTitle = typeof item.title === "string" && item.title.trim() ? item.title : "Без названия";
  const itemCity = typeof item.city === "string" && item.city.trim() ? item.city : "Город не указан";
  const boosted = isBoostActive(item);
  const lid = item?.id;
  const viewerId = session?.user?.id ?? null;
  const isOwn = Boolean(viewerId && item.user_id && item.user_id === viewerId);
  const partner = item.is_partner_ad === true;
  const views = Number.isFinite(Number(item.view_count)) ? Number(item.view_count) : 0;
  const favorites = Number.isFinite(Number(item.favorite_count)) ? Number(item.favorite_count) : 0;
  const liveViewersRaw = (item as ListingRow & { live_viewers?: unknown }).live_viewers;
  const liveViewers =
    Number.isFinite(Number(liveViewersRaw)) && Number(liveViewersRaw) > 0
      ? Number(liveViewersRaw)
      : null;
  const favoriteStateRaw = (item as ListingRow & {
    is_favorited?: unknown;
    isFavorited?: unknown;
  });
  const isFavorited =
    favoriteStateRaw.is_favorited === true || favoriteStateRaw.isFavorited === true;
  const [favoriteCountLocal, setFavoriteCountLocal] = useState(favorites);
  const [isFavoritedLocal, setIsFavoritedLocal] = useState(isFavorited);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const priceRub = defaultBoostCtaPriceRub();

  useEffect(() => {
    setFavoriteCountLocal(favorites);
  }, [favorites, lid]);

  useEffect(() => {
    setIsFavoritedLocal(isFavorited);
  }, [isFavorited, lid]);

  if (!lid) return null;

  function boostHref(): string {
    if (!viewerId) return "/login";
    if (!isOwn) return `/listing/${lid}`;
    return `/payment?${webBoostPaymentQuery(lid, viewerId)}`;
  }

  function vipHref(): string {
    if (!viewerId) return "/login";
    if (!isOwn) return `/listing/${lid}`;
    return `/payment?${webVipPaymentQuery(lid, viewerId)}`;
  }

  function topHref(): string {
    if (!viewerId) return "/login";
    if (!isOwn) return `/listing/${lid}`;
    return `/payment?${webTopPaymentQuery(lid, viewerId)}`;
  }

  return (
    <div className="pressable mb-5 overflow-hidden rounded-card border border-line bg-elevated shadow-soft transition-shadow duration-ui hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <Link
        href={`/listing/${lid}`}
        prefetch
        className="block"
        onClick={() =>
          trackEvent("listing_open", {
            listing_id: lid,
            category: item?.category ?? null,
            city: item?.city ?? null,
          })
        }
      >
        <div className="relative aspect-[4/3] w-full bg-elev-2">
          {uri ? (
            <Image src={uri} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 32rem" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] font-semibold tracking-[0.2em] text-muted">
              ENIGMA
            </div>
          )}
          {partner ? (
            <span className="absolute left-3 top-3 rounded-lg border border-line bg-elevated/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-fg backdrop-blur-sm">
              Партнёр
            </span>
          ) : null}
          {boosted ? (
            <span className="absolute right-3 top-3 rounded-lg bg-accent/90 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
              В топе
            </span>
          ) : null}
        </div>
        <div className="space-y-2 p-4">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-fg">{itemTitle}</p>
          <p className="text-xl font-bold tracking-tight text-fg">{formatPrice(Number(item?.price ?? 0))}</p>
          <ListingMetricsRow
            views={views}
            favorites={favoriteCountLocal}
            live={liveViewers ?? undefined}
            isFavorited={isFavoritedLocal}
            variant="card"
            onToggleFavorite={() => {
              if (favoriteBusy) return;
              if (!viewerId) {
                router.push("/login");
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
              }).finally(() => setFavoriteBusy(false));
            }}
          />
          <p className="text-xs text-muted">
            {itemCity} · {categoryLabel(item?.category)}
          </p>
        </div>
      </Link>
      {isOwn && !partner ? (
        <div className="px-4 py-3 space-y-3">
          {/* 1. Boost - Базовый */}
          <Link
            href={boostHref()}
            onClick={() => trackBoostEvent("boost_click", { listingId: lid, own: isOwn })}
            className="block rounded-2xl bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] p-4 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Поднять объявление
              </span>
              <span className="text-sm font-semibold text-white">
                {priceRub} ₽
              </span>
            </div>
            <div className="mt-1 text-xs text-white/80">
              Больше просмотров и откликов
            </div>
          </Link>

          {/* 2. TOP - Средний уровень */}
          <Link
            href={topHref()}
            onClick={() => trackBoostEvent("top_click", { listingId: lid, own: isOwn })}
            className={`block rounded-2xl border p-4 transition-all duration-200 active:scale-[0.98] ${
              theme === "light"
                ? "border-[rgba(90,140,255,0.35)] hover:bg-[rgba(90,140,255,0.15)]"
                : "border-[rgba(110,168,255,0.25)] hover:bg-[rgba(110,168,255,0.15)]"
            }`}
            style={{
              background: theme === "light"
                ? "linear-gradient(135deg, rgba(90,140,255,0.12), rgba(0,180,255,0.10))"
                : "linear-gradient(135deg, rgba(80,120,255,0.12), rgba(0,200,255,0.08))",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${theme === "light" ? "text-[#2F5BFF]" : "text-[#6EA8FF]"}`}>
                  TOP размещение
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  theme === "light"
                    ? "bg-[rgba(90,140,255,0.15)] text-[#2F5BFF]"
                    : "bg-[rgba(110,168,255,0.15)] text-[#6EA8FF]"
                }`}>
                  Оптимальный
                </span>
              </div>
              <span className={`text-sm font-semibold ${theme === "light" ? "text-[#0F172A]" : "text-white"}`}>
                {defaultTopCtaPriceRub()} ₽
              </span>
            </div>
            <div className={`mt-1 text-xs ${theme === "light" ? "text-[#2F5BFF]/70" : "text-[#6EA8FF]/70"}`}>
              Выше в ленте и больше показов
            </div>
          </Link>

          {/* 3. VIP - Премиум */}
          <Link
            href={vipHref()}
            onClick={() => trackBoostEvent("vip_click", { listingId: lid, own: isOwn })}
            className="block rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f1115] to-[#1a1d23] p-4 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium bg-gradient-to-r from-[#f5d07a] via-[#e6b85c] to-[#c9972e] bg-clip-text text-transparent">
                VIP Boost
              </span>
              <span className="text-sm font-semibold text-white">
                {defaultVipCtaPriceRub()} ₽
              </span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Максимальный приоритет в ленте
            </div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
