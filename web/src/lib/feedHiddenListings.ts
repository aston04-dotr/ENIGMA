const STORAGE_KEY = "enigma_feed_hidden_listing_ids";

export const FEED_HIDDEN_CHANGED_EVENT = "enigma-feed-hidden-changed";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function getHiddenListingIdsSet(): Set<string> {
  return new Set(readIds());
}

export function hideListingInFeed(listingId: string): void {
  const id = String(listingId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  const next = new Set(readIds());
  next.add(id);
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  window.dispatchEvent(new CustomEvent(FEED_HIDDEN_CHANGED_EVENT));
}

export function unhideListingInFeed(listingId: string): void {
  const id = String(listingId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  const next = readIds().filter((x) => x !== id);
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(FEED_HIDDEN_CHANGED_EVENT));
}
