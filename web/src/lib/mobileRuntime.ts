const MOBILE_PLACEHOLDER_ID = "__mobile__";

export function isLocalMobileBundleRuntime(): boolean {
  if (typeof process !== "undefined" && process.env.CAP_LOCAL_BUNDLE === "1") {
    return true;
  }
  if (typeof window === "undefined") return false;
  const protocol = String(window.location.protocol || "").toLowerCase();
  return protocol === "capacitor:" || protocol === "file:";
}

function encodeId(id: string): string {
  return encodeURIComponent(String(id || "").trim());
}

export function chatPath(chatId: string): string {
  if (!isLocalMobileBundleRuntime()) return `/chat/${encodeId(chatId)}`;
  return `/chat/${MOBILE_PLACEHOLDER_ID}?id=${encodeId(chatId)}`;
}

export function listingPath(listingId: string): string {
  if (!isLocalMobileBundleRuntime()) return `/listing/${encodeId(listingId)}`;
  return `/listing/${MOBILE_PLACEHOLDER_ID}?id=${encodeId(listingId)}`;
}

export function listingEditPath(listingId: string): string {
  if (!isLocalMobileBundleRuntime()) return `/listing/edit/${encodeId(listingId)}`;
  return `/listing/edit/${MOBILE_PLACEHOLDER_ID}?id=${encodeId(listingId)}`;
}

export function resolveRuntimeRouteId(
  routeId: string | null | undefined,
  queryId: string | null | undefined,
): string {
  const normalizedRoute = String(routeId ?? "").trim();
  if (normalizedRoute && normalizedRoute !== MOBILE_PLACEHOLDER_ID) {
    return normalizedRoute;
  }
  return String(queryId ?? "").trim();
}
