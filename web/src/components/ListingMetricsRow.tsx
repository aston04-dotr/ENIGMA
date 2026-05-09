"use client";

type Props = {
  views: number;
  favorites: number;
  live?: number;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  variant?: "card" | "detail";
  /** Не показывать блок избранного (иконка вынесена отдельно). */
  omitFavorite?: boolean;
};

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LiveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2" />
      <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
    </svg>
  );
}

function HeartIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m12 20-1.4-1.3C5.6 14 2 10.7 2 7a5 5 0 0 1 9.2-2.8A5 5 0 0 1 20 7c0 3.7-3.6 7-8.6 11.7L12 20Z" />
    </svg>
  );
}

export function ListingMetricsRow({
  views,
  favorites,
  live,
  isFavorited = false,
  onToggleFavorite,
  variant = "card",
  omitFavorite = false,
}: Props) {
  const safeViews = Number.isFinite(Number(views)) ? Number(views) : 0;
  const safeFavorites = Number.isFinite(Number(favorites)) ? Number(favorites) : 0;
  const safeLive =
    Number.isFinite(Number(live)) && Number(live) > 0 ? Number(live) : null;

  const sizeGap = variant === "detail" ? "gap-3.5" : "gap-3";
  const textSize = variant === "detail" ? "text-[12px]" : "text-[13px]";

  return (
    <div
      className={`flex items-baseline whitespace-nowrap text-muted/54 ${sizeGap} ${textSize}`}
    >
      <span className="inline-flex items-center gap-1 tabular-nums leading-none opacity-95 transition-opacity duration-150 ease-out hover:opacity-100">
        <EyeIcon className="h-4 w-4" />
        <span>{safeViews}</span>
      </span>

      {safeLive != null ? (
        <span className="inline-flex items-center gap-1 tabular-nums leading-none text-muted/50 transition-opacity duration-150 ease-out hover:text-muted/72">
          <LiveIcon className="h-4 w-4 animate-pulse opacity-90 [animation-duration:2.6s]" />
          <span>+{safeLive}</span>
        </span>
      ) : null}

      {omitFavorite ? (
        <span
          className={`inline-flex items-center gap-1 tabular-nums leading-none transition-opacity duration-150 ease-out ${
            isFavorited ? "text-red-500/92" : "text-muted/48"
          }`}
        >
          <HeartIcon className="h-4 w-4" filled={isFavorited} />
          <span>{safeFavorites}</span>
        </span>
      ) : onToggleFavorite ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={
              isFavorited ? "Убрать из избранного" : "Добавить в избранное"
            }
            className={`inline-flex items-center gap-1 tabular-nums leading-none transition-[opacity,transform,color] duration-150 ease-out active:scale-[0.985] ${
              isFavorited
                ? "text-red-500/95 scale-[1.02]"
                : "text-muted/48 hover:text-muted/70"
            }`}
          >
            <HeartIcon
              className="h-4 w-4 transition-transform duration-150"
              filled={isFavorited}
            />
            <span>{safeFavorites}</span>
          </button>
        ) : (
          <span
            className={`inline-flex items-center gap-1 tabular-nums leading-none transition-opacity duration-150 ease-out ${
              isFavorited ? "text-red-500/92" : "text-muted/48"
            }`}
          >
            <HeartIcon className="h-4 w-4" filled={isFavorited} />
            <span>{safeFavorites}</span>
          </span>
        )}
    </div>
  );
}
