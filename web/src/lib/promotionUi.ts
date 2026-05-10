/**
 * Phase 2 — единые подписи и стили промо-бейджей (лента + карточка объявления).
 * VIP / TOP / BOOST визуально разведены; BOOST = «ускорение» (быстрый лёгкий pulse).
 */

export const PROMOTION_LABEL = {
  vip: "VIP",
  top: "TOP",
  boost: "Продвигается",
} as const;

/** Бейджи в карточке ленты (компактные). */
export const PROMO_CARD_CLASS = {
  vip: [
    "pointer-events-none absolute z-[13] rounded-lg border border-amber-300/70",
    "bg-[linear-gradient(145deg,#180f05_0%,#3f280a_42%,#0a0603_100%)] px-[7px] py-[3px]",
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100",
    "shadow-[0_0_18px_rgba(255,200,115,0.55),inset_0_1px_0_rgba(255,235,200,0.14)] ring-1 ring-amber-400/45 backdrop-blur-sm",
    "animate-promo-vip-glow motion-reduce:animate-none motion-reduce:shadow-[0_0_14px_rgba(255,200,110,0.5)]",
    "transition-opacity duration-300 ease-out",
  ].join(" "),
  top: [
    "pointer-events-none absolute z-[12] rounded-lg border border-indigo-300/65",
    "bg-[linear-gradient(172deg,#eceef8_0%,#cfd6ec_42%,#9aa6cf_100%)] px-[7px] py-[3px]",
    "text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-900",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_0_16px_rgba(99,102,241,0.28)] ring-1 ring-indigo-400/40 backdrop-blur-sm",
    "transition-opacity duration-300 ease-out",
  ].join(" "),
  boost: [
    "pointer-events-none absolute right-3 z-[12] rounded-lg border border-sky-400/50 max-w-[7.25rem]",
    "bg-[linear-gradient(154deg,#041328_0%,#082c52_46%,#02060e_100%)] px-[6px] py-[3px]",
    "text-[9.5px] font-semibold leading-none tracking-[0.04em] text-sky-100 text-center whitespace-nowrap",
    "shadow-[0_0_18px_rgba(56,189,248,0.5)] ring-1 ring-sky-300/38 backdrop-blur-sm",
    "animate-promo-boost-motion motion-reduce:animate-none motion-reduce:shadow-[0_0_14px_rgba(56,189,248,0.4)]",
    "transition-opacity duration-300 ease-out",
  ].join(" "),
} as const;

/** Герой страницы объявления — чуть крупнее. */
export const PROMO_HERO_CLASS = {
  vip: [
    "pointer-events-none absolute z-[26] rounded-lg border border-amber-300/70",
    "bg-[linear-gradient(145deg,#180f05_0%,#44280a_42%,#0a0603_100%)] px-[9px] py-[4px]",
    "text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-100",
    "shadow-[0_0_22px_rgba(255,200,115,0.58),inset_0_1px_0_rgba(255,235,200,0.16)] ring-1 ring-amber-400/45 backdrop-blur-sm",
    "animate-promo-vip-glow motion-reduce:animate-none",
    "transition-opacity duration-300 ease-out",
  ].join(" "),
  top: [
    "pointer-events-none absolute z-[25] rounded-lg border border-indigo-300/65",
    "bg-[linear-gradient(172deg,#eceef8_0%,#cdd4ec_42%,#9aa6cf_100%)] px-[9px] py-[4px]",
    "text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-900",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_0_18px_rgba(99,102,241,0.32)] ring-1 ring-indigo-400/40 backdrop-blur-sm",
    "transition-opacity duration-300 ease-out",
  ].join(" "),
  boost: [
    "pointer-events-none absolute right-3 z-[24] rounded-lg border border-sky-400/50 max-w-[8.25rem]",
    "bg-[linear-gradient(154deg,#041328_0%,#073458_46%,#02060e_100%)] px-2 py-1",
    "text-[11px] font-semibold leading-tight tracking-wide text-sky-100 text-center whitespace-nowrap",
    "shadow-[0_0_20px_rgba(56,189,248,0.52)] ring-1 ring-sky-300/38 backdrop-blur-sm",
    "animate-promo-boost-motion motion-reduce:animate-none",
    "transition-opacity duration-300 ease-out",
  ].join(" "),
} as const;

/** Вертикальная ступенька бейджей слева (карточка). Партнёр занимает `top-3`. */
export function promoCardLeftTop(kind: "vip" | "top", ctx: {
  partner: boolean;
  vipActive: boolean;
  topActive: boolean;
}): string {
  const { partner, vipActive, topActive } = ctx;
  if (kind === "vip") return partner ? "top-14" : "top-3";
  if (!partner) {
    if (vipActive && topActive) return "top-12";
    if (vipActive) return "top-12";
    return "top-3";
  }
  if (vipActive && topActive) return "top-[4.75rem]";
  if (vipActive) return "top-[4.75rem]";
  return "top-14";
}

/** Вертикальная позиция BOOST справа: ниже счётчика фото и чужих бейджей. */
export function promoCardBoostTop(ctx: {
  partner: boolean;
  vipActive: boolean;
  topActive: boolean;
}): string {
  const { partner, vipActive, topActive } = ctx;
  if (!partner) {
    if (vipActive && topActive) return "top-28";
    if (vipActive || topActive) return "top-16";
    return "top-14";
  }
  if (vipActive && topActive) return "top-[7.85rem]";
  if (vipActive || topActive) return "top-24";
  return "top-14";
}

/** Левая колонка бейджей на герое (есть блок «n из m» сверху). */
export function promoHeroLeftTop(kind: "vip" | "top", ctx: {
  hasGalleryCounter: boolean;
  vipActive: boolean;
}): string {
  const { hasGalleryCounter, vipActive } = ctx;
  if (!hasGalleryCounter) {
    return kind === "vip" ? "top-3" : vipActive ? "top-14" : "top-3";
  }
  if (kind === "vip") return "top-[4.65rem]";
  return vipActive ? "top-[7.85rem]" : "top-[4.65rem]";
}

export function promoHeroBoostTop(hasGalleryCounter: boolean, vipActive: boolean, topActive: boolean): string {
  if (!hasGalleryCounter) {
    if (vipActive && topActive) return "top-32";
    if (vipActive || topActive) return "top-20";
    return "top-16";
  }
  if (vipActive && topActive) return "top-40";
  if (vipActive || topActive) return "top-28";
  return "top-24";
}
