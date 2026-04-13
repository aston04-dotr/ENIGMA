/** Пороги доверия (см. миграции trust / soft restrictions). */
export const TRUST_SHADOW = 15;
export const TRUST_EDIT = 20;
export const TRUST_CHAT_NEW = 30;

export type TrustLevel = "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";

export function getTrustLevel(score: number | null | undefined): TrustLevel {
  const s = score == null ? 100 : score;
  if (s >= 80) return "HIGH";
  if (s >= 50) return "MEDIUM";
  if (s >= TRUST_EDIT) return "LOW";
  return "CRITICAL";
}

export function isShadowUser(score: number | null | undefined): boolean {
  const s = score == null ? 100 : score;
  return s < TRUST_SHADOW;
}

export function canStartNewChat(score: number | null | undefined): boolean {
  const s = score == null ? 100 : score;
  return s >= TRUST_CHAT_NEW;
}

export function canEditListingsAndListingPhotos(score: number | null | undefined): boolean {
  const s = score == null ? 100 : score;
  return s >= TRUST_EDIT;
}
