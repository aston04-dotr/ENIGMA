import { logSupabaseResult } from "./postgrestErrors";
import { supabase } from "./supabase";
import { canStartNewChat } from "./trustLevels";

export type GetOrCreateChatResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Chat open/create with current production schema.
 * Tries to find an existing chat by last messages between two users; otherwise creates a new chat row.
 */
export async function getOrCreateChat(otherUserId: string): Promise<GetOrCreateChatResult> {
  try {
    const {
      data: { session },
      error: authErr,
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (authErr || !user) {
      console.error("getOrCreateChat getUser", authErr);
      return { ok: false, error: "Нет сессии" };
    }
    const myId = user.id;
    if (otherUserId === myId) {
      return { ok: false, error: "Нельзя открыть чат с собой" };
    }

    const { data: prof } = await supabase.from("profiles").select("phone, trust_score, updated_at").eq("id", myId).maybeSingle();
    if (!canStartNewChat(prof?.trust_score)) {
      return {
        ok: false,
        error:
          "Недостаточно доверия, чтобы начать новый чат. Вы можете отвечать в уже открытых переписках.",
      };
    }

    const recentMessages = await supabase
      .from("messages")
      .select("chat_id,sender_id,created_at")
      .in("sender_id", [myId, otherUserId])
      .order("created_at", { ascending: false })
      .limit(500);

    logSupabaseResult("messages_select_pair", { data: recentMessages.data, error: recentMessages.error });

    if (recentMessages.error) {
      console.error("messages select", recentMessages.error);
      return { ok: false, error: recentMessages.error.message || "Ошибка чата" };
    }

    const byChat = new Map<string, Set<string>>();
    for (const row of recentMessages.data ?? []) {
      const chatId = String(row.chat_id ?? "").trim();
      const senderId = String(row.sender_id ?? "").trim();
      if (!chatId || !senderId) continue;
      const set = byChat.get(chatId) ?? new Set<string>();
      set.add(senderId);
      byChat.set(chatId, set);
    }

    for (const [chatId, senders] of byChat) {
      if (senders.has(myId) && senders.has(otherUserId)) {
        return { ok: true, id: chatId };
      }
    }

    const ins = await supabase.from("chats").insert({ listing_id: null }).select("id").single();
    logSupabaseResult("chats_insert", { data: ins.data, error: ins.error });
    if (ins.error) {
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
