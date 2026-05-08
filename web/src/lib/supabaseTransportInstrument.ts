"use client";

/**
 * Transport-layer diagnostics for Supabase REST (PostgREST) + accessToken provider.
 * Does NOT import supabase.ts (avoids circular deps).
 */

import { isAuthCircuitOpen } from "@/lib/authCircuitState";

const REST_AUTH_ERROR_WINDOW_MS = 5_000;
const REST_AUTH_ERROR_STORM_THRESHOLD = 3;

type LastRestMeta = {
  kind: "rpc" | "table" | "auth" | "other";
  name: string;
  url: string;
  ts: number;
};

let lastRestMeta: LastRestMeta = { kind: "other", name: "", url: "", ts: 0 };
const restAuthHttpErrorTimestamps: number[] = [];

let realtimeChannelProbe: () => boolean = () => false;

let transportTokenProbe: () => { hasRestToken: boolean; hasSessionToken: boolean } = () => ({
  hasRestToken: false,
  hasSessionToken: false,
});

export function setTransportTokenProbe(
  probe: () => { hasRestToken: boolean; hasSessionToken: boolean },
): void {
  transportTokenProbe = probe;
}

export function setTransportRealtimeChannelProbe(probe: () => boolean): void {
  realtimeChannelProbe = probe;
}

function stackFp(maxLines: number): string {
  return new Error("transport-stack").stack?.split("\n").slice(0, maxLines).join(" | ") ?? "";
}

function parseRestPath(urlStr: string): Pick<LastRestMeta, "kind" | "name"> {
  try {
    const u = new URL(urlStr, "http://_");
    const p = u.pathname;
    const rpc = p.match(/\/rest\/v1\/rpc\/([^/?]+)/);
    if (rpc?.[1]) return { kind: "rpc", name: rpc[1] };
    const m = p.match(/^\/rest\/v1\/([^/?]+)/);
    if (m?.[1] && m[1] !== "rpc") return { kind: "table", name: m[1] };
    if (p.includes("/auth/v1/")) return { kind: "auth", name: p.split("/").filter(Boolean).slice(-2).join("/") };
  } catch {
    /* noop */
  }
  return { kind: "other", name: "" };
}

export function getLastRestTransportMeta(): LastRestMeta {
  return { ...lastRestMeta };
}

export function logRestOutgoing(input: RequestInfo | URL, init?: RequestInit): void {
  const urlStr =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : "url" in input
          ? String(input.url)
          : "";
  const { kind, name } = parseRestPath(urlStr);
  lastRestMeta = { kind, name, url: urlStr, ts: Date.now() };
  const method =
    init?.method ??
    ((typeof Request !== "undefined" && input instanceof Request ? input.method : undefined) ?? "GET");
  console.warn(
    "[REST_OUTGOING]",
    JSON.stringify({
      method,
      kind,
      name: name || null,
      url: urlStr,
      ts: lastRestMeta.ts,
      stack: stackFp(6),
    }),
  );
}

/** Pure sync token read path — NEVER calls supabase.auth, refresh, realtime, logging side effects besides our warn below. */
export function createCachedRestAccessTokenProvider(getSyncJwt: () => string | null) {
  return (): Promise<string | null> => {
    const jwt = typeof window !== "undefined" && isAuthCircuitOpen() ? null : getSyncJwt();
    const hasToken = Boolean(jwt?.trim());
    const tokenTail =
      jwt && jwt.trim()
        ? `…${jwt.trim().slice(-16)}`
        : "(none)";
    console.warn(
      "[ACCESS_TOKEN_PROVIDER_CALL]",
      JSON.stringify({
        hasToken,
        tokenTail,
        circuit: typeof window !== "undefined" ? isAuthCircuitOpen() : false,
        ts: Date.now(),
        stack: new Error().stack?.split("\n").slice(0, 6).join(" | ") ?? "",
      }),
    );
    return Promise.resolve(jwt);
  };
}

function trimRestAuthTimestamps(now: number) {
  while (
    restAuthHttpErrorTimestamps.length > 0 &&
    now - restAuthHttpErrorTimestamps[0]! > REST_AUTH_ERROR_WINDOW_MS
  ) {
    restAuthHttpErrorTimestamps.shift();
  }
}

/**
 * Signals auth/REST transport stress (e.g. PostgREST 401) — NOT from accessToken try/catch.
 */
export function recordRestAuthHttpFailure(status: number, urlStr: string): void {
  const now = Date.now();
  trimRestAuthTimestamps(now);
  restAuthHttpErrorTimestamps.push(now);
  const last = getLastRestTransportMeta();
  console.error(
    "[REST_AUTH_ACCESS_TOKEN]",
    "Error",
    JSON.stringify({
      status,
      url: urlStr,
      ts: now,
      outgoingMeta: last,
      stackFingerprint: stackFp(6),
      stack: new Error().stack?.split("\n").slice(0, 8).join(" | ") ?? "",
    }),
  );
  if (restAuthHttpErrorTimestamps.length > REST_AUTH_ERROR_STORM_THRESHOLD) {
    const last = getLastRestTransportMeta();
    const tok = transportTokenProbe();
    console.error(
      "[ENIGMA_AUTH_TRANSPORT_STORM]",
      JSON.stringify({
        count: restAuthHttpErrorTimestamps.length,
        lastRpc: last.kind === "rpc" ? last.name : null,
        lastTable: last.kind === "table" ? last.name : null,
        lastUrl: last.url,
        hasRealtimeChannel: realtimeChannelProbe(),
        hasRestToken: tok.hasRestToken,
        hasSessionToken: tok.hasSessionToken,
        windowMs: REST_AUTH_ERROR_WINDOW_MS,
      }),
    );
  }
}

export function createInstrumentedSupabaseFetch(
  baseFetch: typeof fetch,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    logRestOutgoing(input, init);
    const res = await baseFetch(input, init);
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : "url" in input
            ? String(input.url)
            : "";
    /** 401 JWT problems feed storm counter; RLS 403 tracked separately without auth-listener amplification. */
    if (res.status === 401 && urlStr.includes("/rest/v1/")) {
      recordRestAuthHttpFailure(res.status, urlStr);
    } else if (res.status === 403 && urlStr.includes("/rest/v1/")) {
      console.warn(
        "[REST_RLS_OR_FORBIDDEN]",
        JSON.stringify({ status: res.status, url: urlStr, ts: Date.now() }),
      );
    }
    return res;
  };
}
