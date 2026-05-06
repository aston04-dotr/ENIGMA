export const ALLOWED_LISTING_CITIES: readonly string[] = [];

export type AllowedListingCity = string;

export const RUSSIAN_CITIES: readonly string[] = ALLOWED_LISTING_CITIES;

export const RUSSIAN_CITIES_GEO: readonly string[] = ALLOWED_LISTING_CITIES;

export function isAllowedListingCity(city: string): city is AllowedListingCity {
  return typeof city === "string" && city.trim().length > 0;
}

export function normalizeAllowedListingCity(raw: unknown): AllowedListingCity | null {
  if (typeof raw !== "string") return null;
  const city = raw.trim();
  return isAllowedListingCity(city) ? city : null;
}

export function filterCitiesByQuery(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...ALLOWED_LISTING_CITIES];
  return ALLOWED_LISTING_CITIES.filter((c) => c.toLowerCase().includes(q));
}
