import { RUSSIAN_CITIES } from "./russianCities";
import type { ListingRow } from "./types";

void RUSSIAN_CITIES;

/** Клиентский аналог фильтра РФ: пустой город — временно считаем РФ; иначе город из whitelist. */
export function listingIsRussiaForFeed(l: Pick<ListingRow, "city">): boolean {
  const c = (l.city ?? "").trim();
  return c.length > 0;
}
