import { supabase } from "./supabase";

export type GetOrCreateChatResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function getOrCreateChat(
  sellerId: string,
): Promise<GetOrCreateChatResult> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return { ok: false, error: "NO_SESSION" };
    }

    const p_other_user_id =
      typeof sellerId === "string" ? sellerId.trim() : "";

    if (!p_other_user_id || typeof p_other_user_id !== "string") {
      return { ok: false, error: "Invalid user id" };
    }

    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_listing_id: null,
      p_other_user_id,
    });

    if (error || !data) {
      console.log(data, error);
      return { ok: false, error: error?.message || "No chat id" };
    }

    const chatId = String(data).trim();

    if (!chatId) {
      return { ok: false, error: "Empty chat id" };
    }

    return { ok: true, id: chatId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "No chat id" };
  }
}
