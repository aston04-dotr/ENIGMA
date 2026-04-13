-- ENIGMA: монетизация, бусты, VIP, TOP (выполнить в SQL Editor после основной schema.sql)

alter table public.listings add column if not exists is_vip boolean not null default false;
alter table public.listings add column if not exists vip_until timestamptz;
alter table public.listings add column if not exists is_top boolean not null default false;
alter table public.listings add column if not exists top_until timestamptz;
alter table public.listings add column if not exists boosted_at timestamptz;
alter table public.listings add column if not exists boosted_until timestamptz;
alter table public.listings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  type text not null check (type in ('boost', 'vip', 'top')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_listing_boosts_listing on public.listing_boosts (listing_id);
create index if not exists idx_listings_top_until on public.listings (top_until desc nulls last);
create index if not exists idx_listings_vip_until on public.listings (vip_until desc nulls last);
create index if not exists idx_listings_boosted on public.listings (boosted_at desc nulls last);

alter table public.listing_boosts enable row level security;

drop policy if exists "listing_boosts_select" on public.listing_boosts;
create policy "listing_boosts_select" on public.listing_boosts for select using (true);

drop policy if exists "listing_boosts_insert_own" on public.listing_boosts;
create policy "listing_boosts_insert_own" on public.listing_boosts for insert to authenticated with check (
  exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
);
