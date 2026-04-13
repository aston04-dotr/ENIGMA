-- Soft restrictions: shadow feed, chat start, edit/listing images, LOW tier rate, daily recovery.

-- Видимость в ленте / публичный профиль (обход RLS profiles для анонимов).
create or replace function public.profile_trust_visible_in_feed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.trust_score from public.profiles p where p.id = p_user), 100) >= 15;
$$;

create or replace function public.user_profile_publicly_visible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.trust_score from public.profiles p where p.id = p_user), 100) >= 15;
$$;

grant execute on function public.profile_trust_visible_in_feed(uuid) to anon, authenticated;
grant execute on function public.user_profile_publicly_visible(uuid) to anon, authenticated;

drop policy if exists "listings_select" on public.listings;
create policy "listings_select" on public.listings for select using (
  auth.uid() = user_id
  or public.profile_trust_visible_in_feed(user_id)
  or coalesce(is_partner_ad, false) = true
);

drop policy if exists "users_select_all" on public.users;
drop policy if exists "users_select_public" on public.users;
create policy "users_select_public" on public.users for select using (
  auth.uid() = id
  or public.user_profile_publicly_visible(id)
);

-- Уровень доверия (для SQL/отладки).
create or replace function public.get_trust_level(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s int;
begin
  select coalesce(trust_score, 100) into s from public.profiles where id = p_user;
  if s is null then
    s := 100;
  end if;
  if s >= 80 then return 'HIGH'; end if;
  if s >= 50 then return 'MEDIUM'; end if;
  if s >= 20 then return 'LOW'; end if;
  return 'CRITICAL';
end;
$$;

grant execute on function public.get_trust_level(uuid) to authenticated;

-- Восстановление +1 раз в сутки (+5, не выше 100).
alter table public.profiles add column if not exists last_trust_recovery_at timestamptz;

create or replace function public.try_daily_trust_recovery()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last_at timestamptz;
begin
  if uid is null then
    return;
  end if;
  select last_trust_recovery_at into last_at from public.profiles where id = uid;

  if last_at is not null and last_at > now() - interval '1 day' then
    return;
  end if;

  update public.profiles
  set
    trust_score = least(100, coalesce(trust_score, 100) + 5),
    last_trust_recovery_at = now()
  where id = uid
    and (last_trust_recovery_at is null or last_trust_recovery_at <= now() - interval '1 day');
end;
$$;

grant execute on function public.try_daily_trust_recovery() to authenticated;

-- CRITICAL (<20): нельзя создавать объявления; LOW (20–49): не более 1 в час.
create or replace function public.listings_enforce_trust_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s int;
  cnt int;
begin
  select coalesce(trust_score, 100) into s from public.profiles where id = new.user_id;
  if s is null then
    s := 100;
  end if;
  if s < 20 then
    raise exception 'ACCOUNT_RESTRICTED' using errcode = 'P0001';
  end if;
  if s >= 50 then
    return new;
  end if;
  select count(*)::int into cnt
  from public.listings
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';
  if cnt >= 1 then
    raise exception 'LISTING_RATE_LIMIT_LOW_TRUST' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_trust_insert on public.listings;
create trigger listings_trust_insert
  before insert on public.listings
  for each row execute function public.listings_enforce_trust_insert();

-- Нельзя редактировать объявление при trust < 20.
create or replace function public.listings_enforce_trust_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s int;
begin
  select coalesce(trust_score, 100) into s from public.profiles where id = new.user_id;
  if s is null then
    s := 100;
  end if;
  if s < 20 then
    raise exception 'ACCOUNT_RESTRICTED_EDIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_trust_update on public.listings;
create trigger listings_trust_update
  before update on public.listings
  for each row execute function public.listings_enforce_trust_update();

-- Фото к объявлениям: trust < 20.
drop policy if exists "images_insert" on public.images;
create policy "images_insert" on public.images for insert to authenticated with check (
  exists (
    select 1
    from public.listings l
    inner join public.profiles p on p.id = l.user_id
    where l.id = listing_id
      and l.user_id = auth.uid()
      and coalesce(p.trust_score, 100) >= 20
  )
);

-- Новый личный чат: trust < 30.
create or replace function public.chats_enforce_trust_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s int;
  uid uuid := auth.uid();
begin
  if coalesce(new.is_group, false) then
    return new;
  end if;
  if uid is null then
    return new;
  end if;
  if uid is distinct from new.user1 and uid is distinct from new.user2 then
    return new;
  end if;
  select coalesce(trust_score, 100) into s from public.profiles where id = uid;
  if s is null then
    s := 100;
  end if;
  if s < 30 then
    raise exception 'CHAT_START_RESTRICTED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists chats_trust_insert on public.chats;
create trigger chats_trust_insert
  before insert on public.chats
  for each row execute function public.chats_enforce_trust_insert();
