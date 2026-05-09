import type { User } from "@supabase/supabase-js";
import { isSchemaNotInCache } from "./postgrestErrors";
import { ensureProfileAndUserRow } from "./profileSync";
import { supabase } from "./supabase";
import { tryDailyTrustRecovery } from "./trust";
import type { UserRow } from "./types";

type ProfileSnapshot = {
  profile: UserRow | null;
};

export type PostLoginSyncResult = ProfileSnapshot & {
  blocked: boolean;
};

let syncInFlight: Promise<PostLoginSyncResult> | null = null;
let syncUserIdInFlight: string | null = null;

async function readProfileSnapshot(user: User): Promise<ProfileSnapshot> {
  const userId = user.id;
  await tryDailyTrustRecovery();

  let { data: p, error: pErr } = await supabase
    .from("profiles")
    .select(
      "phone, trust_score, updated_at, name, created_at, device_id, phone_updated_at, listing_extra_slot_capacity",
    )
    .eq("id", userId)
    .maybeSingle();

  if (pErr && !isSchemaNotInCache(pErr) && process.env.NODE_ENV === "development") {
    console.warn("loadProfile profiles", pErr.message);
  }

  if (!p && !pErr) {
    await ensureProfileAndUserRow(user);
    const retry = await supabase
      .from("profiles")
      .select(
        "phone, trust_score, updated_at, name, created_at, device_id, phone_updated_at, listing_extra_slot_capacity",
      )
      .eq("id", userId)
      .maybeSingle();
    p = retry.data;
    pErr = retry.error;
  }

  const row: UserRow = {
    id: userId,
    phone: p?.phone ?? null,
    phone_updated_at: p?.phone_updated_at ?? null,
    device_id: p?.device_id ?? null,
    name: p?.name ?? ((user.user_metadata as { name?: string } | null)?.name ?? null),
    email: user.email ?? null,
    avatar: null,
    public_id: userId,
    created_at: p?.created_at ?? new Date().toISOString(),
    trust_score: p?.trust_score ?? null,
  };

  return {
    profile: {
      ...row,
      name: p?.name ?? row.name,
      phone: p?.phone ?? row.phone,
      trust_score: p?.trust_score ?? row.trust_score,
      listing_extra_slot_capacity: p?.listing_extra_slot_capacity ?? 0,
    },
  };
}

export async function loadProfileSnapshot(user: User): Promise<ProfileSnapshot> {
  return readProfileSnapshot(user);
}

export async function runPostLoginSync(user: User): Promise<PostLoginSyncResult> {
  if (syncInFlight && syncUserIdInFlight === user.id) {
    return syncInFlight;
  }

  const job = (async (): Promise<PostLoginSyncResult> => {
    await ensureProfileAndUserRow(user);
    const snapshot = await readProfileSnapshot(user);
    return { ...snapshot, blocked: false };
  })().finally(() => {
    if (syncInFlight === job) {
      syncInFlight = null;
      syncUserIdInFlight = null;
    }
  });

  syncInFlight = job;
  syncUserIdInFlight = user.id;
  return job;
}
