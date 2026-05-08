"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./supabase.types";
import { getSupabasePublicConfig } from "./runtimeConfig";
import type { Session } from "@supabase/supabase-js";

const { url, anonKey, configured } = getSupabasePublicConfig();
const AUTH_STORAGE_KEY = "enigma.supabase.auth.v1";
const AUTH_PROMISE_TIMEOUT_MS = 12_000;

function isNativeCapacitorRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  try {
    if (cap?.isNativePlatform?.()) return true;
  } catch {
    // noop
  }
  return false;
}

if (typeof window !== "undefined") {
  const runtime = isNativeCapacitorRuntime() ? "native" : "web";
  if (!configured) {
    console.error("[auth-config] missing_public_supabase_env", {
      runtime,
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey),
    });
  } else if (process.env.NEXT_PUBLIC_AUTH_VERBOSE === "1" || process.env.NODE_ENV === "development") {
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      host = "";
    }
    console.debug("[auth-config] supabase_public_env_loaded", {
      runtime,
      host,
      anonKeySuffix: anonKey.slice(-8),
    });
  }
}

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
  authLog("debug", "cookie read", { count: out.length });
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
  authLog("debug", "cookie write", {
    name,
    valueSuffix: tokenSuffix(value),
    sameSite,
    secure: shouldUseSecure,
  });
}

/**
 * Единый browser-клиент: сессия, magic link, Realtime, auth listeners.
 * Cookie-based storage через @supabase/ssr (без localStorage/sessionStorage для auth).
 */
export const supabase = createBrowserClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNativeCapacitorRuntime(),
    storageKey: AUTH_STORAGE_KEY,
    multiTab: false,
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

function instrumentSupabaseAuthLifecycle() {
  if (typeof window === "undefined") return;
  const authObj = supabase.auth as unknown as {
    __enigmaAuthLifecyclePatched?: boolean;
    getSession: () => Promise<{ data: { session: Session | null }; error: { message?: string; status?: number } | null }>;
    refreshSession: () => Promise<{ data: { session: Session | null }; error: { message?: string; status?: number } | null }>;
    signOut: (opts?: unknown) => Promise<{ error: { message?: string; status?: number } | null }>;
    setSession: (session: unknown) => Promise<{ data: { session: Session | null }; error: { message?: string; status?: number } | null }>;
  };
  if (authObj.__enigmaAuthLifecyclePatched) return;
  authObj.__enigmaAuthLifecyclePatched = true;

  const wrap = <TArgs extends unknown[], TResult>(
    method: "getSession" | "refreshSession" | "signOut" | "setSession",
  ) => {
    const original = (authObj[method] as (...args: TArgs) => Promise<TResult>).bind(authObj);
    (authObj[method] as (...args: TArgs) => Promise<TResult>) = (async (...args: TArgs) => {
      const callId = ++authTraceSeq;
      const stack = getFullStack();
      authTrace(`${method}:call`, {
        callId,
        args: sanitizeAuthMethodArgs(method, args),
        callsite: stack,
      });
      try {
        const result = await original(...args);
        const resultRecord = result as unknown as {
          data?: { session?: Session | null };
          error?: { message?: string; status?: number } | null;
        };
        const message = String(resultRecord?.error?.message ?? "");
        const status = Number(resultRecord?.error?.status ?? 0);
        authTrace(`${method}:result`, {
          callId,
          hasSession: Boolean(resultRecord?.data?.session?.user),
          accessTokenSuffix: tokenSuffix(resultRecord?.data?.session?.access_token),
          refreshTokenSuffix: tokenSuffix(resultRecord?.data?.session?.refresh_token),
          errorMessage: message || null,
          errorStatus: Number.isFinite(status) ? status : 0,
        });
        if (message.includes("Auth session missing!")) {
          authTrace("auth-session-missing-source", {
            callId,
            method,
            stack,
            args: sanitizeAuthMethodArgs(method, args),
          });
        }
        return result;
      } catch (error) {
        authTrace(`${method}:throw`, {
          callId,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack ?? "" : stack,
        });
        throw error;
      }
    }) as (...args: TArgs) => Promise<TResult>;
  };

  wrap("getSession");
  wrap("refreshSession");
  wrap("signOut");
  wrap("setSession");
}

instrumentSupabaseAuthLifecycle();

export const isSupabaseConfigured = configured;

