-- Срок публикации объявлений: expires_at, статус active/expired, напоминания.

begin;

alter table public.listings
  add column if not exists expires_at timestamptz;

alter table public.listings
  add column if not exists status text not null default 'active';

alter table public.listings
  add column if not exists expiry_reminder_sent_at timestamptz;

alter table public.listings
  add column if not exists expiry_archive_notice_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public' and t.relname = 'listings' and c.conname = 'listings_status_check'
  ) then
    alter table public.listings
      add constraint listings_status_check check (status in ('active', 'expired'));
  end if;
end $$;

comment on column public.listings.expires_at is 'Дата окончания публикации (UTC).';
comment on column public.listings.status is 'active — в ленте; expired — архив.';
comment on column public.listings.expiry_reminder_sent_at is 'Когда отправлено напоминание за 3 дня.';
comment on column public.listings.expiry_archive_notice_sent_at is 'Когда отправлено уведомление об архиве.';

-- Текущие объявления: +30 дней от создания
update public.listings
set expires_at = coalesce(created_at, now()) + interval '30 days'
where expires_at is null;

alter table public.listings
  alter column expires_at set default (now() + interval '30 days');

alter table public.listings
  alter column expires_at set not null;

create index if not exists idx_listings_status_expires
  on public.listings (status, expires_at asc);

-- Уведомления владельцу (отображаются в «Чатах» на клиенте)
create table if not exists public.listing_owner_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  kind text not null check (kind in ('expiry_reminder_3d', 'expiry_archived')),
  body text not null,
  created_at timestamptz not null default now(),
  unique (listing_id, kind)
);

create index if not exists idx_listing_owner_notices_user_created
  on public.listing_owner_notices (user_id, created_at desc);

alter table public.listing_owner_notices enable row level security;

drop policy if exists "listing_owner_notices_select_own" on public.listing_owner_notices;
create policy "listing_owner_notices_select_own"
on public.listing_owner_notices for select to authenticated
using (user_id = auth.uid());

comment on table public.listing_owner_notices is 'Системные уведомления по объявлениям (лента в разделе Чаты).';

-- Продление объявления из архива (владелец)
create or replace function public.renew_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.listings
  set
    status = 'active',
    expires_at = now() + interval '30 days',
    expiry_reminder_sent_at = null,
    expiry_archive_notice_sent_at = null,
    updated_at = now()
  where id = p_listing_id
    and user_id = auth.uid()
    and status = 'expired';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'renew_not_allowed_or_not_found';
  end if;
end;
$$;

grant execute on function public.renew_listing(uuid) to authenticated;

-- Единая задача: напоминания, перевод в архив, тексты уведомлений
create or replace function public.run_listing_expiry_jobs()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n_rem int := 0;
  n_arch int := 0;
begin
  -- Напоминание за 3 дня (флаг один раз на объявление)
  with cand as (
    select id, user_id, title
    from public.listings
    where status = 'active'
      and expires_at > now()
      and expires_at <= now() + interval '3 days'
      and expiry_reminder_sent_at is null
  ),
  ins as (
    insert into public.listing_owner_notices (user_id, listing_id, kind, body)
    select
      c.user_id,
      c.id,
      'expiry_reminder_3d',
      format(
        'Срок публикации объявления «%s» истекает через 3 дня. Продлите его, чтобы не потерять просмотры',
        left(trim(coalesce(c.title, '')), 200)
      )
    from cand c
    on conflict (listing_id, kind) do nothing
    returning listing_id
  ),
  marked as (
    update public.listings l
    set expiry_reminder_sent_at = now()
    from cand c
    where l.id = c.id
    returning l.id
  )
  select count(*)::int into n_rem from marked;

  -- Истечение срока → архив + уведомление
  with exp as (
    update public.listings
    set
      status = 'expired',
      updated_at = now()
    where status = 'active'
      and expires_at <= now()
    returning id, user_id
  ),
  ins2 as (
    insert into public.listing_owner_notices (user_id, listing_id, kind, body)
    select
      e.user_id,
      e.id,
      'expiry_archived',
      'Ваше объявление перемещено в архив. Для повторной публикации перейдите в профиль.'
    from exp e
    on conflict (listing_id, kind) do nothing
    returning listing_id
  ),
  marked2 as (
    update public.listings l
    set expiry_archive_notice_sent_at = coalesce(l.expiry_archive_notice_sent_at, now())
    from exp e
    where l.id = e.id
    returning l.id
  )
  select count(*)::int into n_arch from marked2;

  return json_build_object('reminders_marked', n_rem, 'archive_rows', n_arch);
end;
$$;

revoke all on function public.run_listing_expiry_jobs() from public;
grant execute on function public.run_listing_expiry_jobs() to service_role;

commit;
