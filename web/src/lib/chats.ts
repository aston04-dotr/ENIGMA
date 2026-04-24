import { supabase } from "./supabase";
import { canStartNewChat } from "./trustLevels";

export type GetOrCreateChatResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

type RpcChatRow = {
  id?: string | null;
};

export async function getOrCreateChat(
  sellerId: string,
): Promise<GetOrCreateChatResult> {
  try {
    const normalizedSellerId = String(sellerId ?? "").trim();

    console.log("SELLER ID:", normalizedSellerId);

    if (!normalizedSellerId || !isValidUuid(normalizedSellerId)) {
      console.error("CHAT ERROR:", "Invalid sellerId");
      return { ok: false, error: "Некорректный продавец" };
    }

    const { data: userData, error: authError } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    console.log("USER:", userId);

    if (authError) {
      console.error("ERROR:", authError);
      return { ok: false, error: authError.message || "Ошибка авторизации" };
    }

    if (!userId) {
      console.error("ERROR:", "User is not authenticated");
      return { ok: false, error: "Не авторизован" };
    }

    if (userId === normalizedSellerId) {
      console.error("ERROR:", "Cannot open chat with self");
      return { ok: false, error: "Нельзя написать самому себе" };
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("trust_score")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("ERROR:", profileError);
    }

    if (!canStartNewChat(profileData?.trust_score)) {
      return {
        ok: false,
        error:
          "Недостаточно доверия, чтобы начать новый чат. Вы можете отвечать в уже открытых переписках.",
      };
    }

    const { data: authSnap } = await supabase.auth.getSession();
    if (!authSnap?.session?.user) {
      console.warn("no user, skip rpc get_or_create_direct_chat");
      return { ok: false, error: "Не авторизован" };
    }

    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_buyer: userId,
      p_seller: normalizedSellerId,
    });

    console.log("CHAT RESULT:", data);
    console.log("ERROR:", error);

    if (error || !data) {
      console.error("CHAT ERROR:", error);
      return {
        ok: false,
        error: error?.message || "Не удалось открыть чат",
      };
    }

    const raw = data as string | RpcChatRow | RpcChatRow[] | null;

    if (typeof raw === "string" && raw.trim()) {
      return { ok: true, id: raw.trim() };
    }

    if (Array.isArray(raw)) {
      const row = raw[0];
      const chatId = String(row?.id ?? "").trim();
      if (chatId) {
        return { ok: true, id: chatId };
      }
    }

    if (raw && typeof raw === "object") {
      const chatId = String((raw as RpcChatRow).id ?? "").trim();
      if (chatId) {
        return { ok: true, id: chatId };
      }
    }

    return { ok: false, error: "RPC не вернул id чата" };
  } catch (error) {
    console.error("CHAT ERROR:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "Ошибка сети" };
  }
}
