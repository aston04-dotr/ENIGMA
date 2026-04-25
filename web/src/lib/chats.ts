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

    if (!normalizedSellerId || !isValidUuid(normalizedSellerId)) {
      return { ok: false, error: "Некорректный продавец" };
    }

    const { data: userData, error: authError } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    if (authError) {
      return { ok: false, error: authError.message || "Ошибка авторизации" };
    }

    if (!userId) {
      return { ok: false, error: "Не авторизован" };
    }

    if (userId === normalizedSellerId) {
      return { ok: false, error: "Нельзя написать самому себе" };
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("trust_score")
      .eq("id", userId)
      .maybeSingle();

    if (profileError && process.env.NODE_ENV === "development") {
      console.warn("profiles trust_score", profileError);
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
      return { ok: false, error: "Не авторизован" };
    }

    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_other_user_id: normalizedSellerId,
      p_listing_id: null,
    });

    if (error || !data) {
      if (error && process.env.NODE_ENV === "development") {
        console.error("get_or_create_direct_chat", error);
      }
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
    if (process.env.NODE_ENV === "development") {
      console.error("getOrCreateChat", error);
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message || "Ошибка сети" };
  }
}
