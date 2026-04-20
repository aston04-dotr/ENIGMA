-- Safe payment placeholder + monetization bootstrap for ENIGMA
-- Run in Supabase SQL Editor once.

-- 1) Listing monetization fields
alter table public.listings add column if not exists is_vip boolean not null default false;
alter table public.listings add column if not exists vip_until timestamptz;
alter table public.listings add column if not exists is_top boolean not null default false;
alter table public.listings add column if not exists top_until timestamptz;
alter table public.listings add column if not exists boosted_at timestamptz;
alter table public.listings add column if not exists boosted_until timestamptz;
alter table public.listings add column if not exists updated_at timestamptz not null default now();
alter table public.listings add column if not exists is_boosted boolean not null default false;

create index if not exists idx_listings_top_until on public.listings (top_until desc nulls last);
create index if not exists idx_listings_vip_until on public.listings (vip_until desc nulls last);
create index if not exists idx_listings_boosted_until on public.listings (boosted_until desc nulls last);

-- 2) Promotion history
create table if not exists public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  type text not null check (type in ('boost', 'vip', 'top')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_listing_boosts_listing on public.listing_boosts (listing_id);
create index if not exists idx_listing_boosts_type on public.listing_boosts (type, created_at desc);

alter table public.listing_boosts enable row level security;

drop policy if exists "listing_boosts_select" on public.listing_boosts;
create policy "listing_boosts_select"
on public.listing_boosts
for select
using (true);

drop policy if exists "listing_boosts_insert_own" on public.listing_boosts;
create policy "listing_boosts_insert_own"
on public.listing_boosts
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

-- 3) Package balances on users
alter table public.users add column if not exists real_estate_package_count int not null default 0;
alter table public.users add column if not exists auto_package_count int not null default 0;
alter table public.users add column if not exists other_package_count int not null default 0;

-- 4) Safe package credit add
create or replace function public.add_package_credits(p_kind text, p_slots int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_slots is null or p_slots <= 0 then
    raise exception 'invalid slots';
  end if;

  if p_kind = 'real_estate' then
    update public.users
      set real_estate_package_count = real_estate_package_count + p_slots
      where id = uid;
  elsif p_kind = 'auto' then
    update public.users
      set auto_package_count = auto_package_count + p_slots
      where id = uid;
  elsif p_kind = 'other' then
    update public.users
      set other_package_count = other_package_count + p_slots
      where id = uid;
  else
    raise exception 'invalid package kind';
  end if;
end;
$$;

revoke all on function public.add_package_credits(text, int) from public;
grant execute on function public.add_package_credits(text, int) to authenticated;

-- 5) Safe package consume without going negative
create or replace function public.try_consume_listing_package(p_category text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;

  if p_category = 'realestate' then
    update public.users
      set real_estate_package_count = real_estate_package_count - 1
      where id = uid and real_estate_package_count > 0;
    return found;
  elsif p_category = 'auto' then
    update public.users
      set auto_package_count = auto_package_count - 1
      where id = uid and auto_package_count > 0;
    return found;
  else
    update public.users
      set other_package_count = other_package_count - 1
      where id = uid and other_package_count > 0;
    return found;
  end if;
end;
$$;

revoke all on function public.try_consume_listing_package(text) from public;
grant execute on function public.try_consume_listing_package(text) to authenticated;

-- 6) Optional order log for future YooKassa integration and current placeholder mode
create table if not exists public.payment_orders (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  product_id text not null,
  provider text not null default 'disabled' check (provider in ('disabled', 'mock', 'yookassa')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  note text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists idx_payment_orders_user_created on public.payment_orders (user_id, created_at desc);

alter table public.payment_orders enable row level security;

drop policy if exists "payment_orders_select_own" on public.payment_orders;
create policy "payment_orders_select_own"
on public.payment_orders
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "payment_orders_insert_own" on public.payment_orders;
create policy "payment_orders_insert_own"
on public.payment_orders
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "payment_orders_update_own" on public.payment_orders;
create policy "payment_orders_update_own"
on public.payment_orders
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());