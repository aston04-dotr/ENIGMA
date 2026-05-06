"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";
import type { Session } from "@supabase/supabase-js";

const { url, anonKey, configured } = getSupabasePublicConfig();

type CookieItem = { name: string; value: string };
type BrowserCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: string | Date;
  sameSite?: "lax" | "strict" | "none" | string;
  secure?: boolean;
};

function getAllCookies(): CookieItem[] {
  if (typeof document === "undefined") return [];
  const raw = document.cookie ? document.cookie.split("; ") : [];
  const out: CookieItem[] = [];
  for (const row of raw) {
    const idx = row.indexOf("=");
    if (idx <= 0) continue;
    const n = row.slice(0, idx);
    const v = row.slice(idx + 1);
    try {
      out.push({
        name: decodeURIComponent(n),
        value: decodeURIComponent(v),
      });
    } catch {
      out.push({ name: n, value: v });
    }
  }
  return out;
}

function writeCookie(
  name: string,
  value: string,
  options: BrowserCookieOptions = {},
) {
  if (typeof document === "undefined") return;
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  const parts: string[] = [
    `${encodedName}=${encodedValue}`,
    `path=${options.path ?? "/"}`,
  ];

  if (typeof options.maxAge === "number" && Number.isFinite(options.maxAge)) {
    parts.push(`max-age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires) {
    const exp =
      options.expires instanceof Date
        ? options.expires.toUTCString()
        : String(options.expires);
    parts.push(`expires=${exp}`);
  }

  if (options.domain) {
    parts.push(`domain=${options.domain}`);
  }

  const sameSite = String(options.sameSite ?? "Lax");
  parts.push(`SameSite=${sameSite}`);

  const shouldUseSecure =
    options.secure ??
    (typeof window !== "undefined" && window.location.protocol === "https:");
  if (shouldUseSecure) {
    parts.push("Secure");
  }
  document.cookie = parts.join("; ");
}

/**
 * Единый browser-клиент: сессия, magic link, Realtime, auth listeners.
 * Cookie-based storage через @supabase/ssr (без localStorage/sessionStorage для auth).
 */
export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  cookies: {
    getAll() {
      return getAllCookies();
    },
    setAll(
      cookiesToSet: Array<{
        name: string;
        value: string;
        options?: BrowserCookieOptions & Record<string, unknown>;
      }>,
    ) {
      cookiesToSet.forEach(({ name, value, options }) => {
        writeCookie(name, value, {
          path: (options?.path as string | undefined) ?? "/",
          domain: options?.domain as string | undefined,
          maxAge:
            typeof options?.maxAge === "number"
              ? options.maxAge
              : undefined,
          expires: options?.expires as string | Date | undefined,
          sameSite:
            (options?.sameSite as string | undefined) ?? "lax",
          secure:
            typeof options?.secure === "boolean"
              ? options.secure
              : undefined,
        });
      });
    },
  },
});

export const isSupabaseConfigured = configured;

let supabaseRestSingleton: SupabaseClient<Database> | null = null;
let refreshInFlight: Promise<void> | null = null;
let refreshCooldownUntilMs = 0;

const AUTH_VERBOSE =
  process.env.NEXT_PUBLIC_AUTH_VERBOSE === "1" ||
  process.env.NEXT_PUBLIC_AUTH_VERBOSE === "true" ||
  process.env.NODE_ENV === "development";

function authLog(
  level: "debug" | "warn" | "error",
  message: string,
  payload?: Record<string, unknown>,
) {
  if (!AUTH_VERBOSE && level === "debug") return;
  const data = payload ?? {};
  if (level === "warn") {
    console.warn(`[auth-guard] ${message}`, data);
    return;
  }
  if (level === "error") {
    console.error(`[auth-guard] ${message}`, data);
    return;
  }
  console.debug(`[auth-guard] ${message}`, data);
}

function getErrorStatus(error: unknown): number {
  const status = Number(
    (error as { status?: unknown; code?: unknown } | null)?.status ??
      (error as { status?: unknown; code?: unknown } | null)?.code ??
      0,
  );
  return Number.isFinite(status) ? status : 0;
}

function extractStack(): string | null {
  try {
    const stack = new Error().stack ?? "";
    const lines = stack.split("\n").slice(2, 7).map((x) => x.trim());
    return lines.length ? lines.join(" | ") : null;
  } catch {
    return null;
  }
}

async function runGuardedRefresh(reason: string): Promise<void> {
  const now = Date.now();
  if (now < refreshCooldownUntilMs) {
    authLog("warn", "refresh skipped by cooldown", {
      reason,
      cooldownLeftMs: refreshCooldownUntilMs - now,
    });
    return;
  }
  if (refreshInFlight) {
    authLog("debug", "joining existing refresh", { reason });
    await refreshInFlight;
    return;
  }

  authLog("debug", "refresh start", { reason, stack: extractStack() });
  refreshInFlight = (async () => {
    const startedAt = Date.now();
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        const status = getErrorStatus(error);
        if (status === 429) {
          refreshCooldownUntilMs = Date.now() + 60_000;
        } else if (status === 400 || status === 401) {
          refreshCooldownUntilMs = Date.now() + 15_000;
        }
        authLog("warn", "refresh failed", {
          reason,
          status,
          message: String((error as { message?: unknown }).message ?? ""),
          cooldownUntilMs: refreshCooldownUntilMs,
        });
        return;
      }
      refreshCooldownUntilMs = 0;
      authLog("debug", "refresh success", {
        reason,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 429) {
        refreshCooldownUntilMs = Date.now() + 60_000;
      } else if (status === 400 || status === 401) {
        refreshCooldownUntilMs = Date.now() + 15_000;
      }
      authLog("error", "refresh crashed", {
        reason,
        status,
        message:
          error instanceof Error ? error.message : String(error ?? "unknown"),
        cooldownUntilMs: refreshCooldownUntilMs,
      });
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  await refreshInFlight;
}

export async function getSessionGuarded(
  reason = "unknown",
  opts?: { allowRefresh?: boolean },
): Promise<{ session: Session | null; error: unknown | null }> {
  const allowRefresh = opts?.allowRefresh !== false;
  const first = await supabase.auth.getSession();
  const firstSession = first.data.session ?? null;
  if (firstSession) return { session: firstSession, error: first.error ?? null };
  if (!allowRefresh) return { session: null, error: first.error ?? null };

  await runGuardedRefresh(reason);

  const second = await supabase.auth.getSession();
  return { session: second.data.session ?? null, error: second.error ?? null };
}

/**
 * Один `createClient` **без** отдельного GoTrue: опция `accessToken` взята из
 * основного `supabase.auth.getSession()`. PostgREST/RPC/Storage/Functions
 * получают `Authorization: Bearer <user_jwt>`, а не `sb_publishable_…`.
 * Не вызывайте `supabaseRest.auth.*` (namespace disabled при `accessToken`).
 */
export function getSupabaseRestWithSession(): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null;
  if (!supabaseRestSingleton) {
    supabaseRestSingleton = createClient<Database>(url, anonKey, {
      /** Один shared GoTrue — `supabase`; здесь только чтение токена для PostgREST. */
      accessToken: async () => {
        const { session } = await getSessionGuarded("rest-access-token", {
          allowRefresh: true,
        });
        return session?.access_token ?? null;
      },
    });
  }
  return supabaseRestSingleton;
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  void supabase.auth.getSession().then(({ data }) => {
    console.log("CURRENT SESSION:", data.session);
  });
}
