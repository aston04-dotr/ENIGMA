-- Пакеты размещений: счётчики на пользователе + безопасное начисление/списание (RPC).

alter table public.users add column if not exists real_estate_package_count int not null default 0;
alter table public.users add column if not exists auto_package_count int not null default 0;
alter table public.users add column if not exists other_package_count int not null default 0;

comment on column public.users.real_estate_package_count is 'Остаток слотов пакета «Недвижимость»';
comment on column public.users.auto_package_count is 'Остаток слотов пакета «Авто»';
comment on column public.users.other_package_count is 'Остаток слотов общего пакета (прочие категории)';

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
    update public.users set real_estate_package_count = real_estate_package_count + p_slots where id = uid;
  elsif p_kind = 'auto' then
    update public.users set auto_package_count = auto_package_count + p_slots where id = uid;
  elsif p_kind = 'other' then
    update public.users set other_package_count = other_package_count + p_slots where id = uid;
  else
    raise exception 'invalid package kind';
  end if;
end;
$$;

revoke all on function public.add_package_credits(text, int) from public;
grant execute on function public.add_package_credits(text, int) to authenticated;

-- Категория объявления: realestate → пакет недвижимости; auto → авто; иначе → общий пакет.
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
