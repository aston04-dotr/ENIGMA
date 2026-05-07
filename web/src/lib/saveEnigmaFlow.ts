const STORAGE_KEY = "enigma:save-flow:v1";
const CONTINUATION_ROUTE_KEY = "enigma:save-enigma:continue-route";
const PENDING_CHAT_INTENT_KEY = "enigma:save-enigma:pending-chat-intent";
const PROMPT_THRESHOLDS = [4, 9, 15];
const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type SaveFlowState = {
  score: number;
  promptsShown: number;
  dismissedUntilMs: number;
  actions: Record<string, number>;
  lastActionAtMs: number;
  visits: number;
  lastVisitDay: string;
  activeTicksToday: number;
  activeTickDay: string;
};

function initialState(): SaveFlowState {
  return {
    score: 0,
    promptsShown: 0,
    dismissedUntilMs: 0,
    actions: {},
    lastActionAtMs: 0,
    visits: 0,
    lastVisitDay: "",
    activeTicksToday: 0,
    activeTickDay: "",
  };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function readState(): SaveFlowState {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<SaveFlowState>;
    return {
      ...initialState(),
      ...parsed,
      actions:
        parsed.actions && typeof parsed.actions === "object"
          ? (parsed.actions as Record<string, number>)
          : {},
    };
  } catch {
    return initialState();
  }
}

function writeState(state: SaveFlowState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function recordMeaningfulAction(action: string, weight = 1): void {
  const key = String(action || "").trim();
  if (!key) return;
  const state = readState();
  const now = Date.now();
  state.actions[key] = Math.max(0, Number(state.actions[key] ?? 0)) + 1;
  state.lastActionAtMs = now;
  state.score += Math.max(1, Math.floor(weight));
  writeState(state);
}

export function registerVisitForSaveFlow(): void {
  const state = readState();
  const day = todayKey();
  if (state.lastVisitDay !== day) {
    const isReturning = state.visits > 0;
    state.visits += 1;
    state.lastVisitDay = day;
    if (isReturning) {
      state.score += 2;
      state.actions.return_visit = Math.max(0, Number(state.actions.return_visit ?? 0)) + 1;
    }
    writeState(state);
  }
}

export function registerActiveUsageTick(): void {
  const state = readState();
  const day = todayKey();
  if (state.activeTickDay !== day) {
    state.activeTickDay = day;
    state.activeTicksToday = 0;
  }
  if (state.activeTicksToday >= 4) {
    writeState(state);
    return;
  }
  state.activeTicksToday += 1;
  state.score += 1;
  state.actions.long_activity = Math.max(0, Number(state.actions.long_activity ?? 0)) + 1;
  writeState(state);
}

export function shouldShowSaveEnigmaPrompt(): boolean {
  const state = readState();
  const now = Date.now();
  if (state.dismissedUntilMs > now) return false;
  const idx = Math.min(state.promptsShown, PROMPT_THRESHOLDS.length - 1);
  const threshold = PROMPT_THRESHOLDS[idx] ?? PROMPT_THRESHOLDS[PROMPT_THRESHOLDS.length - 1]!;
  return state.score >= threshold;
}

export function markSaveEnigmaPromptShown(): void {
  const state = readState();
  state.promptsShown += 1;
  writeState(state);
}

export function dismissSaveEnigmaPrompt(cooldownMs = DEFAULT_COOLDOWN_MS): void {
  const state = readState();
  state.dismissedUntilMs = Date.now() + Math.max(60_000, cooldownMs);
  writeState(state);
}

export function rememberSaveEnigmaContinuationRoute(path?: string): void {
  if (typeof window === "undefined") return;
  const route =
    String(path ?? `${window.location.pathname}${window.location.search}${window.location.hash}`).trim();
  if (!route.startsWith("/")) return;
  try {
    window.localStorage.setItem(CONTINUATION_ROUTE_KEY, route);
  } catch {
    // ignore
  }
}

export function consumeSaveEnigmaContinuationRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const route = String(window.localStorage.getItem(CONTINUATION_ROUTE_KEY) ?? "").trim();
    window.localStorage.removeItem(CONTINUATION_ROUTE_KEY);
    if (!route.startsWith("/")) return null;
    return route;
  } catch {
    return null;
  }
}

type PendingChatIntent = {
  peerUserId: string;
  listingId: string | null;
  createdAtMs: number;
};

export function rememberPendingChatIntent(peerUserId: string, listingId?: string | null): void {
  if (typeof window === "undefined") return;
  const peer = String(peerUserId ?? "").trim();
  if (!peer) return;
  const payload: PendingChatIntent = {
    peerUserId: peer,
    listingId: listingId ? String(listingId) : null,
    createdAtMs: Date.now(),
  };
  try {
    window.localStorage.setItem(PENDING_CHAT_INTENT_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function consumePendingChatIntent(maxAgeMs = 30 * 60 * 1000): PendingChatIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_CHAT_INTENT_KEY);
    window.localStorage.removeItem(PENDING_CHAT_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingChatIntent>;
    const peerUserId = String(parsed.peerUserId ?? "").trim();
    if (!peerUserId) return null;
    const createdAtMs = Number(parsed.createdAtMs ?? 0);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
    if (Date.now() - createdAtMs > Math.max(60_000, maxAgeMs)) return null;
    return {
      peerUserId,
      listingId: parsed.listingId ? String(parsed.listingId) : null,
      createdAtMs,
    };
  } catch {
    return null;
  }
}
