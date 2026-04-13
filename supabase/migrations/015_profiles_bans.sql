-- Profiles (email + unique phone, cooldown via trigger — RLS cannot express OLD vs NEW cleanly).
-- Banned users checked via SECURITY DEFINER RPC (no public SELECT on bans).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text unique,
  phone_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists idx_banned_users_email_lower on public.banned_users (lower(email)) where email is not null;
create index if not exists idx_banned_users_phone on public.banned_users (phone) where phone is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.profiles_enforce_phone_cooldown()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone and old.phone is not null then
    if old.phone_updated_at is not null and old.phone_updated_at >= (now() - interval '60 days') then
      raise exception 'PHONE_CHANGE_TOO_SOON' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_phone_cooldown on public.profiles;
create trigger profiles_phone_cooldown
  before update on public.profiles
  for each row execute function public.profiles_enforce_phone_cooldown();

alter table public.banned_users enable row level security;

drop policy if exists "banned_users_no_access" on public.banned_users;
create policy "banned_users_no_access" on public.banned_users for all using (false);

create or replace function public.check_banned(p_email text, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.banned_users b
    where (p_email is not null and b.email is not null and lower(b.email) = lower(trim(p_email)))
       or (p_phone is not null and b.phone is not null and trim(b.phone) = trim(p_phone))
  );
$$;

grant execute on function public.check_banned(text, text) to authenticated;

-- Backfill profile rows (id + email only; phone may conflict across legacy rows)
insert into public.profiles (id, email, created_at)
select u.id, u.email, u.created_at
from public.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
