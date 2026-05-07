// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text?: string | null;
  image_url?: string | null;
  voice_url?: string | null;
  deleted?: boolean | null;
};

type PushTokenRow = {
  user_id: string;
  token: string;
  provider?: string | null;
  subscription?: PushSubscriptionJson | null;
  last_seen_at?: string | null;
};

type PushSubscriptionJson = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  } | null;
};

type PresenceRow = {
  user_id: string;
  last_seen: string | null;
  visibility_state?: string | null;
  active_chat_id?: string | null;
};

type ProfileRow = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type RetryOptions = {
  retries: number;
  delayMs: number;
  shouldRetry?: (error: unknown) => boolean;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ONLINE_STALE_MS = 60_000;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(error)
        : true;
      if (!shouldRetry || attempt === options.retries) {
        throw error;
      }
      await sleep(options.delayMs * (attempt + 1));
    }
  }

  throw lastError;
}

function isRecentlyVisible(presence: PresenceRow | null | undefined): boolean {
  if (!presence?.last_seen) return false;
  const lastSeenMs = new Date(presence.last_seen).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  if (Date.now() - lastSeenMs > ONLINE_STALE_MS) return false;
  return (presence.visibility_state ?? "hidden") === "visible";
}

function buildMessageBody(record: MessageRow): string {
  if (record.deleted) return "Сообщение удалено";
  const text = String(record.text ?? "").trim();
  if (text) return text.slice(0, 240);
  if (record.image_url) return "📷 Фото";
  if (record.voice_url) return "🎤 Голосовое";
  return "Новое сообщение";
}

function buildSenderName(profile: ProfileRow | null | undefined): string {
  const name = String(profile?.name ?? "").trim();
  return name || "Enigma";
}

function errorToLog(error: unknown): Record<string, unknown> {
  if (!error) return { error: "unknown" };
  if (error instanceof Error) {
    const withExtras = error as Error & {
      status?: number;
      body?: string;
      body_json?: Record<string, unknown> | null;
    };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: withExtras.status ?? null,
      body: withExtras.body ?? null,
      body_json: withExtras.body_json ?? null,
    };
  }
  if (typeof error === "object") {
    return { ...(error as Record<string, unknown>) };
  }
  return { error: String(error) };
}

type EmailFallbackData = {
  chatId: string;
  senderName: string;
  messageBody: string;
  listingTitle: string;
  listingImage: string;
  chatUrl: string;
};

function generateEmailTemplate(data: EmailFallbackData): string {
  const safeTitle = String(data.listingTitle || "Ваше объявление");
  const safeSender = String(data.senderName || "Enigma");
  const safeBody = String(data.messageBody || "У вас новое сообщение");
  const safeUrl = String(data.chatUrl || "https://enigma-app.online");
  const safeImage = String(data.listingImage || "").trim();

  return `
  <div style="font-family: Arial, sans-serif; background:#0b0f1a; padding:20px; color:white;">
    <h1 style="
      font-size:28px;
      background: linear-gradient(135deg,#6366f1,#3b82f6);
      -webkit-background-clip:text;
      color:transparent;
      margin-bottom:20px;
    ">
      ENIGMA
    </h1>

    <p style="font-size:18px; margin-bottom:10px;">
      Новое сообщение в чате
    </p>

    <p style="color:#94a3b8; margin:0 0 8px 0;">
      Отправитель: ${safeSender}
    </p>

    <p style="color:#94a3b8; margin:0 0 8px 0;">
      Объявление: ${safeTitle}
    </p>

    <p style="color:#e2e8f0; margin:0 0 16px 0;">
      ${safeBody}
    </p>

    ${
      safeImage
        ? `<img src="${safeImage}" style="width:100%; max-width:520px; border-radius:12px; margin:16px 0;" />`
        : ""
    }

    <a href="${safeUrl}"
       style="
         display:block;
         text-align:center;
         background: linear-gradient(135deg,#6366f1,#3b82f6);
         color:white;
         padding:14px;
         border-radius:12px;
         text-decoration:none;
         font-weight:600;
         margin-top:20px;
       ">
       Открыть чат
    </a>
  </div>
  `;
}

