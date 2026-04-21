export const ALLOWED_LISTING_CITIES = ["Москва", "Сочи"] as const;

export type AllowedListingCity = (typeof ALLOWED_LISTING_CITIES)[number];

export const RUSSIAN_CITIES: readonly string[] = ALLOWED_LISTING_CITIES;

export const RUSSIAN_CITIES_GEO: readonly string[] = ALLOWED_LISTING_CITIES;

const ALLOWED_CITY_SET = new Set<string>(ALLOWED_LISTING_CITIES);

export function isAllowedListingCity(city: string): city is AllowedListingCity {
  return ALLOWED_CITY_SET.has(city);
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
