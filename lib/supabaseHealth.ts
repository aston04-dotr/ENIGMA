/**
 * Общий слой: health Auth (infrastructure, только apikey), jitter-backoff, таймаут PostgREST.
 * Используется из Expo (`lib/`) и Next (re-export).
 */

const HEALTH_PATH = "auth/v1/health";
const HEALTH_TTL_MS = 30_000;
const HEALTH_FETCH_MS = 8_000;

export const POSTGREST_OP_TIMEOUT_MS = 10_000;

const PUSH_BACKOFF_BASE_MS = [1_000, 2_000, 5_000] as const;
/** Случайный джиттер (мс) в диапазоне 100..300, знак ± — против thundering herd. */
const JITTER_MIN_MS = 100;
const JITTER_MAX_MS = 300;

let lastOkAt: number | null = null;
let inFlight: Promise<boolean> | null = null;

export function invalidateSupabaseHealthCache(): void {
  lastOkAt = null;
}

function baseUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  return u.endsWith("/") ? u : `${u}/`;
}

function randomJitterMagnitude(): number {
  return JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
}

/**
 * Каждая попытка retry вызывает эту функцию заново — новая пара (знак, величина) для интервала.
 * Итог неотрицателен: Math.max(0, base ± j), j ∈ [100, 300] ms.
 */
export function backoffIntervalWithJitter(baseMs: number): number {
  if (!Number.isFinite(baseMs) || baseMs < 0) {
    return 0;
  }
  const j = randomJitterMagnitude();
  const sign = Math.random() < 0.5 ? -1 : 1;
  return Math.max(0, baseMs + sign * j);
}

export async function sleep(ms: number): Promise<void> {
  const t = Math.max(0, Number.isFinite(ms) ? ms : 0);
  await new Promise((r) => setTimeout(r, t));
}

function isDevRuntime(): boolean {
  const g = globalThis as { __DEV__?: boolean };
  if (typeof g.__DEV__ !== "undefined") {
    return Boolean(g.__DEV__);
  }
  return (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV === "development"
  );
}

export function devPushLog(message: string, detail?: unknown): void {
  if (!isDevRuntime()) return;
  if (detail !== undefined) {
    console.warn(`[push/supabase] ${message}`, detail);
  } else {
    console.warn(`[push/supabase] ${message}`);
  }
}

/** PostgREST-совместимый ответ (supabase-js). */
export type PostgrestCallResult<TErr = unknown> = {
  error: TErr;
  data?: unknown;
};

export type BackoffSkipReason = "infrastructure" | "no_auth";

export type WithPostgrestBackoffOutcome<T extends PostgrestCallResult> =
  | { status: "skipped"; reason: BackoffSkipReason }
  | { status: "completed"; result: T; attempts: number };

export function isBackoffSkipped<T extends PostgrestCallResult>(
  o: WithPostgrestBackoffOutcome<T>,
): o is { status: "skipped"; reason: BackoffSkipReason } {
  return o.status === "skipped";
}

type Awaitable<T> = T | PromiseLike<T>;

type BackoffOptions<T extends PostgrestCallResult> = {
  /**
   * Наличие user JWT (например access_token) до PostgREST; иначе 400/401, не гоняем health/backoff.
   * Если вернуло false → skipped reason no_auth.
   */
  checkSession?: () => boolean | Promise<boolean>;
  /** Инфраструктура; при false — skipped infrastructure. Никогда не должен кидать наружу. */
  checkHealth: () => boolean | Promise<boolean>;
  run: (signal: AbortSignal) => Awaitable<T>;
  logLabel?: string;
};

async function asBool(
  fn: () => boolean | Promise<boolean>,
): Promise<boolean> {
  try {
    return Boolean(await fn());
  } catch {
    return false;
  }
}

/**
 * session → (optional) no_auth → health → PostgREST с backoff.
 * checkHealth / checkSession оборачиваются: любые throw → false / skip без unhandled.
 */
export async function withPostgrestBackoff<T extends PostgrestCallResult>(
  options: BackoffOptions<T>,
): Promise<WithPostgrestBackoffOutcome<T>> {
  const { checkSession, checkHealth, run, logLabel } = options;
  const label = logLabel ? `[${logLabel}]` : "";

  if (checkSession) {
    const hasSession = await asBool(checkSession);
    if (!hasSession) {
      devPushLog(
        `${label} back off skipped: no access_token / session (no_auth)`,
      );
      return { status: "skipped", reason: "no_auth" };
    }
  }

  let healthy = false;
  try {
    healthy = await Promise.resolve(checkHealth());
  } catch {
    healthy = false;
  }
  if (!healthy) {
    devPushLog(
      `${label} back off skipped: Supabase infrastructure check failed (circuit open)`,
    );
    return { status: "skipped", reason: "infrastructure" };
  }

  const executeOnce = async (): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      POSTGREST_OP_TIMEOUT_MS,
    );
    try {
      return await Promise.resolve(run(controller.signal)) as T;
    } finally {
      clearTimeout(timer);
    }
  };

  let result = await executeOnce();
  if (!result.error) {
    return { status: "completed", result, attempts: 1 };
  }

  for (let i = 0; i < PUSH_BACKOFF_BASE_MS.length; i++) {
    const wait = backoffIntervalWithJitter(PUSH_BACKOFF_BASE_MS[i]!);
    await sleep(wait);
    result = await executeOnce();
    if (!result.error) {
      return { status: "completed", result, attempts: i + 2 };
    }
  }

  devPushLog(
    `${label} back off exhausted after 4 PostgREST attempts`,
    result.error,
  );
  return { status: "completed", result, attempts: 4 };
}

/**
 * Только `apikey` — инфраструктура. Не бросает: сеть/DNS/URL/abort → false.
 * GET {SUPABASE_URL}/auth/v1/health
 */
export async function isSupabaseReachable(
  supabaseUrl: string,
  anonKey: string,
): Promise<boolean> {
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    return false;
  }
  if (lastOkAt != null && Date.now() - lastOkAt < HEALTH_TTL_MS) {
    return true;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async (): Promise<boolean> => {
    try {
      const base = baseUrl(supabaseUrl);
      let target: URL;
      try {
        target = new URL(HEALTH_PATH, base);
      } catch {
        return false;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_FETCH_MS);
      try {
        const res = await fetch(target, {
          method: "GET",
          headers: {
            apikey: anonKey,
          },
          signal: controller.signal,
        });
        if (res.ok) {
          lastOkAt = Date.now();
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
