import { supabase } from "./supabase";

export type GetOrCreateChatResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getOrCreateChat(
  sellerId: string,
): Promise<GetOrCreateChatResult> {
  try {
    const normalizedSellerId = String(sellerId ?? "").trim();

    if (!normalizedSellerId || !isValidUuid(normalizedSellerId)) {
      return { ok: false, error: "Некорректный продавец" };
    }

    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_other_user_id: normalizedSellerId,
      p_listing_id: null,
    });

    if (error) {
      if (error && process.env.NODE_ENV === "development") {
        console.error("get_or_create_direct_chat", error);
      }
      return {
        ok: false,
        error: error?.message || "Не удалось открыть чат",
      };
    }

    const chatId = typeof data === "string" ? data.trim() : "";
    if (!chatId) return { ok: false, error: "RPC не вернул id чата" };
    return { ok: true, id: chatId };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("getOrCreateChat", error);
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "Ошибка сети" };
  }
}
