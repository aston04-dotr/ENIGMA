// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { Resend } from "npm:resend@4.0.0";

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
  resend: Resend,
  email: string,
  data: EmailFallbackData,
): Promise<boolean> {
  const to = String(email ?? "").trim();
  if (!to) return false;

  console.log("SENDING EMAIL TO:", to);

  const { error } = await resend.emails.send({
    from: "Enigma <noreply@enigma-app.online>",
    to,
    subject: "Новое сообщение в Enigma",
    html: generateEmailTemplate(data),
  });

  if (error) {
    console.log("EMAIL ERROR:", { email: to, error });
    return false;
  }

  console.log("EMAIL SENT");
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
    const vapidPublicKey = optionalEnv("WEB_PUSH_VAPID_PUBLIC_KEY");
    const vapidPrivateKey = optionalEnv("WEB_PUSH_VAPID_PRIVATE_KEY");
    const vapidSubject =
      optionalEnv("WEB_PUSH_VAPID_SUBJECT") ||
      "mailto:support@enigma-app.online";
    const resendApiKey = optionalEnv("RESEND_API_KEY");

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    }
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

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

    const [
      { data: senderProfile },
      { data: presenceRows },
      { data: tokenRows },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,name")
        .eq("id", record.sender_id)
        .maybeSingle(),
      supabase
        .from("online_users")
        .select("user_id,last_seen,visibility_state,active_chat_id")
        .in("user_id", recipientIds),
      supabase
        .from("push_tokens")
        .select("user_id,token,provider,subscription,last_seen_at")
        .in("user_id", recipientIds),
    ]);

    const senderName = buildSenderName(senderProfile as ProfileRow | null);
    const messageBody = buildMessageBody(record);
    const title = senderName;
    const url = `${siteUrl.replace(/\/+$/, "")}/chat/${record.chat_id}`;

    const presenceMap = new Map<string, PresenceRow>(
      (presenceRows ?? []).map((row: PresenceRow) => [row.user_id, row]),
    );

    const eligibleRecipientIds = recipientIds.filter((recipientId) => {
      const presence = presenceMap.get(recipientId);
      return !isRecentlyVisible(presence);
    });
    console.log("ELIGIBLE RECIPIENTS:", eligibleRecipientIds);

    if (!eligibleRecipientIds.length) {
      return new Response("ok", { status: 200 });
    }

    const [{ data: recipientProfiles }, { data: chatRow }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email")
        .in("id", eligibleRecipientIds),
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
    const missingEmailUserIds = eligibleRecipientIds.filter(
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

    const tokens = (tokenRows ?? []).filter((row: PushTokenRow) =>
      eligibleRecipientIds.includes(row.user_id),
    );

    const expoTokens = tokens
      .filter((row) => (row.provider ?? "expo") === "expo")
      .map((row) => row.token)
      .filter(Boolean);

    const webTokens = tokens.filter(
      (row) => (row.provider ?? "") === "webpush",
    );

    const pushDeliveredByUser = new Map<string, boolean>(
      eligibleRecipientIds.map((id) => [id, false]),
    );

    if (expoTokens.length) {
      const expoRows = tokens.filter((row) => (row.provider ?? "expo") === "expo");
      for (const tokenRow of expoRows) {
        try {
          const ok = await sendExpoPushOne(
            tokenRow.token,
            title,
            messageBody,
            url,
            record.chat_id,
          );
          if (ok) pushDeliveredByUser.set(tokenRow.user_id, true);
        } catch (error) {
          console.error("Expo push delivery failed", {
            user_id: tokenRow.user_id,
            token: tokenRow.token,
            error,
          });
        }
      }
    }

    for (const tokenRow of webTokens) {
      try {
        const result = await sendWebPushOne(
          tokenRow,
          title,
          messageBody,
          url,
          record.chat_id,
          senderName,
        );

        if (result.expired) {
          await deletePushToken(supabase, tokenRow);
        } else {
          pushDeliveredByUser.set(tokenRow.user_id, true);
        }
      } catch (error) {
        console.error("Web push delivery failed", {
          user_id: tokenRow.user_id,
          token: tokenRow.token,
          error,
        });
      }
    }

    if (resend) {
      for (const recipientId of eligibleRecipientIds) {
        if (recipientId === record.sender_id) continue;
        if (pushDeliveredByUser.get(recipientId)) continue;
        console.log("PUSH NOT DELIVERED, FALLBACK EMAIL", recipientId);
        const recipientEmail = recipientEmailMap.get(recipientId);
        if (!recipientEmail) {
          console.log("NO EMAIL FOR USER", recipientId);
          continue;
        }

        await sendEmailFallback(resend, recipientEmail, {
          chatId: record.chat_id,
          senderName,
          messageBody,
          listingTitle,
          listingImage,
          chatUrl: url,
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("notify-new-message fatal", error);
    return new Response("Error", { status: 500 });
  }
});
