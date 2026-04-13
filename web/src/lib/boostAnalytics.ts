export type BoostAnalyticsEvent =
  | "boost_click"
  | "boost_payment_open"
  | "boost_paid"
  | "boost_expired_seen"
  | "vip_click"
  | "top_click";

export function trackBoostEvent(name: BoostAnalyticsEvent, meta?: Record<string, unknown>): void {
  const payload = { name, ...meta, t: Date.now() };
  console.info("[boost_analytics]", payload);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("enigma:analytics", { detail: payload }));
  }
}
