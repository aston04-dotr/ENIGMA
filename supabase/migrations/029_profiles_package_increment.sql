-- ENIGMA: profiles-only package balances + mock payment success support

alter table public.profiles add column if not exists real_estate_package_count int not null default 0;
alter table public.profiles add column if not exists auto_package_count int not null default 0;
alter table public.profiles add column if not exists other_package_count int not null default 0;

create or replace function public.increment_package(field_name text, inc_value int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if inc_value is null or inc_value <= 0 then
    raise exception 'invalid increment';
  end if;

  if field_name not in ('auto_package_count', 'real_estate_package_count', 'other_package_count') then
    raise exception 'invalid field';
  end if;

  execute format(
    'update public.profiles set %I = coalesce(%I, 0) + $1 where id = auth.uid()',
    field_name,
    field_name
  )
  using inc_value;
end;
$$;

grant execute on function public.increment_package(text, int) to authenticated;

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
    update public.profiles set real_estate_package_count = coalesce(real_estate_package_count, 0) + p_slots where id = uid;
  elsif p_kind = 'auto' then
    update public.profiles set auto_package_count = coalesce(auto_package_count, 0) + p_slots where id = uid;
  else
    update public.profiles set other_package_count = coalesce(other_package_count, 0) + p_slots where id = uid;
  end if;
end;
$$;

grant execute on function public.add_package_credits(text, int) to authenticated;

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
    update public.profiles
      set real_estate_package_count = real_estate_package_count - 1
      where id = uid and coalesce(real_estate_package_count, 0) > 0;
    return found;
  elsif p_category = 'auto' then
    update public.profiles
      set auto_package_count = auto_package_count - 1
      where id = uid and coalesce(auto_package_count, 0) > 0;
    return found;
  else
    update public.profiles
      set other_package_count = other_package_count - 1
      where id = uid and coalesce(other_package_count, 0) > 0;
    return found;
  end if;
end;
$$;

grant execute on function public.try_consume_listing_package(text) to authenticated;

-- allow mock-success status in payment_orders if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_orders'
  ) THEN
    BEGIN
      ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
    EXCEPTION WHEN others THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE public.payment_orders
        ADD CONSTRAINT payment_orders_status_check
        CHECK (status IN ('pending', 'confirmed', 'success', 'failed'));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;