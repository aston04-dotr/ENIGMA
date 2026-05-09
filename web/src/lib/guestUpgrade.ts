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
  const mergeArgs = {
    p_guest_uuid: identity.guest_uuid,
    p_guest_fingerprint: identity.fingerprint,
  };

  let merged = false;
  try {
    const res = await supabase.rpc(
      "merge_guest_state_controlled" as never,
      mergeArgs as never,
    );
    merged = !res.error;
  } catch {
    merged = false;
  }

  if (!merged) {
    try {
      const fallback = await supabase.rpc(
        "merge_guest_state" as never,
        mergeArgs as never,
      );
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
