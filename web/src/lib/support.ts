import { supabase } from "@/lib/supabase";

export type SupportTicketStatus = "open" | "closed";
export type SupportTicketType = "payment" | "listing" | "login" | "error" | "other";

export type ManualPaymentStatus = "pending" | "approved" | "rejected";

export type ManualPaymentType = "boost" | "top" | "vip" | "package";

export type SupportTicketPayload = {
  user_id: string;
  message: string;
  type: SupportTicketType;
  status?: SupportTicketStatus;
};

export type CreatePendingPaymentPayload = {
  user_id: string;
  type: ManualPaymentType;
  target_id: string | null;
  status?: ManualPaymentStatus;
};

function parseSupabaseError(error: unknown): string {
  if (!error) return "unknown_error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "unknown_error";
  if (typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
    try {
      const asJson = JSON.stringify(error);
      return asJson && asJson !== "{}" ? asJson : "unknown_error";
    } catch {
      return "unknown_error";
    }
  }
  return "unknown_error";
}

export async function createPendingPayment(payload: CreatePendingPaymentPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
  const userId = String(payload.user_id ?? "").trim();
  const paymentType = String(payload.type ?? "").trim() as ManualPaymentType;

  if (!userId) return { ok: false, error: "missing_user_id" };
  if (!paymentType) return { ok: false, error: "missing_type" };

  try {
    const { data, error } = await supabase
      .schema("public")
      .from("payments")
      .insert({
        user_id: userId,
        amount: 0,
        status: payload.status ?? "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("PAYMENT PENDING CREATE ERROR", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, id: String(data?.id ?? "") };
  } catch (error) {
    console.error("PAYMENT PENDING CREATE EXCEPTION", error);
    return { ok: false, error: error instanceof Error ? error.message : "payment_create_failed" };
  }
}

export async function createSupportTicket(payload: SupportTicketPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
  const userId = String(payload.user_id ?? "").trim();
  const message = String(payload.message ?? "").trim();

  if (!userId) return { ok: false, error: "missing_user_id" };
  if (!message) return { ok: false, error: "empty_message" };

  try {
    const { data, error } = await ((supabase.schema("public").from as unknown as (
      relation: string
    ) => {
      insert: (
        values: Record<string, unknown>
      ) => {
        select: (columns: string) => { single: () => Promise<{ data: { id?: string } | null; error: { message?: string } | null }> };
      };
    })("support_tickets"))
      .insert({
        user_id: userId,
        message,
        type: payload.type,
        status: payload.status ?? "open",
      })
      .select("id")
      .single();

    if (error) {
      const parsed = parseSupabaseError(error);
      console.error("SUPPORT TICKET ERROR", parsed);
      return { ok: false, error: parsed };
    }

    const id = String(data?.id ?? "");
    console.log("NEW TICKET:", { id, user_id: userId, type: payload.type });
    return { ok: true, id };
  } catch (error) {
    const parsed = parseSupabaseError(error);
    console.error("SUPPORT TICKET EXCEPTION", parsed);
    return { ok: false, error: parsed };
  }
}

export function notifyAdmin(event: {
  type: "payment_pending" | "support_ticket";
  user_id: string;
  message: string;
  payment_id?: string;
  listing_id?: string | null;
  promoKind?: string | null;
  amount?: number;
}) {
  console.log("ADMIN_NOTIFY", {
    ts: new Date().toISOString(),
    ...event,
  });
}
