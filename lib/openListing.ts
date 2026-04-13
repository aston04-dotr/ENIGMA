import { router } from "expo-router";

/**
 * Переход на карточку: строковый путь надёжнее сопоставляется с app/listing/[id].tsx в Expo Router.
 */
export function openListing(id: string | undefined | null, mode: "push" | "replace" = "push") {
  if (!id) return;
  const sid = String(id).trim();
  if (!sid) return;
  const href = { pathname: "/listing/[id]" as const, params: { id: sid } };
  try {
    if (mode === "replace") router.replace(href);
    else router.push(href);
  } catch (e) {
    console.warn("OPEN LISTING: push failed → replace", e);
    router.replace(href);
  }
}
