const GUEST_STORAGE_KEY = "enigma:guest:identity:v1";
const GUEST_COOKIE_KEY = "enigma_guest_uuid";
const GUEST_SCOPE_PREFIX = "g:";
const USER_SCOPE_PREFIX = "u:";

const GUEST_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

type GuestIdentityStored = {
  guest_uuid: string;
  created_at: string;
  anon_short_id: string;
};

export type GuestIdentity = GuestIdentityStored & {
  fingerprint: string;
};

function safeGetLocalStorageItem(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(key) ?? "");
  } catch {
    return "";
  }
}

function safeSetLocalStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readCookieValue(key: string): string {
  if (typeof document === "undefined") return "";
  const all = String(document.cookie ?? "");
  if (!all) return "";
  const chunks = all.split(";");
  for (const chunk of chunks) {
    const [k, ...rest] = chunk.trim().split("=");
    if (k !== key) continue;
    return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

function writeCookieValue(key: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${key}=${encodeURIComponent(value)}; path=/; max-age=${GUEST_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

function buildShortId(uuid: string): string {
  const cleaned = String(uuid ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return cleaned.slice(-6) || "ANON";
}

function safeRandomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 12);
  return `guest-${Date.now().toString(36)}-${rand}`;
}

function parseStored(raw: string): GuestIdentityStored | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestIdentityStored>;
    const guest_uuid = String(parsed.guest_uuid ?? "").trim();
    const created_at = String(parsed.created_at ?? "").trim();
    if (!guest_uuid || !created_at) return null;
    return {
      guest_uuid,
      created_at,
      anon_short_id: String(parsed.anon_short_id ?? buildShortId(guest_uuid)),
    };
  } catch {
    return null;
  }
}

function makeFingerprint(uuid: string): string {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return `fp:${uuid.slice(-8)}`;
  }
  const tz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    String(new Date().getTimezoneOffset());
  const entropy = [
    uuid,
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    tz,
  ].join("|");

  // Fast deterministic hash for local soft-abuse heuristics.
  let hash = 2166136261;
  for (let i = 0; i < entropy.length; i += 1) {
    hash ^= entropy.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp:${(hash >>> 0).toString(16)}`;
}

function persistIdentity(stored: GuestIdentityStored): void {
  safeSetLocalStorageItem(GUEST_STORAGE_KEY, JSON.stringify(stored));
  writeCookieValue(GUEST_COOKIE_KEY, stored.guest_uuid);
}

export function getOrCreateGuestIdentity(): GuestIdentity {
  const fromStorage = parseStored(safeGetLocalStorageItem(GUEST_STORAGE_KEY));
  const fromCookie = String(readCookieValue(GUEST_COOKIE_KEY) ?? "").trim();

  const resolved: GuestIdentityStored =
    fromStorage ??
    (fromCookie
      ? {
          guest_uuid: fromCookie,
          created_at: new Date().toISOString(),
          anon_short_id: buildShortId(fromCookie),
        }
      : {
          guest_uuid: safeRandomUuid(),
          created_at: new Date().toISOString(),
          anon_short_id: "",
        });

  if (!resolved.anon_short_id) {
    resolved.anon_short_id = buildShortId(resolved.guest_uuid);
  }

  persistIdentity(resolved);

  return {
    ...resolved,
    fingerprint: makeFingerprint(resolved.guest_uuid),
  };
}

export function getActorScope(userId: string | null | undefined): string {
  const uid = String(userId ?? "").trim();
  if (uid) return `${USER_SCOPE_PREFIX}${uid}`;
  return `${GUEST_SCOPE_PREFIX}${getOrCreateGuestIdentity().guest_uuid}`;
}

export function normalizeChatParticipantName(rawName: string | null | undefined): string {
  const original = String(rawName ?? "").trim();
  if (!original) return "Пользователь Enigma";
  const normalized = original.toLowerCase();
  if (normalized.startsWith("гость") || normalized.startsWith("guest")) {
    return "Пользователь Enigma";
  }
  return original;
}

export function getGuestIdentityStorageKey(): string {
  return GUEST_STORAGE_KEY;
}

export function createGuestMessageNonce(chatId: string): string {
  const seed = `${chatId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `gn-${hash.toString(16)}-${seed.slice(-8)}`;
}
