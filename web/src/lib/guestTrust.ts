const MESSAGE_WINDOW_MS = 15_000;
const HARD_BURST_LIMIT = 7;
const SOFT_THROTTLE_MS = 900;
const COOLDOWN_MS = 12_000;

const TRUST_STORAGE_PREFIX = "enigma:guest:trust:chat:";

type TrustWindowState = {
  sentAt: number[];
  cooldownUntil: number;
};

export type GuestMessageTrustDecision = {
  allowed: boolean;
  retryAfterMs: number;
  reason: "ok" | "cooldown" | "soft_throttle" | "burst_detected";
  suspiciousBurst: boolean;
};

function loadState(key: string): TrustWindowState {
  if (typeof window === "undefined") {
    return { sentAt: [], cooldownUntil: 0 };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { sentAt: [], cooldownUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<TrustWindowState>;
    return {
      sentAt: Array.isArray(parsed.sentAt)
        ? parsed.sentAt.filter((v) => Number.isFinite(v)).map((v) => Number(v))
        : [],
      cooldownUntil: Number(parsed.cooldownUntil ?? 0) || 0,
    };
  } catch {
    return { sentAt: [], cooldownUntil: 0 };
  }
}

function saveState(key: string, state: TrustWindowState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function canSendGuestMessage(opts: {
  actorScope: string;
  chatId: string;
  nowMs?: number;
}): GuestMessageTrustDecision {
  const now = Number(opts.nowMs ?? Date.now());
  const key = `${TRUST_STORAGE_PREFIX}${opts.actorScope}:${opts.chatId}`;
  const state = loadState(key);

  if (state.cooldownUntil > now) {
    return {
      allowed: false,
      retryAfterMs: Math.max(300, state.cooldownUntil - now),
      reason: "cooldown",
      suspiciousBurst: true,
    };
  }

  const filtered = state.sentAt.filter((ts) => ts > now - MESSAGE_WINDOW_MS);
  const lastSent = filtered.length ? filtered[filtered.length - 1] ?? 0 : 0;
  const delta = now - lastSent;

  if (delta > 0 && delta < SOFT_THROTTLE_MS) {
    return {
      allowed: false,
      retryAfterMs: SOFT_THROTTLE_MS - delta,
      reason: "soft_throttle",
      suspiciousBurst: false,
    };
  }

  filtered.push(now);
  if (filtered.length >= HARD_BURST_LIMIT) {
    const nextState: TrustWindowState = {
      sentAt: filtered,
      cooldownUntil: now + COOLDOWN_MS,
    };
    saveState(key, nextState);
    return {
      allowed: false,
      retryAfterMs: COOLDOWN_MS,
      reason: "burst_detected",
      suspiciousBurst: true,
    };
  }

  saveState(key, { sentAt: filtered, cooldownUntil: 0 });
  return { allowed: true, retryAfterMs: 0, reason: "ok", suspiciousBurst: false };
}
