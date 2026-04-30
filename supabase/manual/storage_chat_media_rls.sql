-- RLS для фото в чате (bucket `chat-media`, см. web: supabase.storage.from("chat-media").upload).
-- Текст в чате работает у обоих, upload фото — нет → почти всегда INSERT в storage.objects режется политикой.
--
-- В Dashboard: Storage → chat-media → Public bucket (как сейчас в коде: getPublicUrl).
-- Для отображения картинок по публичному URL браузер ходит без JWT → нужен SELECT для anon
-- (или оставить bucket public с дефолтными политиками Supabase — но при кастомных политиках это нужно явно).
--
-- Выполнить в SQL Editor (одна транзакция или по шагам).

alter table if exists storage.objects enable row level security;

-- Снимите свои старые одноимённые политики при необходимости:
drop policy if exists "Allow upload for authenticated" on storage.objects;
drop policy if exists "Allow read for authenticated" on storage.objects;

-- Узко по bucket чата (не трогаем listing-images и др.)
drop policy if exists "chat_media_insert_authenticated" on storage.objects;
drop policy if exists "chat_media_select_anon_authenticated" on storage.objects;

create policy "chat_media_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and auth.uid() is not null
);

-- Публичное чтение объектов этого bucket (img src = public URL без заголовка Authorization)
create policy "chat_media_select_anon_authenticated"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'chat-media');

-- Опционально: удаление только автором по префиксу uid — пока не добавляем, чтобы не ломать текущий код.
