import { supabase } from "./supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChatUuid(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  return UUID_RE.test(id.trim());
}

/**
 * Ensures the current user has a `chat_members` row for a 1:1 chat (RPC is SECURITY DEFINER).
 * Client cannot INSERT into `chat_members` under RLS (`with check (false)`).
 */
export async function ensureDmChatMembership(chatId: string): Promise<{ ok: boolean; error: string | null }> {
  if (!isChatUuid(chatId)) {
    return { ok: false, error: "invalid chat id" };
  }
  const { error } = await supabase.rpc("ensure_dm_chat_membership", { p_chat_id: chatId });
  if (error) {
    console.warn("ensure_dm_chat_membership RPC", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
