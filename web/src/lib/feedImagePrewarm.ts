/**
 * Прогрев hero-thumbnail ленты: уменьшает белый кадр при смене фильтров/вкладок.
 * Загружает уже ужатый URL (.webp `_thumb`), не full-size — баланс памяти vs UX.
 */

import type { ListingRow } from "@/lib/types";
import { normalizeListingImages } from "@/lib/listings";
import { primaryImageThumbUrl } from "@/lib/mediaDerivativeUrls";

function firstListingImageUrl(row: ListingRow): string | null {
  const imgs = normalizeListingImages(row.images).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const u = imgs[0]?.url?.trim() ?? null;
  return u || null;
}

/** URL первой миниатюры объявления (или оригинал .webp, если thumb недоступен). */
export function heroThumbFetchUrl(row: ListingRow): string | null {
  const primary = firstListingImageUrl(row);
  if (!primary) return null;
  return primaryImageThumbUrl(primary) ?? primary;
}

/** Уникальные URL сверху списка (для prewarm после replace / скролла). */
export function collectHeroThumbUrls(listings: ListingRow[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of listings) {
    if (out.length >= limit) break;
    const u = heroThumbFetchUrl(row);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Прогрев вокруг текущего viewport виртуализатора (+/- neighborPad строк). */
export function collectHeroThumbUrlsNearVirtualWindow(
  listings: ListingRow[],
  virtualIndices: readonly { index: number }[],
  neighborPad: number,
  limit: number,
): string[] {
  if (listings.length === 0 || virtualIndices.length === 0) return [];
  let minI = Infinity;
  let maxI = -1;
  for (const v of virtualIndices) {
    minI = Math.min(minI, v.index);
    maxI = Math.max(maxI, v.index);
  }
  if (!Number.isFinite(minI)) return [];
  const from = Math.max(0, minI - neighborPad);
  const to = Math.min(listings.length - 1, maxI + neighborPad);
  return collectHeroThumbUrls(listings.slice(from, to + 1), limit);
}

const DEFAULT_PREWARM_MAX = 20;

/** Неблокирующий прогрев: маленькие волны, без сотен Image() одновременно. */
export function scheduleFeedThumbnailPrewarm(
  urls: string[],
  options?: { max?: number; batchSize?: number },
): void {
  if (typeof window === "undefined" || urls.length === 0) return;
  const max = Math.min(options?.max ?? DEFAULT_PREWARM_MAX, urls.length);
  const batchSize = Math.max(1, Math.min(options?.batchSize ?? 4, 8));
  const slice = urls.slice(0, max);

  const run = () => {
    let i = 0;
    const nextBatch = () => {
      const part = slice.slice(i, i + batchSize);
      i += batchSize;
      for (const url of part) {
        const im = new Image();
        im.decoding = "async";
        im.src = url;
      }
      if (i < slice.length) queueMicrotask(nextBatch);
    };
    nextBatch();
  };

  const ric = window.requestIdleCallback?.bind(window) as
    | typeof window.requestIdleCallback
    | undefined;
  if (ric) {
    ric(run, { timeout: 2600 });
  } else {
    window.setTimeout(run, 32);
  }
}
