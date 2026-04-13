/** Мгновенное обновление экранов после оплаты BOOST/VIP (без ожидания focus). */
type Handler = (listingId: string) => void;

const handlers = new Set<Handler>();

export function subscribeListingPromotionApplied(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

export function emitListingPromotionApplied(listingId: string): void {
  for (const fn of handlers) {
    try {
      fn(listingId);
    } catch {
      /* ignore */
    }
  }
}

/** После оплаты Boost — то же обновление подписчиков + точка для аналитики. */
export function emitBoostActivated(listingId: string): void {
  emitListingPromotionApplied(listingId);
}

/** После создания объявления — обновить профиль и ленту без ожидания focus. */
type CreatedHandler = () => void;
const createdHandlers = new Set<CreatedHandler>();

export function subscribeListingCreated(h: CreatedHandler): () => void {
  createdHandlers.add(h);
  return () => createdHandlers.delete(h);
}

export function emitListingCreated(): void {
  for (const fn of createdHandlers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
