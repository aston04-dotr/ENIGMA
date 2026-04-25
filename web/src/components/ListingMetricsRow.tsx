"use client";

type Props = {
  views: number;
  favorites: number;
  live?: number;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  variant?: "card" | "detail";
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
}: Props) {
  const safeViews = Number.isFinite(Number(views)) ? Number(views) : 0;
  const safeFavorites = Number.isFinite(Number(favorites)) ? Number(favorites) : 0;
  const safeLive =
    Number.isFinite(Number(live)) && Number(live) > 0 ? Number(live) : null;

  const sizeClass = variant === "detail" ? "text-[12px] gap-3.5" : "text-xs gap-3";

  return (
    <div
      className={`flex items-center whitespace-nowrap text-gray-400 opacity-70 ${sizeClass}`}
    >
      <span className="inline-flex items-center gap-1 leading-none tabular-nums transition-colors duration-200 hover:opacity-100">
        <EyeIcon className="h-4 w-4" />
        <span>{safeViews}</span>
      </span>

      {safeLive != null ? (
        <span className="inline-flex items-center gap-1 text-gray-500 leading-none tabular-nums transition-opacity duration-200 hover:opacity-100">
          <LiveIcon className="h-4 w-4 animate-pulse" />
          <span>+{safeLive}</span>
        </span>
      ) : null}

      {onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={
            isFavorited ? "Убрать из избранного" : "Добавить в избранное"
          }
          className={`inline-flex items-center gap-1 leading-none tabular-nums transition-all duration-150 ${
            isFavorited
              ? "text-red-500 opacity-100 scale-110"
              : "text-gray-400 hover:opacity-100 hover:text-gray-500"
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
          className={`inline-flex items-center gap-1 leading-none tabular-nums ${
            isFavorited ? "text-red-500 opacity-100" : "text-gray-400"
          }`}
        >
          <HeartIcon className="h-4 w-4" filled={isFavorited} />
          <span>{safeFavorites}</span>
        </span>
      )}
    </div>
  );
}
