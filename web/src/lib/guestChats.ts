import { createGuestMessageNonce, getOrCreateGuestIdentity } from "@/lib/guestIdentity";
import { supabase } from "@/lib/supabase";

export type GuestChatRow = {
  chat_id: string;
  peer_user_id: string;
  listing_id: string | null;
  other_name: string;
  last_message_text: string | null;
  last_message_sender_role: "guest" | "peer" | null;
  last_message_at: string | null;
  last_message_created_at: string | null;
  unread_count: number;
};

export type GuestChatMessage = {
  id: string;
  chat_id: string;
  sender_role: "guest" | "peer";
  text: string;
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  pending?: boolean;
};

function normalizeRows(raw: unknown): GuestChatRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      chat_id: String(row.chat_id ?? ""),
      peer_user_id: String(row.peer_user_id ?? ""),
      listing_id: row.listing_id ? String(row.listing_id) : null,
      other_name: String(row.other_name ?? "Пользователь Enigma"),
      last_message_text: row.last_message_text == null ? null : String(row.last_message_text),
      last_message_sender_role:
        row.last_message_sender_role === "peer" ? "peer" : row.last_message_sender_role === "guest" ? "guest" : null,
      last_message_at: row.last_message_at == null ? null : String(row.last_message_at),
      last_message_created_at:
        row.last_message_created_at == null ? null : String(row.last_message_created_at),
      unread_count: Math.max(0, Number(row.unread_count ?? 0)),
    };
  });
}

function normalizeMessages(raw: unknown): GuestChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      chat_id: String(row.chat_id ?? ""),
      sender_role: row.sender_role === "peer" ? "peer" : "guest",
      text: String(row.text ?? ""),
      created_at: String(row.created_at ?? new Date().toISOString()),
      delivered_at: row.delivered_at ? String(row.delivered_at) : null,
      read_at: row.read_at ? String(row.read_at) : null,
      pending: Boolean(row.pending),
    };
  });
}

export async function getOrCreateGuestChat(
  peerUserId: string,
  listingId?: string | null,
): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  const identity = getOrCreateGuestIdentity();
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "get_or_create_guest_chat_controlled",
    {
      p_guest_uuid: identity.guest_uuid,
      p_peer_user_id: peerUserId,
      p_listing_id: listingId ?? null,
      p_fingerprint: identity.fingerprint,
    },
  );
  if (error) {
    const raw = String(error.message ?? "").toLowerCase();
    if (raw.includes("disabled")) {
      return { ok: false, error: "Диалог временно недоступен. Попробуйте ещё раз через минуту." };
    }
    if (raw.includes("peer user required")) {
      return { ok: false, error: "Не удалось определить продавца для диалога." };
    }
    return { ok: false, error: "Не удалось открыть диалог. Попробуйте снова." };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const chatId = String(payload.chat_id ?? "").trim();
  if (!chatId) return { ok: false, error: "Не удалось открыть диалог. Попробуйте снова." };
  return { ok: true, chatId };
}

export async function listGuestChats(limit = 50): Promise<GuestChatRow[]> {
  const identity = getOrCreateGuestIdentity();
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "list_guest_chats_controlled",
    {
      p_guest_uuid: identity.guest_uuid,
      p_fingerprint: identity.fingerprint,
      p_limit: limit,
    },
  );
  if (error) return [];
  const payload = (data ?? {}) as Record<string, unknown>;
  return normalizeRows(payload.rows);
}

export async function listGuestMessages(chatId: string, limit = 200): Promise<GuestChatMessage[]> {
  const identity = getOrCreateGuestIdentity();
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "list_guest_messages_controlled",
    {
      p_guest_uuid: identity.guest_uuid,
      p_chat_id: chatId,
      p_fingerprint: identity.fingerprint,
      p_limit: limit,
    },
  );
  if (error) return [];
  const payload = (data ?? {}) as Record<string, unknown>;
  return normalizeMessages(payload.rows);
}

export async function sendGuestMessage(opts: {
  chatId: string;
  peerUserId: string;
  text: string;
  listingId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const identity = getOrCreateGuestIdentity();
  const nonce = createGuestMessageNonce(opts.chatId);
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)(
    "enqueue_guest_message_controlled",
    {
      p_guest_uuid: identity.guest_uuid,
      p_peer_user_id: opts.peerUserId,
      p_text: opts.text,
      p_listing_id: opts.listingId ?? null,
      p_fingerprint: identity.fingerprint,
      p_client_nonce: nonce,
    },
  );
  if (error) {
    const raw = String(error.message ?? "").toLowerCase();
    if (raw.includes("rate") || raw.includes("guest_rate_limited")) {
      return { ok: false, error: "Подождите пару секунд и попробуйте снова." };
    }
    if (raw.includes("disabled")) {
      return { ok: false, error: "Чат временно доступен только после сохранения Enigma." };
    }
    return { ok: false, error: "Сообщение отправляется слишком быстро. Попробуйте снова." };
  }
  return { ok: true };
}

export async function markGuestChatRead(chatId: string, upToMessageId?: string | null): Promise<void> {
  const identity = getOrCreateGuestIdentity();
  await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)(
    "mark_guest_chat_read_controlled",
    {
      p_guest_uuid: identity.guest_uuid,
      p_guest_chat_id: chatId,
      p_fingerprint: identity.fingerprint,
      p_up_to_message_id: upToMessageId ?? null,
    },
  );
}
