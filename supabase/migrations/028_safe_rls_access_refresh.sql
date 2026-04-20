-- Safe RLS refresh for public/readable marketplace tables and private user-owned tables.
-- This keeps the app working WITHOUT opening private data globally.
-- Run after the base schema and previous migrations.

-- 1) Public catalog/reference data
-- Cities can be public read-only.
alter table if exists public.cities enable row level security;
drop policy if exists "cities_select_all" on public.cities;
create policy "cities_select_all"
on public.cities
for select
using (true);

-- 2) Listings stay publicly readable, but writes remain owner-only.
alter table if exists public.listings enable row level security;
drop policy if exists "listings_select" on public.listings;
create policy "listings_select"
on public.listings
for select
using (true);

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own"
on public.listings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own"
on public.listings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own"
on public.listings
for delete
to authenticated
using (auth.uid() = user_id);

-- 3) Images are public to read, but only owner of the listing can write/delete.
alter table if exists public.images enable row level security;
drop policy if exists "images_select" on public.images;
create policy "images_select"
on public.images
for select
using (true);

drop policy if exists "images_insert" on public.images;
create policy "images_insert"
on public.images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.listings l
    where l.id = listing_id
      and l.user_id = auth.uid()
  )
);

drop policy if exists "images_delete" on public.images;
create policy "images_delete"
on public.images
for delete
to authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_id
      and l.user_id = auth.uid()
  )
);

-- 4) Favorites table used by the app.
-- NOTE: the project uses public.favorites, not a table named listing_favorites.
alter table if exists public.favorites enable row level security;
drop policy if exists "fav_select_own" on public.favorites;
create policy "fav_select_own"
on public.favorites
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "fav_insert_own" on public.favorites;
create policy "fav_insert_own"
on public.favorites
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "fav_delete_own" on public.favorites;
create policy "fav_delete_own"
on public.favorites
for delete
to authenticated
using (auth.uid() = user_id);

-- 5) Profiles contain sensitive fields (phone, email, trust_score),
-- so DO NOT disable RLS and DO NOT make them fully public.
alter table if exists public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 6) Payment orders: users can only access their own orders.
alter table if exists public.payment_orders enable row level security;
drop policy if exists "payment_orders_select_own" on public.payment_orders;
create policy "payment_orders_select_own"
on public.payment_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "payment_orders_insert_own" on public.payment_orders;
create policy "payment_orders_insert_own"
on public.payment_orders
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "payment_orders_update_own" on public.payment_orders;
create policy "payment_orders_update_own"
on public.payment_orders
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 7) Support tickets: create if missing and keep them private to the owner.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  type text not null default 'other',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists idx_support_tickets_user_created on public.support_tickets (user_id, created_at desc);

alter table if exists public.support_tickets enable row level security;
drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own"
on public.support_tickets
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own"
on public.support_tickets
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "support_tickets_update_own" on public.support_tickets;
create policy "support_tickets_update_own"
on public.support_tickets
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- IMPORTANT:
-- We intentionally DO NOT run:
--   ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.payment_orders DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.support_tickets DISABLE ROW LEVEL SECURITY;
-- because that would expose private user data and break security assumptions.