async function sendEmailFallback(
  resendApiKey: string,
  email: string,
  data: EmailFallbackData,
): Promise<boolean> {
  const to = String(email ?? "").trim();
  if (!to) return false;
  const fromEmail = Deno.env.get("RESEND_FROM") || "support@enigma-app.online";

  console.log("SENDING EMAIL TO:", to);
  console.log("USING FROM EMAIL:", fromEmail);

  const resendResult = await withRetry(
    async () => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Enigma <${fromEmail}>`,
          to,
          subject: "У вас новое сообщение в Enigma",
          html: generateEmailTemplate(data),
        }),
      });
      const responseText = await response.text();
      let responseJson: Record<string, unknown> | null = null;
      try {
        responseJson = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : null;
      } catch {
        responseJson = null;
      }
      if (!response.ok) {
        const err = new Error(
          `Resend HTTP ${response.status}: ${response.statusText} :: ${responseText}`,
        );
        (err as Error & { status?: number; body?: string; body_json?: Record<string, unknown> | null }).status =
          response.status;
        (err as Error & { status?: number; body?: string; body_json?: Record<string, unknown> | null }).body =
          responseText;
        (err as Error & { status?: number; body?: string; body_json?: Record<string, unknown> | null }).body_json =
          responseJson;
        throw err;
      }
      return {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        bodyJson: responseJson,
      };
    },
    {
      retries: 2,
      delayMs: 800,
      shouldRetry: (error: unknown) => {
        const status = Number((error as { status?: unknown } | null)?.status ?? 0);
        if (Number.isFinite(status) && status > 0) {
          return shouldRetryHttpStatus(status);
        }
        const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
        return msg.includes("timeout") || msg.includes("network");
      },
    },
  );
  const sentData = resendResult as {
    status: number;
    statusText: string;
    body: string;
    bodyJson?: Record<string, unknown> | null;
  };

  console.log("EMAIL SENT", {
    email: to,
    resend_id: sentData.bodyJson?.id ?? null,
    chat_id: data.chatId,
    response_status: sentData.status,
    response_status_text: sentData.statusText,
    response_body: sentData.body,
    response_body_json: sentData.bodyJson ?? null,
  });
  return true;
}

function shouldRetryHttpStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

function shouldRetryPushError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("429") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504")
    ) {
      return true;
    }
  }
  return false;
}

function normalizeWebSubscription(
  subscription: PushSubscriptionJson | null | undefined,
): webpush.PushSubscription | null {
  if (
    !subscription?.endpoint ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    return null;
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

async function sendExpoPushBatch(
  tokens: string[],
  title: string,
  body: string,
  url: string,
  chatId: string,
): Promise<void> {
  if (!tokens.length) return;

  const payloads = tokens.map((token) => ({
    to: token,
    title,
    body,
    sound: "default" as const,
    data: {
      url,
      chatId,
    },
  }));

  await withRetry(
    async () => {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payloads),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Expo push failed: ${resp.status} ${text}`);
      }

      const json = await resp.json().catch(() => null);
      if (!json || !Array.isArray(json.data)) {
        return;
      }

      for (const item of json.data) {
        if (item?.status === "error") {
          const details = JSON.stringify(item?.details ?? {});
          throw new Error(`Expo push item error: ${item?.message ?? details}`);
        }
      }
    },
    {
      retries: 1,
      delayMs: 500,
      shouldRetry: shouldRetryPushError,
    },
  );
}

