import { logSupabaseResult } from "./postgrestErrors";
import { supabase } from "./supabase";
import { canStartNewChat } from "./trustLevels";

export type GetOrCreateChatResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type RpcResultRow = {
  chat_id?: string | null;
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getOrCreateChat(
  otherUserId: string,
  listingId?: string | null,
): Promise<GetOrCreateChatResult> {
  try {
    const normalizedOtherUserId = String(otherUserId ?? "").trim();
    const normalizedListingId = String(listingId ?? "").trim() || null;

    if (!normalizedOtherUserId || !isValidUuid(normalizedOtherUserId)) {
      return { ok: false, error: "Некорректный получатель" };
    }

    if (normalizedListingId && !isValidUuid(normalizedListingId)) {
      return { ok: false, error: "Некорректное объявление" };
    }

    const {
      data: { session },
      error: authErr,
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (authErr || !user) {
      console.error("getOrCreateChat getSession", authErr);
      return { ok: false, error: "Нет сессии" };
    }

    const myId = user.id;
    if (normalizedOtherUserId === myId) {
      return { ok: false, error: "Нельзя открыть чат с собой" };
    }

    const { data: prof, error: profileErr } = await supabase
      .from("profiles")
      .select("trust_score")
      .eq("id", myId)
      .maybeSingle();

    if (profileErr) {
      console.warn("getOrCreateChat profiles select", profileErr);
    }

    if (!canStartNewChat(prof?.trust_score)) {
      return {
        ok: false,
        error:
          "Недостаточно доверия, чтобы начать новый чат. Вы можете отвечать в уже открытых переписках.",
      };
    }

    const rpc = await supabase.rpc("get_or_create_direct_chat", {
      p_other_user_id: normalizedOtherUserId,
      p_listing_id: normalizedListingId,
    });

    logSupabaseResult("get_or_create_direct_chat", {
      data: rpc.data,
      error: rpc.error,
    });

    if (rpc.error) {
      console.error("get_or_create_direct_chat", rpc.error);
      return {
        ok: false,
        error: rpc.error.message || "Не удалось открыть чат",
      };
    }

    const raw = rpc.data as string | RpcResultRow | RpcResultRow[] | null;

    if (typeof raw === "string" && raw.trim()) {
      return { ok: true, id: raw.trim() };
    }

    if (Array.isArray(raw)) {
      const row = raw[0];
      const chatId = String(row?.chat_id ?? "").trim();
      if (chatId) {
        return { ok: true, id: chatId };
      }
    }

    if (raw && typeof raw === "object") {
      const chatId = String((raw as RpcResultRow).chat_id ?? "").trim();
      if (chatId) {
        return { ok: true, id: chatId };
      }
    }

    return { ok: false, error: "RPC не вернул id чата" };
  } catch (e) {
    console.error("getOrCreateChat", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Ошибка сети" };
  }
}
