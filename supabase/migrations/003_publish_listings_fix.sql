-- ENIGMA: публикация объявлений — частые причины ошибки INSERT
-- Выполнить в SQL Editor после schema.sql и 002_monetization.sql.
--
-- 1) FK: listings.user_id → public.users(id). Если пользователь есть в auth.users,
--    но профиля нет в public.users (триггер не сработал для старых аккаунтов), INSERT падает.
-- 2) RLS: вставка только для роли authenticated и при auth.uid() = user_id (аноним не может).

-- ── A) Рекомендуется: дозаполнить public.users из auth.users ─────────────────
insert into public.users (id, phone)
select id, phone::text
from auth.users
on conflict (id) do nothing;

-- ── B) Только отладка / локальный хак: полностью отключить RLS на listings
--     НЕ используйте на проде с публичным anon-ключом — любой клиент сможет писать в таблицу.
-- alter table public.listings disable row level security;

-- ── C) Альтернатива B (чуть мягче): оставить RLS, но разрешить любому вставлять (опасно на проде)
-- drop policy if exists "listings_insert_open_debug" on public.listings;
-- create policy "listings_insert_open_debug" on public.listings for insert with check (true);