let supabaseRestSingleton: SupabaseClient<Database> | null = null;
let refreshInFlight: Promise<void> | null = null;
let sessionGuardInFlight: Promise<{ session: Session | null; error: unknown | null }> | null = null;
let lastResolvedSessionResult: { session: Session | null; error: unknown | null } | null = null;
let lastResolvedAt = 0;
const sessionGuardCallTimestamps: number[] = [];
const sessionGuardReasonStacks: string[] = [];
let refreshCooldownUntilMs = 0;
let refreshDisabledUntilMs = 0;
let authTraceSeq = 0;
const SESSION_GUARD_THROTTLE_MS = 1_200;
const SESSION_GUARD_STORM_WINDOW_MS = 5_000;
const SESSION_GUARD_STORM_LIMIT = 8;

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
  const serialized = (() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  })();
  if (level === "warn") {
    console.warn(`[auth-guard] ${message}`, serialized);
    return;
  }
  if (level === "error") {
    console.error(`[auth-guard] ${message}`, serialized);
    return;
  }
  console.debug(`[auth-guard] ${message}`, serialized);
}

function tokenSuffix(value: string | null | undefined): string {
  const token = String(value ?? "").trim();
  if (!token) return "";
  return token.slice(-8);
}

function authTrace(event: string, payload?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    console.log(
      "[auth-trace]",
      JSON.stringify(
        {
          event,
          ts: new Date().toISOString(),
          ...payload,
        },
        null,
        2,
      ),
    );
  } catch {
    console.log("[auth-trace]", event);
  }
}

function getFullStack(): string {
  try {
    return new Error().stack ?? "";
  } catch {
    return "";
  }
}

function sanitizeAuthMethodArgs(method: string, args: unknown[]): unknown {
  if (method !== "setSession") return args;
  const first = (args[0] ?? null) as { access_token?: string; refresh_token?: string } | null;
  return [
    {
      accessTokenSuffix: tokenSuffix(first?.access_token),
      refreshTokenSuffix: tokenSuffix(first?.refresh_token),
    },
  ];
}

function listStorageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    keys.push(key);
  }
  return keys;
}

function listAuthRelatedStorageKeys(storage: Storage): string[] {
  return listStorageKeys(storage).filter((key) => {
    const normalized = key.toLowerCase();
    return (
      normalized.startsWith("sb-") ||
      normalized.includes("supabase") ||
      normalized.includes(AUTH_STORAGE_KEY.toLowerCase())
    );
  });
}

function listAuthRelatedCookieNames(): string[] {
  if (typeof document === "undefined") return [];
  return document.cookie
    .split(";")
    .map((entry) => entry.trim().split("=")[0] ?? "")
    .filter(Boolean)
    .filter((name) => {
      const normalized = name.toLowerCase();
      return normalized.startsWith("sb-") || normalized.includes("supabase");
    });
}