async function sendExpoPushOne(
  token: string,
  title: string,
  body: string,
  url: string,
  chatId: string,
): Promise<boolean> {
  if (!token) return false;

  return await withRetry(
    async () => {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify([
          {
            to: token,
            title,
            body,
            sound: "default",
            data: { url, chatId },
          },
        ]),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Expo push failed: ${resp.status} ${text}`);
      }

      const json = await resp.json().catch(() => null);
      if (!json || !Array.isArray(json.data) || json.data.length === 0) {
        return true;
      }

      const item = json.data[0];
      if (item?.status === "error") {
        const details = JSON.stringify(item?.details ?? {});
        throw new Error(`Expo push item error: ${item?.message ?? details}`);
      }

      return true;
    },
    {
      retries: 1,
      delayMs: 500,
      shouldRetry: shouldRetryPushError,
    },
  );
}

async function sendWebPushOne(
  tokenRow: PushTokenRow,
  title: string,
  body: string,
  url: string,
  chatId: string,
  senderName: string,
): Promise<{ expired: boolean }> {
  const subscription = normalizeWebSubscription(tokenRow.subscription);
  if (!subscription) {
    throw new Error(
      `Invalid web push subscription for token ${tokenRow.token}`,
    );
  }

  try {
    await withRetry(
      async () => {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            title,
            body,
            tag: `chat:${chatId}`,
            renotify: true,
            requireInteraction: false,
            data: {
              chatId,
              url,
              senderName,
              messageText: body,
            },
          }),
          {
            TTL: 60,
            urgency: "high",
            topic: `chat-${chatId}`,
          },
        );
      },
      {
        retries: 1,
        delayMs: 500,
        shouldRetry: shouldRetryPushError,
      },
    );

    return { expired: false };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      ((error as { statusCode?: number }).statusCode === 404 ||
        (error as { statusCode?: number }).statusCode === 410)
    ) {
      return { expired: true };
    }

    throw error;
  }
}

async function deletePushToken(
  supabase: ReturnType<typeof createClient>,
  row: PushTokenRow,
): Promise<void> {
  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", row.user_id)
    .eq("token", row.token);

  if (error) {
    console.error("push_tokens delete failed", error);
  }
}

serve(async (req) => {
  try {
    console.log("WEBHOOK TRIGGERED");
    const secret = req.headers.get("x-chat-notify-secret");
    const expectedSecret = requiredEnv("CHAT_NOTIFY_SECRET");
    if (secret !== expectedSecret) {
      console.log("SECRET MISMATCH", {
        hasSecretHeader: Boolean(secret),
        headerLen: secret?.length ?? 0,
        envLen: expectedSecret.length,
      });
      return new Response("Unauthorized", { status: 401 });
    }
    console.log("SECRET OK");

    const body = await req.json().catch(() => null);
    const record = (body?.record ?? body?.payload?.record) as
      | MessageRow
      | undefined;

    console.log("PAYLOAD MESSAGE:", {
      id: record?.id ?? null,
      chat_id: record?.chat_id ?? null,
      sender_id: record?.sender_id ?? null,
      text: typeof record?.text === "string" ? record.text.slice(0, 120) : null,
    });

    if (!record?.id || !record.chat_id || !record.sender_id) {
      return new Response("No message", { status: 400 });
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl =
      optionalEnv("NEXT_PUBLIC_SITE_URL") || "https://enigma-app.online";
    const resendApiKey = optionalEnv("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: members, error: membersError } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", record.chat_id)
      .neq("user_id", record.sender_id);

    if (membersError) {
      console.error("chat_members select failed", membersError);
      return new Response("Error", { status: 500 });
    }

    const recipientIds = [
      ...new Set((members ?? []).map((m: { user_id: string }) => m.user_id)),
    ];
    if (!recipientIds.length) {
      return new Response("OK", { status: 200 });
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("id,name")
      .eq("id", record.sender_id)
      .maybeSingle();

    const senderName = buildSenderName(senderProfile as ProfileRow | null);
    const messageBody = buildMessageBody(record);
    const title = senderName;
    const url = `${siteUrl.replace(/\/+$/, "")}/chat/${record.chat_id}`;
    const recipientTargetIds = recipientIds.filter(
      (recipientId) => recipientId !== record.sender_id,
    );
    console.log("EMAIL TARGET RECIPIENTS:", recipientTargetIds);
    if (!recipientTargetIds.length) return new Response("ok", { status: 200 });

    const [{ data: recipientProfiles }, { data: chatRow }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email")
        .in("id", recipientTargetIds),
      supabase
        .from("chats")
        .select("listing_id")
        .eq("id", record.chat_id)
        .maybeSingle(),
    ]);

    const recipientEmailMap = new Map<string, string>();
    for (const row of recipientProfiles ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const email = String((row as { email?: string | null }).email ?? "").trim();
      if (id && email) recipientEmailMap.set(id, email);
    }
    const missingEmailUserIds = recipientTargetIds.filter(
      (id) => !recipientEmailMap.has(id),
    );
    if (missingEmailUserIds.length > 0) {
      const { data: authUserRows } = await supabase
        .schema("auth")
        .from("users")
        .select("id,email")
        .in("id", missingEmailUserIds);
      for (const row of authUserRows ?? []) {
        const id = String((row as { id?: string }).id ?? "").trim();
        const email = String((row as { email?: string | null }).email ?? "").trim();
        if (id && email && !recipientEmailMap.has(id)) {
          recipientEmailMap.set(id, email);
        }
      }
    }

    let listingTitle = "Ваше объявление";
    let listingImage = "";
    const listingId = String((chatRow as { listing_id?: string | null } | null)?.listing_id ?? "").trim();
    if (listingId) {
      const [{ data: listingRow }, { data: imageRow }] = await Promise.all([
        supabase
          .from("listings")
          .select("title")
          .eq("id", listingId)
          .maybeSingle(),
        supabase
          .from("images")
          .select("url,sort_order")
          .eq("listing_id", listingId)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      const maybeTitle = String((listingRow as { title?: string | null } | null)?.title ?? "").trim();
      if (maybeTitle) listingTitle = maybeTitle;
      listingImage = String((imageRow as { url?: string | null } | null)?.url ?? "").trim();
    }

    console.log("NOTIFY MODE: email-first fallback (push-independent)");

    if (resendApiKey) {
      let successCount = 0;
      const failedRecipients: string[] = [];
      for (const recipientId of recipientTargetIds) {
        console.log("EMAIL FALLBACK TARGET", recipientId);
        const recipientEmail = recipientEmailMap.get(recipientId);
        if (!recipientEmail) {
          console.log("NO EMAIL FOR USER", recipientId);
          failedRecipients.push(`${recipientId}:no_email`);
          continue;
        }
        try {
          const sent = await sendEmailFallback(resendApiKey, recipientEmail, {
            chatId: record.chat_id,
            senderName,
            messageBody,
            listingTitle,
            listingImage,
            chatUrl: url,
          });
          if (sent) {
            successCount += 1;
          } else {
            failedRecipients.push(`${recipientId}:${recipientEmail}`);
          }
        } catch (emailErr) {
          console.error("EMAIL FALLBACK EXCEPTION", {
            recipientId,
            recipientEmail,
            ...errorToLog(emailErr),
          });
          failedRecipients.push(`${recipientId}:${recipientEmail}`);
        }
      }
      console.log("EMAIL FALLBACK SUMMARY", {
        message_id: record.id,
        chat_id: record.chat_id,
        recipients_total: recipientTargetIds.length,
        email_success: successCount,
        email_failed: failedRecipients.length,
        failed_recipients: failedRecipients,
      });
      // Return 500 when nothing was delivered via email so webhook can retry.
      if (recipientTargetIds.length > 0 && successCount === 0) {
        return new Response("Email delivery failed for all recipients", {
          status: 500,
        });
      }
    } else {
      console.log("RESEND DISABLED: missing RESEND_API_KEY");
      return new Response("Resend disabled", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("notify-new-message fatal", errorToLog(error));
    return new Response("Error", { status: 500 });
  }
});
