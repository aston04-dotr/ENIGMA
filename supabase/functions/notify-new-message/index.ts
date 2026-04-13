import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text?: string | null;
  image_url?: string | null;
  voice_url?: string | null;
};

serve(async (req) => {
  try {
    const body = await req.json();

    const secret = req.headers.get("x-chat-notify-secret");
    if (secret !== Deno.env.get("CHAT_NOTIFY_SECRET")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const record = (body?.record ?? body?.payload?.record) as MessageRow | undefined;
    if (!record?.id || !record.chat_id || !record.sender_id) {
      return new Response("No message", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const senderId = record.sender_id;

    const { data: members } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", record.chat_id)
      .neq("user_id", senderId);

    const recipientIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
    if (!recipientIds.length) return new Response("OK", { status: 200 });

    const { data: tokens } = await supabase.from("push_tokens").select("token").in("user_id", recipientIds);

    if (!tokens?.length) return new Response("OK", { status: 200 });

    let bodyText = String(record.text ?? "").trim();
    if (!bodyText && record.image_url) bodyText = "📷 Фото";
    if (!bodyText && record.voice_url) bodyText = "🎤 Голос";
    if (!bodyText) bodyText = "Новое сообщение";

    const payloads = tokens.map((t) => ({
      to: t.token,
      title: "Новое сообщение",
      body: bodyText,
      sound: "default" as const,
    }));

    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payloads),
    });

    if (!resp.ok) {
      console.error("Expo push failed", await resp.text());
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("notify-new-message", e);
    return new Response("Error", { status: 500 });
  }
});