export async function debugAuthPersistenceSnapshot(label: string): Promise<void> {
  if (typeof window === "undefined") return;
  let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null;
  let sessionError: string | null = null;
  try {
    const result = await withTimeout(
      supabase.auth.getSession(),
      AUTH_PROMISE_TIMEOUT_MS,
      `debugAuthPersistenceSnapshot:${label}`,
    );
    sessionData = result.data.session ?? null;
  } catch (error) {
    sessionError = error instanceof Error ? error.message : String(error ?? "unknown");
  }

  console.log(
    "[auth-persist] snapshot",
    JSON.stringify(
      {
        label,
        runtimeOrigin: window.location.origin,
        protocol: window.location.protocol,
        hasSession: Boolean(sessionData?.user),
        accessTokenSuffix: tokenSuffix(sessionData?.access_token),
        refreshTokenSuffix: tokenSuffix(sessionData?.refresh_token),
        sessionError,
        expectedStorageKey: AUTH_STORAGE_KEY,
        localStorageAuthKeys: listAuthRelatedStorageKeys(window.localStorage),
        sessionStorageAuthKeys: listAuthRelatedStorageKeys(window.sessionStorage),
        cookieAuthKeys: listAuthRelatedCookieNames(),
      },
      null,
      2,
    ),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label}:timeout:${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function getErrorStatus(error: unknown): number {
  const status = Number(
    (error as { status?: unknown; code?: unknown } | null)?.status ??
      (error as { status?: unknown; code?: unknown } | null)?.code ??
      0,
  );
  return Number.isFinite(status) ? status : 0;
}

function isStaleRefreshTokenError(error: unknown): boolean {
  const status = getErrorStatus(error);
  const msg = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    status === 400 ||
    msg.includes("already used") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found")
  );
}

function clearAuthStorageByPrefix(): void {
  if (typeof window === "undefined") return;
  const prefixes = ["sb-", "supabase", AUTH_STORAGE_KEY];
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        const normalized = key.toLowerCase();
        if (prefixes.some((prefix) => normalized.startsWith(prefix) || normalized.includes(prefix))) {
          keys.push(key);
        }
      }
      keys.forEach((key) => storage.removeItem(key));
      authLog("debug", "storage keys cleared", {
        storage: storage === window.localStorage ? "localStorage" : "sessionStorage",
        removedCount: keys.length,
      });
    } catch (error) {
      authLog("warn", "storage clear failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function clearSupabaseCookies(): void {
  if (typeof document === "undefined") return;
  try {
    const cookieNames = document.cookie
      .split(";")
      .map((x) => x.trim().split("=")[0] ?? "")
      .filter(Boolean)
      .filter((name) => {
        const normalized = name.toLowerCase();
        return normalized.startsWith("sb-") || normalized.includes("supabase");
      });
    cookieNames.forEach((name) => {
      document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    });
    authLog("debug", "cookies cleared", { removedCount: cookieNames.length });
  } catch (error) {
    authLog("warn", "cookie clear failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function disableAuthRefresh(reason: string): void {
  authTrace("disableAuthRefresh", {
    reason,
    callsite: getFullStack(),
  });
  refreshDisabledUntilMs = Date.now() + 60_000;
  refreshCooldownUntilMs = Math.max(refreshCooldownUntilMs, refreshDisabledUntilMs);
  authLog("warn", "refresh temporarily disabled", {
    reason,
    disabledUntilMs: refreshDisabledUntilMs,
    cooldownUntilMs: refreshCooldownUntilMs,
  });
}

export async function hardResetSupabaseAuthState(reason: string): Promise<void> {
  authTrace("hardResetSupabaseAuthState:start", {
    reason,
    callsite: getFullStack(),
  });
  disableAuthRefresh(reason);
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    authLog("warn", "local signOut failed during hard reset", {
      reason,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  clearAuthStorageByPrefix();
  clearSupabaseCookies();
  authTrace("hardResetSupabaseAuthState:done", { reason });
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

function extractFullStack(): string {
  try {
    return new Error().stack ?? "";
  } catch {
    return "";
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

type RpcClient = {
  rpc: (...args: unknown[]) => unknown;
  __enigmaRpcDebugPatched?: boolean;
};

function instrumentRpcDebug(client: RpcClient, label: string): void {
  if (client.__enigmaRpcDebugPatched) return;
  client.__enigmaRpcDebugPatched = true;
  const originalRpc = client.rpc.bind(client);
  client.rpc = (...args: unknown[]) => {
    const callsite = extractStack();
    let result: unknown;
    try {
      result = originalRpc(...args);
    } catch (error) {
      console.error("[rpc-debug] rpc threw synchronously", {
        label,
        args,
        callsite,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const hasThen = Boolean(result && typeof (result as { then?: unknown }).then === "function");
    const hasCatch = Boolean(result && typeof (result as { catch?: unknown }).catch === "function");
    if (!hasCatch) {
      const payload = {
        label,
        args,
        argsJson: safeStringify(args),
        hasThen,
        hasCatch,
        callsite,
        fullCallsite: extractFullStack(),
      };
      console.error("[rpc-debug] rpc returned non-catchable value", payload);
      // Ensure runtime remains catch-compatible while we investigate caller chain.
      return Promise.resolve(result as never);
    }
    return result;
  };
}

if (typeof window !== "undefined") {
  instrumentRpcDebug(supabase as unknown as RpcClient, "browser-client");
}

async function runGuardedRefresh(reason: string): Promise<void> {
  authTrace("runGuardedRefresh:start", {
    reason,
    callsite: getFullStack(),
  });
  const now = Date.now();
  if (now < refreshDisabledUntilMs) {
    authLog("warn", "refresh skipped: disabled window active", {
      reason,
      disabledLeftMs: refreshDisabledUntilMs - now,
    });
    return;
  }
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
      const { error } = await withTimeout(
        supabase.auth.refreshSession(),
        AUTH_PROMISE_TIMEOUT_MS,
        `refreshSession:${reason}`,
      );
      if (error) {
        const status = getErrorStatus(error);
        if (status === 429) {
          refreshCooldownUntilMs = Date.now() + 60_000;
        } else if (status === 400 || status === 401) {
          refreshCooldownUntilMs = Date.now() + 15_000;
        }
        if (isStaleRefreshTokenError(error)) {
          await hardResetSupabaseAuthState("stale_refresh_token_during_refresh");
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

async function getSessionGuardedInner(
  reason = "unknown",
  opts?: { allowRefresh?: boolean; forceRefresh?: boolean },
): Promise<{ session: Session | null; error: unknown | null }> {
  const allowRefresh = opts?.allowRefresh !== false;
  const first = await withTimeout(
    supabase.auth.getSession(),
    AUTH_PROMISE_TIMEOUT_MS,
    `getSession:first:${reason}`,
  ).catch((error) => ({
    data: { session: null },
    error,
  }));
  const firstSession = first.data.session ?? null;
  if (firstSession) {
    authLog("debug", "session read (first)", {
      reason,
      refreshTokenSuffix: tokenSuffix(firstSession.refresh_token),
      accessTokenSuffix: tokenSuffix(firstSession.access_token),
    });
    return { session: firstSession, error: first.error ?? null };
  }
  if (!allowRefresh) return { session: null, error: first.error ?? null };

  await runGuardedRefresh(reason);

  const second = await withTimeout(
    supabase.auth.getSession(),
    AUTH_PROMISE_TIMEOUT_MS,
    `getSession:second:${reason}`,
  ).catch((error) => ({
    data: { session: null },
    error,
  }));
  const secondSession = second.data.session ?? null;
  if (secondSession) {
    authLog("debug", "session read (after refresh)", {
      reason,
      refreshTokenSuffix: tokenSuffix(secondSession.refresh_token),
      accessTokenSuffix: tokenSuffix(secondSession.access_token),
    });
  } else if (second.error && isStaleRefreshTokenError(second.error)) {
    await hardResetSupabaseAuthState("stale_refresh_token_after_refresh");
  }
  return { session: secondSession, error: second.error ?? null };
}

export async function getSessionGuarded(
  reason = "unknown",
  opts?: { allowRefresh?: boolean; forceRefresh?: boolean },
): Promise<{ session: Session | null; error: unknown | null }> {
  const reasonStack = new Error().stack ?? "";
  console.warn(
    "[getSessionGuarded:reason]",
    reason,
    reasonStack,
  );
  const now = Date.now();
  sessionGuardCallTimestamps.push(now);
  sessionGuardReasonStacks.push(`[${new Date(now).toISOString()}] ${reason}\n${reasonStack}`);
  while (
    sessionGuardCallTimestamps.length > 0 &&
    now - sessionGuardCallTimestamps[0]! > SESSION_GUARD_STORM_WINDOW_MS
  ) {
    sessionGuardCallTimestamps.shift();
    sessionGuardReasonStacks.shift();
  }
  if (sessionGuardCallTimestamps.length > SESSION_GUARD_STORM_LIMIT) {
    console.error("[AUTH_STORM_DETECTED]", sessionGuardReasonStacks.join("\n---\n"));
  }
  authTrace("getSessionGuarded:call", {
    reason,
    allowRefresh: opts?.allowRefresh !== false,
    callsite: getFullStack(),
  });
  const forceRefresh = opts?.forceRefresh === true;
  const explicitAllowRefreshTrue = opts?.allowRefresh === true;
  if (
    !forceRefresh &&
    !explicitAllowRefreshTrue &&
    lastResolvedSessionResult &&
    Date.now() - lastResolvedAt < SESSION_GUARD_THROTTLE_MS
  ) {
    authTrace("getSessionGuarded:cache-hit", {
      reason,
      ageMs: Date.now() - lastResolvedAt,
    });
    return lastResolvedSessionResult;
  }
  if (sessionGuardInFlight) {
    authLog("debug", "session guard joined", { reason });
    return sessionGuardInFlight;
  }
  authLog("debug", "session guard start", { reason });
  const startedAt = Date.now();
  sessionGuardInFlight = getSessionGuardedInner(reason, opts)
    .then((result) => {
      lastResolvedSessionResult = result;
      lastResolvedAt = Date.now();
      return result;
    })
    .finally(() => {
      authLog("debug", "session guard end", {
        reason,
        elapsedMs: Date.now() - startedAt,
      });
      sessionGuardInFlight = null;
    });
  return sessionGuardInFlight;
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
          allowRefresh: false,
        });
        return session?.access_token ?? null;
      },
    });
    instrumentRpcDebug(supabaseRestSingleton as unknown as RpcClient, "rest-with-session");
  }
  return supabaseRestSingleton;
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  void supabase.auth.getSession().then(({ data }) => {
    console.log("CURRENT SESSION:", data.session);
  });
}
