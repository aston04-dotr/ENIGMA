const EV = "enigma:listing-promotion";

export type ListingPromotionDetail = {
  listingId?: string;
  /** boost_activated | promotion_applied */
  type?: string;
};

/** Web: CustomEvent для обновления ленты после оплаты BOOST/VIP. */
export function subscribeListingCreated(_cb: () => void): () => void {
  return () => {};
}

export function emitListingCreated(): void {}

export function subscribeListingPromotionApplied(
  cb: (detail?: ListingPromotionDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => {
    const ce = e as CustomEvent<ListingPromotionDetail>;
    cb(ce.detail);
  };
  window.addEventListener(EV, h);
  return () => window.removeEventListener(EV, h);
}

export function emitListingPromotionApplied(
  listingId?: string,
  opts?: { type?: "boost_activated" | "promotion_applied" }
): void {
  if (typeof window === "undefined") return;
  const type = opts?.type ?? "promotion_applied";
  window.dispatchEvent(new CustomEvent<ListingPromotionDetail>(EV, { detail: { listingId, type } }));
}

/** Явный emit после оплаты Boost (аналитика + лента). */
export function emitBoostActivated(listingId: string): void {
  emitListingPromotionApplied(listingId, { type: "boost_activated" });
}
