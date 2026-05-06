import type { User } from "@supabase/supabase-js";
import { isSchemaNotInCache } from "./postgrestErrors";
import { supabase } from "./supabase";
import { getOrCreateGuestIdentity } from "./guestIdentity";

/** First login: `profiles` + minimal `public.users` row (FK for listings/chats). */
export async function ensureProfileAndUserRow(user: User): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return;
  console.log("UPSERT USER ID:", authUser.id);
  const email = authUser.email?.trim() || null;
  const guestIdentity = getOrCreateGuestIdentity();

  const { error: pErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email,
        device_id: guestIdentity.fingerprint,
      },
      { onConflict: "id" },
    );
  if (pErr && !isSchemaNotInCache(pErr)) {
    if (process.env.NODE_ENV === "development") console.warn("profiles upsert", pErr.message);
  }

  const { error: uErr } = await (supabase.from as unknown as (
    relation: string
  ) => {
    upsert: (
      values: Record<string, unknown>,
      options?: { onConflict?: string }
    ) => Promise<{ error: { message?: string } | null }> ;
  })("users").upsert({ id: authUser.id, email }, { onConflict: "id" });
  const typedUErr = uErr as { message?: string; code?: string } | null;
  if (typedUErr && !isSchemaNotInCache(typedUErr as never)) {
    if (process.env.NODE_ENV === "development") console.warn("users upsert", typedUErr.message);
  }
}
