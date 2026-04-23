// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

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
    const secret = req.headers.get("x-chat-notify-secret");
    if (secret !== requiredEnv("CHAT_NOTIFY_SECRET")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const record = (body?.record ?? body?.payload?.record) as
      | MessageRow
      | undefined;

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

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    }

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

    if (!eligibleRecipientIds.length) {
      return new Response("OK", { status: 200 });
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

    if (expoTokens.length) {
      try {
        await sendExpoPushBatch(
          expoTokens,
          title,
          messageBody,
          url,
          record.chat_id,
        );
      } catch (error) {
        console.error("Expo push delivery failed", error);
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
        }
      } catch (error) {
        console.error("Web push delivery failed", {
          user_id: tokenRow.user_id,
          token: tokenRow.token,
          error,
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("notify-new-message fatal", error);
    return new Response("Error", { status: 500 });
  }
});
