import raw from "./russianCities.json";

/** Первый пункт — объявление по всей стране; далее Сочи и крупные города РФ. */
export const RUSSIAN_CITIES: readonly string[] = raw as string[];

export const CITY_ALL_RUSSIA = "Вся Россия";

/** Города для сидов (без дублирования «Вся Россия» в каждой строке — её добавляет скрипт отдельно). */
export const RUSSIAN_CITIES_GEO: readonly string[] = RUSSIAN_CITIES.filter((c) => c !== CITY_ALL_RUSSIA);

export function filterCitiesByQuery(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...RUSSIAN_CITIES];
  return RUSSIAN_CITIES.filter((c) => c.toLowerCase().includes(q));
}
