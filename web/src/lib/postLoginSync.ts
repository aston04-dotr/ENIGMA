import type { User } from "@supabase/supabase-js";
import { checkAccessBlocked } from "./bans";
import { markAccessDeniedForLogin } from "./deleteAccount";
import { isSchemaNotInCache } from "./postgrestErrors";
import { ensureProfileAndUserRow } from "./profileSync";
import { supabase } from "./supabase";
import { tryDailyTrustRecovery } from "./trust";
import type { UserRow } from "./types";

type ProfileSnapshot = {
  profile: UserRow | null;
  needsPhone: boolean;
};

export type PostLoginSyncResult = ProfileSnapshot & {
  blocked: boolean;
};

let syncInFlight: Promise<PostLoginSyncResult> | null = null;
let syncUserIdInFlight: string | null = null;

async function readProfileSnapshot(user: User): Promise<ProfileSnapshot> {
  const userId = user.id;
  await tryDailyTrustRecovery();

  const { data: u, error: uErr } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (uErr && isSchemaNotInCache(uErr)) return { profile: null, needsPhone: false };
  if (uErr) {
    if (process.env.NODE_ENV === "development") console.warn("loadProfile users", uErr.message);
    return { profile: null, needsPhone: false };
  }

  let { data: p, error: pErr } = await supabase
    .from("profiles")
    .select("phone,email,phone_updated_at,device_id,trust_score")
    .eq("id", userId)
    .maybeSingle();

  if (pErr && !isSchemaNotInCache(pErr) && process.env.NODE_ENV === "development") {
    console.warn("loadProfile profiles", pErr.message);
  }

  if (!p && !pErr) {
    await ensureProfileAndUserRow(user);
    const retry = await supabase
      .from("profiles")
      .select("phone,email,phone_updated_at,device_id,trust_score")
      .eq("id", userId)
      .maybeSingle();
    p = retry.data;
    pErr = retry.error;
  }

  if (!u) return { profile: null, needsPhone: false };

  const row = u as UserRow;
  return {
    profile: {
      ...row,
      phone: p?.phone ?? row.phone,
      email: p?.email ?? row.email,
      phone_updated_at: p?.phone_updated_at ?? null,
      device_id: p?.device_id ?? null,
      trust_score: p?.trust_score ?? row.trust_score ?? null,
    },
    needsPhone: !p?.phone?.trim(),
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
    const blocked = await checkAccessBlocked(user.email, snapshot.profile?.phone ?? null, snapshot.profile?.device_id ?? null);

    if (blocked) {
      markAccessDeniedForLogin();
      await supabase.auth.signOut();
      return { ...snapshot, blocked: true };
    }

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
