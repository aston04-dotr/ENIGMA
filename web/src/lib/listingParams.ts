const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidListingUuid(id: string | undefined | null): id is string {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

/** Нормализует id из query (Expo Go / веб могут отдать string | string[]). */
export function listingIdFromParams(params: { id?: string | string[] }): string | undefined {
  const raw = params.id;
  if (raw == null) return undefined;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || v === "") return undefined;
  const s = String(v).trim();
  return s || undefined;
}

/** Fallback: id из сегментов пути `/listing/<uuid>` (когда params.id пустой). */
export function listingIdFromSegments(segments: readonly string[]): string | undefined {
  const i = segments.indexOf("listing");
  if (i >= 0 && segments[i + 1]) {
    const cand = String(segments[i + 1]).trim();
    if (UUID_RE.test(cand)) return cand;
  }
  for (const seg of segments) {
    const s = String(seg).trim();
    if (UUID_RE.test(s)) return s;
  }
  return undefined;
}

export function resolveListingRouteId(
  local: { id?: string | string[] },
  global: { id?: string | string[] },
  segments: readonly string[]
): string | undefined {
  const a = listingIdFromParams(local) ?? listingIdFromParams(global) ?? listingIdFromSegments(segments);
  return a?.trim() || undefined;
}
