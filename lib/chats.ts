import { logSupabaseResult } from "./postgrestErrors";
import { supabase } from "./supabase";
import { canStartNewChat } from "./trustLevels";

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type GetOrCreateChatResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * DM: find or create a 1:1 chat. Uses JWT user id (not caller-supplied session id).
 * Trigger `chats_after_insert_fill_members` adds chat_members rows.
 */
export async function getOrCreateChat(otherUserId: string): Promise<GetOrCreateChatResult> {
  try {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      console.error("getOrCreateChat getUser", authErr);
      return { ok: false, error: "Нет сессии" };
    }
    const myId = auth.user.id;
    if (otherUserId === myId) {
      return { ok: false, error: "Нельзя открыть чат с собой" };
    }

    const { data: prof } = await supabase.from("profiles").select("trust_score").eq("id", myId).maybeSingle();
    if (!canStartNewChat(prof?.trust_score)) {
      return {
        ok: false,
        error:
          "Недостаточно доверия, чтобы начать новый чат. Вы можете отвечать в уже открытых переписках.",
      };
    }

    const [u1, u2] = orderedPair(myId, otherUserId);
    const sel = await supabase.from("chats").select("id").eq("user1", u1).eq("user2", u2).maybeSingle();
    logSupabaseResult("chats_select_pair", { data: sel.data, error: sel.error });
    if (sel.error) {
      console.error("chats select", sel.error);
      return { ok: false, error: sel.error.message || "Ошибка чата" };
    }
    if (sel.data?.id) return { ok: true, id: sel.data.id };

    const ins = await supabase.from("chats").insert({ user1: u1, user2: u2 }).select("id").single();
    logSupabaseResult("chats_insert", { data: ins.data, error: ins.error });
    if (ins.error) {
      const again = await supabase.from("chats").select("id").eq("user1", u1).eq("user2", u2).maybeSingle();
      logSupabaseResult("chats_select_pair_retry", { data: again.data, error: again.error });
      if (again.data?.id) return { ok: true, id: again.data.id };
      return { ok: false, error: ins.error.message || "Не удалось создать чат" };
    }
    if (!ins.data?.id) {
      return { ok: false, error: "Нет id чата" };
    }
    return { ok: true, id: ins.data.id };
  } catch (e) {
    console.error("getOrCreateChat", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Ошибка сети" };
  }
}
