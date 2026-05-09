"use client";

import type { UserRow } from "@/lib/types";

const PREFIX = "enigma.profile.overlay.v1:";

export type CachedProfileOverlay = {
  name: string | null;
  phone: string | null;
  trust_score?: number | null;
  /** Дубль `UserRow.public_id` для мгновенного UI. */
  public_id?: string | null;
  cached_at: number;
};

function key(uid: string): string {
  return `${PREFIX}${uid}`;
}

function pickNonEmpty(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const a = typeof primary === "string" ? primary.trim() : "";
  if (a) return a;
  const b = typeof fallback === "string" ? fallback.trim() : "";
  return b ? b : null;
}

export function readProfileCache(uid: string): CachedProfileOverlay | null {
  if (typeof window === "undefined" || !uid) return null;
  try {
    const raw = window.localStorage.getItem(key(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfileOverlay;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.cached_at === "number"
    ) {
      return parsed;
    }
  } catch {
    /* noop */
  }
  return null;
}

export function profileRowHasPersistedIdentity(
  row: UserRow | null | undefined,
): boolean {
  const n = typeof row?.name === "string" ? row.name.trim() : "";
  const p = typeof row?.phone === "string" ? row.phone.trim() : "";
  return Boolean(n || p);
}

/** Есть ли в overlay сохранённые имя или телефон (до полного bootstrap в React). */
export function profileCacheHasPersistedIdentity(uid: string): boolean {
  const c = readProfileCache(uid);
  if (!c) return false;
  const n = typeof c.name === "string" ? c.name.trim() : "";
  const p = typeof c.phone === "string" ? c.phone.trim() : "";
  return Boolean(n || p);
}

export function persistProfileCacheOverlay(uid: string, row: UserRow): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    const payload: CachedProfileOverlay = {
      name: typeof row.name === "string" ? row.name.trim() || null : null,
      phone: typeof row.phone === "string" ? row.phone.trim() || null : null,
      trust_score: row.trust_score ?? null,
      public_id: row.public_id ?? uid,
      cached_at: Date.now(),
    };
    window.localStorage.setItem(key(uid), JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

/**
 * Однажды сохранённые имя/телефон не пропадают из UI при гонке сети или до SELECT:
 * непустое с сервера имеет приоритет; пустое/отсутствующее на сервере не затирает
 * непустое из overlay (pickNonEmpty(server, cache)).
 */
export function mergeServerProfileWithCache(server: UserRow, uid: string): UserRow {
  const cache = readProfileCache(uid);
  if (!cache) return server;

  return {
    ...server,
    name: pickNonEmpty(server.name, cache.name),
    phone: pickNonEmpty(server.phone, cache.phone),
    trust_score:
      server.trust_score != null ? server.trust_score : cache.trust_score ?? null,
    public_id: server.public_id || cache.public_id || uid,
  };
}

export function bootstrapProfileFromCache(
  uid: string,
  email: string | null,
): UserRow | null {
  const cache = readProfileCache(uid);
  if (!cache) return null;
  return {
    id: uid,
    name: cache.name ?? null,
    phone: cache.phone ?? null,
    phone_updated_at: null,
    device_id: null,
    email,
    avatar: null,
    public_id: cache.public_id?.trim() || uid,
    created_at: new Date(cache.cached_at).toISOString(),
    trust_score: cache.trust_score ?? null,
  };
}
