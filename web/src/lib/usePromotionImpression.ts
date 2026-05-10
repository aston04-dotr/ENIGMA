import { useCallback, useEffect, useRef } from "react";
import {
  trackPromotionAnalytics,
  type PromotionAnalyticsTier,
} from "@/lib/promotionAnalytics";

/** Вкладка: один qualified impression на связку surface + объявление + tier */
const STORAGE_PREFIX = "enigma_promo_imp_v1:";

function storageKey(
  surface: string,
  listingId: string,
  tier: PromotionAnalyticsTier,
): string {
  return `${STORAGE_PREFIX}${surface}:${listingId}:${tier}`;
}

function alreadyRecorded(
  surface: string,
  listingId: string,
  tier: PromotionAnalyticsTier,
): boolean {
  try {
    return sessionStorage.getItem(storageKey(surface, listingId, tier)) === "1";
  } catch {
    return false;
  }
}

function markRecorded(
  surface: string,
  listingId: string,
  tier: PromotionAnalyticsTier,
): void {
  try {
    sessionStorage.setItem(storageKey(surface, listingId, tier), "1");
  } catch {
    // private mode и т.п.
  }
}

function visibleAreaRatio(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const visibleHeight = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
  const visibleWidth = Math.min(rect.right, vw) - Math.max(rect.left, 0);
  const area = Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
  return area / (rect.width * rect.height);
}

/**
 * Лёгкий impression: IntersectionObserver + короткий dwell + не чаще одного раза
 * за вкладку (sessionStorage ключ включает tier — для uplift по смене tier).
 */
export function usePromotionImpressionRef(options: {
  listingId: string | null | undefined;
  tier: PromotionAnalyticsTier;
  surface: "feed" | "listing_detail";
  /** Карточка не в ленте / отключено */
  enabled?: boolean;
  /** Доля видимой площади элемента в viewport */
  threshold?: number;
  /** Удержание в видимой зоне перед отправкой (анти-quick-scroll) */
  dwellMs?: number;
}): (node: HTMLElement | null) => void {
  const {
    listingId,
    tier,
    surface,
    enabled = true,
    threshold = 0.38,
    dwellMs = 320,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      clearTimer();
    },
    [],
  );

  return useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      observerRef.current?.disconnect();
      observerRef.current = null;
      clearTimer();

      const id = listingId?.trim() ?? "";
      if (
        !node ||
        !enabled ||
        !id ||
        tier === "none" ||
        typeof IntersectionObserver === "undefined"
      ) {
        return;
      }

      if (alreadyRecorded(surface, id, tier)) return;

      const fire = () => {
        clearTimer();
        if (alreadyRecorded(surface, id, tier)) return;
        const root = nodeRef.current;
        if (!root) return;
        if (visibleAreaRatio(root) + 1e-6 < threshold) return;
        markRecorded(surface, id, tier);
        observerRef.current?.disconnect();
        observerRef.current = null;
        const event =
          surface === "feed"
            ? "promotion_impression_feed"
            : "promotion_impression_listing";
        trackPromotionAnalytics(event, {
          listingId: id,
          tier,
          surface,
        });
      };

      const observer = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (!e?.isIntersecting) {
            clearTimer();
            return;
          }
          if (e.intersectionRatio < threshold) {
            clearTimer();
            return;
          }
          if (alreadyRecorded(surface, id, tier)) {
            observer.disconnect();
            return;
          }
          clearTimer();
          timerRef.current = setTimeout(fire, dwellMs);
        },
        {
          threshold: [0, threshold, Math.min(0.55, threshold + 0.12)],
          rootMargin: "0px",
        },
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [listingId, tier, surface, enabled, threshold, dwellMs],
  );
}
