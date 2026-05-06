import { supabase } from "@/lib/supabase";
import { getOrCreateGuestIdentity } from "@/lib/guestIdentity";
import { getGuestRuntimeFlags } from "@/lib/guestRuntimeFlags";

const MERGE_DONE_PREFIX = "enigma:guest:merged:user:";

export async function mergeGuestStateAfterSignIn(userId: string): Promise<void> {
  if (!userId || typeof window === "undefined") return;
  const mergedFlagKey = `${MERGE_DONE_PREFIX}${userId}`;
  try {
    if (window.localStorage.getItem(mergedFlagKey) === "1") return;
  } catch {
    // ignore
  }

  const identity = getOrCreateGuestIdentity();
  const flags = await getGuestRuntimeFlags({
    guestUuid: identity.guest_uuid,
    userId,
  });
  if (!flags.guest_merge_enabled) {
    return;
  }
  const invokeRpc = (name: string) =>
    (supabase.rpc as unknown as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ error: { message?: string; code?: string } | null }>)(
      name,
      {
        p_guest_uuid: identity.guest_uuid,
        p_guest_fingerprint: identity.fingerprint,
      },
    );

  let merged = false;
  try {
    const res = await invokeRpc("merge_guest_state_controlled");
    merged = !res.error;
  } catch {
    merged = false;
  }

  if (!merged) {
    try {
      const fallback = await invokeRpc("merge_guest_state");
      merged = !fallback.error;
    } catch {
      merged = false;
    }
  }

  if (!merged) return;

  try {
    window.localStorage.setItem(mergedFlagKey, "1");
    window.localStorage.setItem("enigma:guest:last-linked-user", userId);
  } catch {
    // ignore
  }
}
