-- Enigma: до 15 активных объявлений бесплатно (все категории); сверх — capacity из listing_extra_slot_capacity.
-- Пакеты пополняют listing_extra_slot_capacity (см. webhook web).

alter table public.profiles
  add column if not exists listing_extra_slot_capacity int not null default 0;

create or replace function public.listings_enforce_active_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
  cap_extra int;
  free_cap constant int := 15;
begin
  select coalesce(listing_extra_slot_capacity, 0) into cap_extra
  from public.profiles
  where id = new.user_id;

  if cap_extra is null then
    cap_extra := 0;
  end if;

  select count(*)::int into active_count
  from public.listings
  where user_id = new.user_id
    and coalesce(status, 'active') is distinct from 'expired';

  if active_count >= free_cap + cap_extra then
    raise exception 'LISTING_ACTIVE_QUOTA_EXCEEDED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_active_quota_insert on public.listings;
create trigger listings_active_quota_insert
  before insert on public.listings
  for each row execute function public.listings_enforce_active_quota();

-- Только service role (YooKassa webhook на сервере).
create or replace function public.add_listing_extra_slot_capacity_service(p_user_id uuid, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_user';
  end if;
  if p_delta is null or p_delta <= 0 then
    raise exception 'invalid_delta';
  end if;

  update public.profiles
  set listing_extra_slot_capacity = coalesce(listing_extra_slot_capacity, 0) + p_delta
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;
end;
$$;

revoke all on function public.add_listing_extra_slot_capacity_service(uuid, int) from public;
grant execute on function public.add_listing_extra_slot_capacity_service(uuid, int) to service_role;
