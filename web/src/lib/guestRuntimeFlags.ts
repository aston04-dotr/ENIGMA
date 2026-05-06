import { supabase } from "@/lib/supabase";

export type GuestRuntimeFlags = {
  guest_chat_enabled: boolean;
  guest_chat_global_enabled: boolean;
  guest_chat_rollout_percent: number;
  guest_chat_rollout_bucket: number;
  guest_chat_rollout_allowed: boolean;
  guest_merge_enabled: boolean;
  guest_presence_enabled: boolean;
  guest_kill_switch: boolean;
};

const DEFAULT_FLAGS: GuestRuntimeFlags = {
  guest_chat_enabled: false,
  guest_chat_global_enabled: false,
  guest_chat_rollout_percent: 0,
  guest_chat_rollout_bucket: 0,
  guest_chat_rollout_allowed: false,
  guest_merge_enabled: true,
  guest_presence_enabled: true,
  guest_kill_switch: false,
};

const CACHE_TTL_MS = 30_000;
let cachedFlags: GuestRuntimeFlags | null = null;
let cachedAtMs = 0;
let inFlight: Promise<GuestRuntimeFlags> | null = null;

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return true;
    if (["0", "false", "no", "off"].includes(v)) return false;
  }
  return fallback;
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function normalizeFlags(raw: unknown): GuestRuntimeFlags {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    guest_chat_enabled: toBool(src.guest_chat_enabled, DEFAULT_FLAGS.guest_chat_enabled),
    guest_chat_global_enabled: toBool(
      src.guest_chat_global_enabled,
      DEFAULT_FLAGS.guest_chat_global_enabled,
    ),
    guest_chat_rollout_percent: toInt(
      src.guest_chat_rollout_percent,
      DEFAULT_FLAGS.guest_chat_rollout_percent,
    ),
    guest_chat_rollout_bucket: toInt(
      src.guest_chat_rollout_bucket,
      DEFAULT_FLAGS.guest_chat_rollout_bucket,
    ),
    guest_chat_rollout_allowed: toBool(
      src.guest_chat_rollout_allowed,
      DEFAULT_FLAGS.guest_chat_rollout_allowed,
    ),
    guest_merge_enabled: toBool(
      src.guest_merge_enabled,
      DEFAULT_FLAGS.guest_merge_enabled,
    ),
    guest_presence_enabled: toBool(
      src.guest_presence_enabled,
      DEFAULT_FLAGS.guest_presence_enabled,
    ),
    guest_kill_switch: toBool(src.guest_kill_switch, DEFAULT_FLAGS.guest_kill_switch),
  };
}

export async function getGuestRuntimeFlags(opts?: {
  guestUuid?: string | null;
  userId?: string | null;
  force?: boolean;
}): Promise<GuestRuntimeFlags> {
  const now = Date.now();
  if (!opts?.force && cachedFlags && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedFlags;
  }
  if (inFlight) return inFlight;

  const job = (async () => {
    try {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "get_guest_runtime_flags",
        {
          p_guest_uuid: opts?.guestUuid ?? null,
          p_user_id: opts?.userId ?? null,
        },
      );
      if (error) throw new Error(error.message || "flags rpc failed");
      const flags = normalizeFlags(data);
      cachedFlags = flags;
      cachedAtMs = Date.now();
      return flags;
    } catch {
      if (cachedFlags) return cachedFlags;
      return DEFAULT_FLAGS;
    } finally {
      inFlight = null;
    }
  })();

  inFlight = job;
  return job;
}
