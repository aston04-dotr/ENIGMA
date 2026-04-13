import type { ListingRow } from "./types";

export const BOOST_PREVIEW_ABOVE_OTHERS = "Ваше объявление будет выше 95% других";

function simpleHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Стабильное за UTC-сутки «социальное» число 80–240 (заглушка). */
export function dailyBoostSocialCount(seed: string): number {
  const d = new Date();
  const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  const h = simpleHash(`${dayKey}|${seed}`);
  return 80 + (h % 161);
}

export type ViewEstimate = { baseline: number; boosted: number };

/** Прогноз просмотров: категория + город + лёгкий рандом от id. */
export function estimateViews(
  listing: Pick<ListingRow, "category" | "city" | "id" | "view_count">
): ViewEstimate {
  const cat = String(listing.category ?? "other").toLowerCase();
  let base = 95;
  if (cat.includes("real") || cat === "realestate") base = 210;
  else if (cat === "auto") base = 175;
  else if (cat === "other") base = 88;

  const cityLen = String(listing.city ?? "").trim().length;
  base += Math.min(110, cityLen * 5);

  const idH = simpleHash(String(listing.id ?? "x"));
  const jitter = 0.82 + (idH % 36) / 100;
  base = Math.round(base * jitter);

  const vc = Number(listing.view_count ?? 0);
  const baseline = Math.max(42, vc > 0 ? Math.round((vc + base) / 2) : base);

  const mult = 11 + (idH % 9);
  const boosted = Math.max(baseline + 400, Math.round(baseline * mult));
  const roundedBoosted = Math.round(boosted / 50) * 50;

  return { baseline, boosted: roundedBoosted };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Оставшееся время как ЧЧ:ММ:СС (для таймера буста). */
export function formatBoostCountdown(remainingMs: number): string {
  const ms = Math.max(0, Math.floor(remainingMs));
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

const RECENT_LIFT = [
  "👤 Кто-то только что поднял объявление",
  "только что · кто-то купил буст рядом с вами",
  "3 секунды назад · объявление ушло в топ",
  "10 секунд назад · новый буст в ленте",
] as const;

export function pickRecentLiftLine(tick: number): string {
  return RECENT_LIFT[Math.abs(tick) % RECENT_LIFT.length] ?? RECENT_LIFT[0];
}

const DEAD_ZONE = [
  "📉 Ваше объявление почти не видят",
  "Вы теряете клиентов прямо сейчас",
] as const;

export function pickDeadZoneLine(tick: number): string {
  return DEAD_ZONE[Math.abs(tick) % DEAD_ZONE.length] ?? DEAD_ZONE[0];
}

export type BoostComparisonUi = {
  baselineViews: number;
  boostedViews: number;
};

export function boostComparisonUi(
  listing: Pick<ListingRow, "category" | "city" | "id" | "view_count">
): BoostComparisonUi {
  const e = estimateViews(listing);
  return { baselineViews: e.baseline, boostedViews: e.boosted };
}
