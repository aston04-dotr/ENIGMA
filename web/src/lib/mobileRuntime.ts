/** PWA / web URL helpers (installable web app; no hybrid shell). */

const LEGACY_STATIC_PLACEHOLDER_ID = "__mobile__";

function encodeId(id: string): string {
  return encodeURIComponent(String(id || "").trim());
}

export function chatPath(chatId: string): string {
  return `/chat/${encodeId(chatId)}`;
}

export function listingPath(listingId: string): string {
  return `/listing/${encodeId(listingId)}`;
}

export function listingEditPath(listingId: string): string {
  return `/listing/edit/${encodeId(listingId)}`;
}

/**
 * Resolves dynamic route param + optional `?id=` (legacy static-export placeholder).
 */
export function resolveRuntimeRouteId(
  routeId: string | null | undefined,
  queryId: string | null | undefined,
): string {
  const normalizedRoute = String(routeId ?? "").trim();
  if (normalizedRoute && normalizedRoute !== LEGACY_STATIC_PLACEHOLDER_ID) {
    return normalizedRoute;
  }
  return String(queryId ?? "").trim();
}
