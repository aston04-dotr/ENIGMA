-- Голосовые сообщения, push-токены, buckets voices + images (Storage).

alter table public.messages add column if not exists voice_url text;

create table if not exists public.push_tokens (
  user_id uuid not null references public.users (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own" on public.push_tokens for select to authenticated using (auth.uid() = user_id);
create policy "push_tokens_insert_own" on public.push_tokens for insert to authenticated with check (auth.uid() = user_id);
create policy "push_tokens_delete_own" on public.push_tokens for delete to authenticated using (auth.uid() = user_id);

-- Публичное чтение; запись — авторизованные (как listing-images / chat-images).
insert into storage.buckets (id, name, public)
values ('voices', 'voices', true), ('images', 'images', true)
on conflict (id) do nothing;

create policy "storage_read_voices_images" on storage.objects for select using (
  bucket_id in ('voices', 'images')
);
create policy "storage_write_voices_images" on storage.objects for insert to authenticated with check (
  bucket_id in ('voices', 'images')
);
create policy "storage_update_voices_images" on storage.objects for update to authenticated using (
  bucket_id in ('voices', 'images')
);
create policy "storage_delete_voices_images" on storage.objects for delete to authenticated using (
  bucket_id in ('voices', 'images')
);

-- Edge Function `notify-new-message`: после деплоя в Secrets добавьте те же переменные, что для email (SUPABASE_* подставляются автоматически).
-- Database → Webhooks: INSERT public.messages → вызов notify-new-message (заголовок x-chat-notify-secret = CHAT_NOTIFY_SECRET).
-- Push: получатель по chats.user1/user2; токены в push_tokens; отправка через https://exp.host/--/api/v2/push/send
