import type { User } from "@supabase/supabase-js";
import { isSchemaNotInCache } from "./postgrestErrors";
import { supabase } from "./supabase";

/** First login: `profiles` + minimal `public.users` row (FK for listings/chats). */
export async function ensureProfileAndUserRow(user: User): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return;
  console.log("UPSERT USER ID:", authUser.id);
  const email = authUser.email?.trim() || null;

  const { error: pErr } = await supabase.from("profiles").upsert({ id: authUser.id, email }, { onConflict: "id" });
  if (pErr && !isSchemaNotInCache(pErr)) {
    if (__DEV__) console.warn("profiles upsert", pErr.message);
  }

  const { error: uErr } = await supabase.from("users").upsert({ id: user.id, email }, { onConflict: "id" });
  if (uErr && !isSchemaNotInCache(uErr)) {
    if (__DEV__) console.warn("users upsert", uErr.message);
  }
}
