import { supabase } from "@/lib/supabase";

async function sendSupportEmail(params: { subject: string; text: string }): Promise<void> {
  try {
    const resp = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: params.subject,
        text: params.text,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("SUPPORT EMAIL ERROR", { status: resp.status, body });
      return;
    }

    console.log("SUPPORT EMAIL SENT");
  } catch (error) {
    console.error("SUPPORT EMAIL EXCEPTION", error);
  }
}

export type SupportTicketStatus = "open" | "closed";
export type SupportTicketType = "payment" | "listing" | "login" | "error" | "other";

export type ManualPaymentStatus = "pending" | "approved" | "rejected";

export type ManualPaymentType = "boost" | "top" | "vip" | "package";

export type SupportTicketPayload = {
  user_id: string;
  message: string;
  type: SupportTicketType;
  status?: SupportTicketStatus;
  notifyByEmail?: boolean;
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

  const sendNotification = payload.notifyByEmail !== false;

  const maybeNotify = () => {
    if (!sendNotification) return;
    notifyAdmin({
      type: "support_ticket",
      user_id: userId,
      message,
    });
  };

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
      maybeNotify();
      return { ok: false, error: parsed };
    }

    const id = String(data?.id ?? "");
    console.log("NEW TICKET:", { id, user_id: userId, type: payload.type });
    maybeNotify();
    return { ok: true, id };
  } catch (error) {
    const parsed = parseSupabaseError(error);
    console.error("SUPPORT TICKET EXCEPTION", parsed);
    maybeNotify();
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
  const subject = "[ENIGMA SUPPORT] Новое обращение";

  const createdAt = new Date().toISOString();

  const text = [
    `тип: ${event.type}`,
    `user_id: ${event.user_id}`,
    `текст обращения: ${event.message}`,
    `дата: ${createdAt}`,
    event.payment_id ? `payment_id: ${event.payment_id}` : null,
    event.listing_id ? `listing_id: ${event.listing_id}` : null,
    event.promoKind ? `promoKind: ${event.promoKind}` : null,
    typeof event.amount === "number" ? `amount: ${event.amount}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  console.log("ADMIN_NOTIFY", {
    ts: new Date().toISOString(),
    ...event,
  });

  void sendSupportEmail({ subject, text });
}
