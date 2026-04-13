import type { User } from "@supabase/supabase-js";
import { isSchemaNotInCache } from "./postgrestErrors";
import { supabase } from "./supabase";

/** First login: `profiles` + minimal `public.users` row (FK for listings/chats). */
export async function ensureProfileAndUserRow(user: User): Promise<void> {
  const email = user.email?.trim() || null;

  const { error: pErr } = await supabase.from("profiles").upsert({ id: user.id, email }, { onConflict: "id" });
  if (pErr && !isSchemaNotInCache(pErr)) {
    if (process.env.NODE_ENV === "development") console.warn("profiles upsert", pErr.message);
  }

  const { error: uErr } = await supabase.from("users").upsert({ id: user.id, email }, { onConflict: "id" });
  if (uErr && !isSchemaNotInCache(uErr)) {
    if (process.env.NODE_ENV === "development") console.warn("users upsert", uErr.message);
  }
}
