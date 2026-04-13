import type { ListingRow } from "./types";

/** Лёгкий in-memory кэш строк ленты → мгновенный первый кадр на экране объявления (без React Query). */
const MAX = 200;
const map = new Map<string, ListingRow>();

export function stashListingRow(row: ListingRow) {
  if (!row?.id) return;
  map.set(String(row.id), { ...row });
  while (map.size > MAX) {
    const k = map.keys().next().value;
    if (k !== undefined) map.delete(k);
    else break;
  }
}

export function stashListingsFromFeed(rows: ListingRow[]) {
  for (const r of rows) stashListingRow(r);
}

export function peekStashedListing(id: string): ListingRow | undefined {
  const r = map.get(String(id));
  return r ? { ...r } : undefined;
}
