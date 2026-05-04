"use client";

import type { MouseEvent } from "react";

type Props = {
  filled: boolean;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  onClick: (e: MouseEvent) => void;
};

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m12 20-1.4-1.3C5.6 14 2 10.7 2 7a5 5 0 0 1 9.2-2.8A5 5 0 0 1 20 7c0 3.7-3.6 7-8.6 11.7L12 20Z" />
    </svg>
  );
}

export function ListingFavoriteIconButton({
  filled,
  busy,
  disabled,
  label = filled ? "Убрать из избранного" : "В избранное",
  className = "",
  onClick,
}: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled || busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all duration-150 active:scale-95 disabled:opacity-45 ${
        filled
          ? "border-[#FF3B30]/60 bg-[#FF3B30]/90 text-white shadow-[0_0_22px_rgba(255,59,48,0.55)] hover:bg-[#FF3B30]"
          : "border-white/25 bg-black/40 text-white hover:bg-black/55"
      } ${className}`}
    >
      <HeartIcon filled={filled} className="h-[22px] w-[22px]" />
    </button>
  );
}
