-- Картинки в чате: тип сообщения + публичный bucket chat-media (до 5MB, image/*)

alter table public.messages add column if not exists type text;
update public.messages set type = 'text' where type is null;
alter table public.messages alter column type set default 'text';
alter table public.messages alter column type set not null;

alter table public.messages add column if not exists image_url text;

update public.messages
set type = 'image'
where coalesce(nullif(trim(image_url), ''), '') <> ''
  and type = 'text';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_read_chat_media" on storage.objects;
create policy "storage_read_chat_media" on storage.objects for select using (
  bucket_id = 'chat-media'
);

drop policy if exists "storage_write_chat_media" on storage.objects;
create policy "storage_write_chat_media" on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-media'
);

drop policy if exists "storage_update_chat_media" on storage.objects;
create policy "storage_update_chat_media" on storage.objects for update to authenticated using (
  bucket_id = 'chat-media'
) with check (bucket_id = 'chat-media');

drop policy if exists "storage_delete_chat_media" on storage.objects;
create policy "storage_delete_chat_media" on storage.objects for delete to authenticated using (
  bucket_id = 'chat-media'
);
