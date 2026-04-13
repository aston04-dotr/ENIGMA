-- Device fingerprint on profiles; optional device ban in banned_users; RPCs for checks (RLS-safe).

alter table public.profiles add column if not exists device_id text;

create index if not exists idx_profiles_device_id on public.profiles (device_id) where device_id is not null;

alter table public.banned_users add column if not exists device_id text;

create index if not exists idx_banned_users_device_id on public.banned_users (device_id) where device_id is not null;

create or replace function public.check_device_banned(p_device text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.banned_users b
    where p_device is not null
      and b.device_id is not null
      and b.device_id = p_device
  );
$$;

grant execute on function public.check_device_banned(text) to authenticated;

create or replace function public.count_profiles_for_device(p_device text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles p where p.device_id is not null and p.device_id = p_device;
$$;

grant execute on function public.count_profiles_for_device(text) to authenticated;

-- Бан по устройству (админ): insert into public.banned_users (device_id) values ('a:....');
