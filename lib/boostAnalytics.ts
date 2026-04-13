export type BoostAnalyticsEvent =
  | "boost_click"
  | "boost_payment_open"
  | "boost_paid"
  | "boost_expired_seen";

export function trackBoostEvent(name: BoostAnalyticsEvent, meta?: Record<string, unknown>): void {
  const payload = { name, ...meta, t: Date.now() };
  console.info("[boost_analytics]", payload);
}
