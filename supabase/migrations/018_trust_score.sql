-- Trust score + anti-scam RPCs (self penalties + report penalty + auto-ban).

alter table public.profiles add column if not exists trust_score int not null default 100;

-- One report per user per listing (idempotent penalty).
delete from public.reports a
using public.reports b
where a.id > b.id
  and a.reporter_id = b.reporter_id
  and a.listing_id = b.listing_id;

create unique index if not exists idx_reports_reporter_listing
  on public.reports (reporter_id, listing_id);

create or replace function public.auto_ban_if_needed(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.profiles%rowtype;
begin
  select * into u from public.profiles where id = p_user;
  if not found then
    return;
  end if;
  if coalesce(u.trust_score, 100) > 0 then
    return;
  end if;
  if exists (
    select 1 from public.banned_users b
    where (u.email is not null and b.email is not null and lower(trim(b.email)) = lower(trim(u.email)))
       or (u.phone is not null and b.phone is not null and trim(b.phone) = trim(u.phone))
       or (u.device_id is not null and b.device_id is not null and b.device_id = u.device_id)
  ) then
    return;
  end if;
  insert into public.banned_users (email, phone, device_id)
  values (u.email, u.phone, u.device_id);
end;
$$;

-- Self only: rapid spam, duplicate content, phone collision, device abuse.
create or replace function public.decrease_trust_score(p_user uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user then
    raise exception 'decrease_trust_score: only for own profile' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    return;
  end if;
  update public.profiles
  set trust_score = greatest(0, coalesce(trust_score, 100) - p_amount)
  where id = p_user;
  perform public.auto_ban_if_needed(p_user);
end;
$$;

-- Report listing owner: insert report (once) + -20 trust + auto-ban owner.
create or replace function public.report_listing_trust_penalty(p_listing uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  me uuid := auth.uid();
  new_id uuid;
  r text := coalesce(nullif(trim(p_reason), ''), 'spam');
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select l.user_id into owner_id from public.listings l where l.id = p_listing;
  if owner_id is null then
    raise exception 'listing not found' using errcode = 'P0001';
  end if;
  if owner_id = me then
    raise exception 'cannot report own listing' using errcode = '42501';
  end if;

  insert into public.reports (listing_id, reporter_id, reason)
  values (p_listing, me, r)
  on conflict (reporter_id, listing_id) do nothing
  returning id into new_id;

  if new_id is null then
    return;
  end if;

  update public.profiles
  set trust_score = greatest(0, coalesce(trust_score, 100) - 20)
  where id = owner_id;
  perform public.auto_ban_if_needed(owner_id);
end;
$$;

grant execute on function public.decrease_trust_score(uuid, int) to authenticated;
grant execute on function public.report_listing_trust_penalty(uuid, text) to authenticated;

revoke all on function public.auto_ban_if_needed(uuid) from public;
