-- Уведомления о новых сообщениях в чате на email (см. Edge Function notify-new-message + Resend).

alter table public.users
  add column if not exists email_notifications boolean not null default true;

comment on column public.users.email_notifications is 'Если true — при новом сообщении в чате отправляется email (Edge Function + Database Webhook).';

-- ─── Настройка доставки (вручную в Supabase Dashboard) ─────────────────────
-- 1. Задеплойте функцию: supabase functions deploy notify-new-message
-- 2. Secrets (Project Settings → Edge Functions): RESEND_API_KEY
--    PUBLIC_APP_URL (база приложения, напр. https://ваш-домен или expo dev),
--    CHAT_NOTIFY_SECRET (случайная строка; тот же секрет в заголовке вебхука)
-- 3. Database → Webhooks → Create hook:
--    - Table: public.messages
--    - Events: INSERT
--    - Type: Supabase Edge Functions → notify-new-message (после миграции 012 — также Expo Push по push_tokens)
--    ИЛИ HTTP Request:
--    - URL: https://<PROJECT_REF>.supabase.co/functions/v1/notify-new-message
--    - HTTP Headers: x-chat-notify-secret: <тот же CHAT_NOTIFY_SECRET>
--    - HTTP Headers: Authorization: Bearer <anon или service_role>
-- 4. В Resend используйте верифицированный домен (напр. noreply@enigma-app.online) для production «from».
