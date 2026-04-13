-- ENIGMA — схема БД для Supabase
--
-- ОБЯЗАТЕЛЬНО: Dashboard → SQL Editor → New query → вставьте ВЕСЬ этот файл → Run.
-- Без этого шага приложение выдаёт PGRST205 («таблица не найдена»). Включение Anonymous / ключ API таблицы не создают.
--
-- После успешного Run: при необходимости Storage уже создаётся блоком внизу файла; иначе создайте buckets listing-images, chat-images вручную.

-- Расширение для public_id
create extension if not exists "pgcrypto";

-- Публичный профиль (связь с auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  name text,
  email text,
  avatar text,
  public_id text unique not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  created_at timestamptz not null default now(),
  real_estate_package_count int not null default 0,
  auto_package_count int not null default 0,
  other_package_count int not null default 0,
  email_notifications boolean not null default true
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  price numeric not null default 0,
  category text not null,
  city text not null default '',
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  is_partner_ad boolean not null default false,
  is_boosted boolean not null default false
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user1 uuid not null references public.users (id) on delete cascade,
  user2 uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists chats_pair_idx on public.chats (
  least(user1, user2),
  greatest(user1, user2)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  text text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references public.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid not null references public.users (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- Просмотры (защищённый инкремент)
create or replace function public.increment_listing_views(listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings set view_count = view_count + 1 where id = listing;
end;
$$;

grant execute on function public.increment_listing_views(uuid) to anon, authenticated;

-- Счётчики избранного (SECURITY DEFINER — RLS на favorites не даёт общий count)
create or replace function public.listing_favorites_count(listing uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from public.favorites where listing_id = listing;
$$;

grant execute on function public.listing_favorites_count(uuid) to anon, authenticated;

create or replace function public.listing_favorites_counts(p_ids uuid[])
returns table (listing_id uuid, favorite_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select f.listing_id, count(*)::bigint
  from public.favorites f
  where f.listing_id = any(p_ids)
  group by f.listing_id;
$$;

grant execute on function public.listing_favorites_counts(uuid[]) to anon, authenticated;

-- Профиль при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.images enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.favorites enable row level security;
alter table public.reports enable row level security;

-- users
-- Профили читают все (в т.ч. гости ленты) — для звонка/чата; при необходимости вынесите телефон в отдельную таблицу с RLS
create policy "users_select_all" on public.users for select using (true);
create policy "users_update_own" on public.users for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users_insert_own" on public.users for insert to authenticated with check (auth.uid() = id);

-- listings
create policy "listings_select" on public.listings for select using (true);
create policy "listings_insert_own" on public.listings for insert to authenticated with check (auth.uid() = user_id);
create policy "listings_update_own" on public.listings for update to authenticated using (auth.uid() = user_id);
create policy "listings_delete_own" on public.listings for delete to authenticated using (auth.uid() = user_id);

-- images
create policy "images_select" on public.images for select using (true);
create policy "images_insert" on public.images for insert to authenticated with check (
  exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
);
create policy "images_delete" on public.images for delete to authenticated using (
  exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
);

-- chats
create policy "chats_select" on public.chats for select to authenticated using (auth.uid() = user1 or auth.uid() = user2);
create policy "chats_insert" on public.chats for insert to authenticated with check (
  auth.uid() = user1 or auth.uid() = user2
);

-- messages
create policy "messages_select" on public.messages for select to authenticated using (
  exists (
    select 1 from public.chats c
    where c.id = chat_id and (c.user1 = auth.uid() or c.user2 = auth.uid())
  )
);
create policy "messages_insert" on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.chats c
    where c.id = chat_id and (c.user1 = auth.uid() or c.user2 = auth.uid())
  )
);

-- favorites
create policy "fav_select_own" on public.favorites for select to authenticated using (auth.uid() = user_id);
create policy "fav_insert_own" on public.favorites for insert to authenticated with check (auth.uid() = user_id);
create policy "fav_delete_own" on public.favorites for delete to authenticated using (auth.uid() = user_id);

-- reports
create policy "reports_insert" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports_select_own" on public.reports for select to authenticated using (reporter_id = auth.uid());

-- Realtime: в Dashboard включите replication для таблицы messages (или выполните, если таблица ещё не в publication):
-- alter publication supabase_realtime add table public.messages;

-- Индексы
create index if not exists idx_listings_created on public.listings (created_at desc);
create index if not exists idx_listings_category on public.listings (category);
create index if not exists idx_listings_city on public.listings (city);
create index if not exists idx_listings_title_lower_pattern on public.listings (lower(title::text) varchar_pattern_ops);
create index if not exists idx_listings_feed_sort on public.listings (is_boosted desc, created_at desc, id desc);
create index if not exists idx_listings_user on public.listings (user_id);
create index if not exists idx_images_listing on public.images (listing_id);
create index if not exists idx_messages_chat on public.messages (chat_id, created_at);

-- Storage (публичное чтение, запись только авторизованным)
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true), ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

create policy "storage_read_images" on storage.objects for select using (
  bucket_id in ('listing-images', 'chat-images')
);
create policy "storage_write_auth" on storage.objects for insert to authenticated with check (
  bucket_id in ('listing-images', 'chat-images')
);
create policy "storage_update_auth" on storage.objects for update to authenticated using (
  bucket_id in ('listing-images', 'chat-images')
);
create policy "storage_delete_auth" on storage.objects for delete to authenticated using (
  bucket_id in ('listing-images', 'chat-images')
);
