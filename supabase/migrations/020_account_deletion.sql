-- Account deletion: tombstone identities (re-registration block), NO touch to banned_users.
-- delete_my_account() SECURITY DEFINER — только RPC, не прямые DELETE с клиента.

alter table public.profiles add column if not exists deleted_at timestamptz;

create table if not exists public.deleted_identities (
  id uuid primary key default gen_random_uuid(),
  email_norm text,
  phone_norm text,
  device_id text,
  created_at timestamptz not null default now(),
  constraint deleted_identities_some_identity check (
    email_norm is not null or phone_norm is not null or device_id is not null
  )
);

create unique index if not exists deleted_identities_email_uq
  on public.deleted_identities (email_norm) where email_norm is not null;
create unique index if not exists deleted_identities_phone_uq
  on public.deleted_identities (phone_norm) where phone_norm is not null;
create unique index if not exists deleted_identities_device_uq
  on public.deleted_identities (device_id) where device_id is not null;

alter table public.deleted_identities enable row level security;
drop policy if exists "deleted_identities_no_access" on public.deleted_identities;
create policy "deleted_identities_no_access" on public.deleted_identities for all using (false);

-- Единая проверка: бан (banned_users) ИЛИ tombstone (удалённый аккаунт). banned_users не изменяется.
create or replace function public.check_access_blocked(p_email text, p_phone text, p_device text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.banned_users b
      where (p_email is not null and b.email is not null and lower(trim(b.email)) = lower(trim(p_email)))
         or (p_phone is not null and b.phone is not null and trim(b.phone) = trim(p_phone))
         or (p_device is not null and b.device_id is not null and trim(b.device_id) = trim(p_device))
    )
    or exists (
      select 1 from public.deleted_identities d
      where (p_email is not null and d.email_norm is not null and d.email_norm = lower(trim(p_email)))
         or (p_phone is not null and d.phone_norm is not null and d.phone_norm = trim(p_phone))
         or (p_device is not null and d.device_id is not null and trim(d.device_id) = trim(p_device))
    );
$$;

grant execute on function public.check_access_blocked(text, text, text) to authenticated;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p_email text;
  p_phone text;
  p_device text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select email, phone, device_id into p_email, p_phone, p_device
  from public.profiles
  where id = uid;

  begin
    insert into public.deleted_identities (email_norm, phone_norm, device_id)
    values (
      case when p_email is not null and length(trim(p_email)) > 0 then lower(trim(p_email)) end,
      case when p_phone is not null and length(trim(p_phone)) > 0 then trim(p_phone) end,
      case when p_device is not null and length(trim(p_device)) > 0 then trim(p_device) end
    );
  exception
    when unique_violation then
      null;
  end;

  update public.profiles
  set deleted_at = now(), email = null, phone = null, device_id = null
  where id = uid;

  delete from public.users where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
