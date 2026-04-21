import { RUSSIAN_CITIES } from "./russianCities";
import type { ListingRow } from "./types";

const RUSSIA_CITY_SET = new Set(RUSSIAN_CITIES);

/** Клиентский аналог фильтра РФ: пустой город — временно считаем РФ; иначе город из whitelist. */
export function listingIsRussiaForFeed(l: Pick<ListingRow, "city">): boolean {
  const c = (l.city ?? "").trim();
  if (!c) return false;
  return RUSSIA_CITY_SET.has(c);
}
