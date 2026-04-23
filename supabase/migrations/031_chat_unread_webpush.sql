-- Robust chat membership, unread state, listing-scoped direct chats, and web push support.
-- Safe/idempotent migration for existing ENIGMA chat schema.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Chats: listing-scoped uniqueness + activity ordering
-- ---------------------------------------------------------------------------

alter table public.chats
  add column if not exists listing_id uuid references public.listings (id) on delete set null;

alter table public.chats
  add column if not exists last_message_at timestamptz not null default now();

alter table public.chats
  add column if not exists title text;

alter table public.chats
  add column if not exists is_group boolean not null default false;

-- Backfill listing/user columns if legacy schema has only user1/user2 and no members yet.
-- Keep old rows intact.

-- Deduplicate non-group direct chats by (pair, listing_id).
-- We keep the oldest chat and move messages / members into it.
do $$
declare
  rec record;
begin
  for rec in
    with ranked as (
      select
        c.id,
        c.created_at,
        c.user1,
        c.user2,
        c.listing_id,
        row_number() over (
          partition by least(c.user1, c.user2),
                       greatest(c.user1, c.user2),
                       coalesce(c.listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
          order by c.created_at asc nulls first, c.id asc
        ) as rn,
        first_value(c.id) over (
          partition by least(c.user1, c.user2),
                       greatest(c.user1, c.user2),
                       coalesce(c.listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
          order by c.created_at asc nulls first, c.id asc
        ) as keep_id
      from public.chats c
      where coalesce(c.is_group, false) = false
        and c.user1 is not null
        and c.user2 is not null
    )
    select id as duplicate_id, keep_id
    from ranked
    where rn > 1
  loop
    update public.messages
    set chat_id = rec.keep_id
    where chat_id = rec.duplicate_id;

    insert into public.chat_members (chat_id, user_id, role)
    select rec.keep_id, cm.user_id, cm.role
    from public.chat_members cm
    where cm.chat_id = rec.duplicate_id
    on conflict (chat_id, user_id) do update
      set role = excluded.role;

    delete from public.chat_members
    where chat_id = rec.duplicate_id;

    delete from public.chats
    where id = rec.duplicate_id;
  end loop;
end $$;

drop index if exists public.chats_pair_idx;
drop index if exists public.chats_direct_pair_listing_uidx;

create unique index if not exists chats_direct_pair_listing_uidx
  on public.chats (
    least(user1, user2),
    greatest(user1, user2),
    coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where coalesce(is_group, false) = false
    and user1 is not null
    and user2 is not null;

create index if not exists idx_chats_last_message_at
  on public.chats (last_message_at desc, id desc);

create index if not exists idx_chats_listing_last_message
  on public.chats (listing_id, last_message_at desc, id desc)
  where listing_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Chat members: joined/read state as source of truth for unread
-- ---------------------------------------------------------------------------

alter table public.chat_members
  add column if not exists joined_at timestamptz not null default now();

alter table public.chat_members
  add column if not exists last_read_at timestamptz;

alter table public.chat_members
  add column if not exists last_read_message_id uuid references public.messages (id) on delete set null;

update public.chat_members cm
set joined_at = coalesce(c.created_at, now())
from public.chats c
where c.id = cm.chat_id
  and cm.joined_at is null;

-- Self-heal membership for existing 1:1 chats.
insert into public.chat_members (chat_id, user_id, role)
select c.id, c.user1, 'admin'
from public.chats c
where c.user1 is not null
on conflict (chat_id, user_id) do nothing;

insert into public.chat_members (chat_id, user_id, role)
select c.id, c.user2, 'admin'
from public.chats c
where c.user2 is not null
on conflict (chat_id, user_id) do nothing;

-- Initialize read state to the latest existing message to avoid false unread on migration.
with latest as (
  select distinct on (m.chat_id)
    m.chat_id,
    m.id as message_id,
    m.created_at
  from public.messages m
  order by m.chat_id, m.created_at desc, m.id desc
)
update public.chat_members cm
set
  last_read_at = coalesce(cm.last_read_at, l.created_at, c.last_message_at, c.created_at, now()),
  last_read_message_id = coalesce(cm.last_read_message_id, l.message_id)
from public.chats c
left join latest l on l.chat_id = c.id
where c.id = cm.chat_id;

create index if not exists idx_chat_members_user_chat_read
  on public.chat_members (user_id, chat_id, last_read_at);

-- ---------------------------------------------------------------------------
-- 3) Messages maintenance: keep chats.last_message_at in sync
-- ---------------------------------------------------------------------------

create or replace function public.touch_chat_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chats
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
  where id = new.chat_id;

  return new;
end;
$$;

drop trigger if exists messages_after_insert_touch_chat on public.messages;
create trigger messages_after_insert_touch_chat
  after insert on public.messages
  for each row execute function public.touch_chat_last_message();

update public.chats c
set last_message_at = coalesce(
  (
    select max(m.created_at)
    from public.messages m
    where m.chat_id = c.id
  ),
  c.created_at,
  now()
);

create index if not exists idx_messages_chat_created_not_deleted
  on public.messages (chat_id, created_at desc, id desc)
  where coalesce(deleted, false) = false;

-- ---------------------------------------------------------------------------
-- 4) Push tokens: extend existing table for web push
-- ---------------------------------------------------------------------------

alter table public.push_tokens
  add column if not exists provider text not null default 'expo';

alter table public.push_tokens
  add column if not exists subscription jsonb;

alter table public.push_tokens
  add column if not exists user_agent text;

alter table public.push_tokens
  add column if not exists last_seen_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_tokens_provider_chk'
      and conrelid = 'public.push_tokens'::regclass
  ) then
    alter table public.push_tokens
      add constraint push_tokens_provider_chk
      check (provider in ('expo', 'webpush'));
  end if;
end $$;

update public.push_tokens
set provider = 'expo'
where provider is null;

create index if not exists idx_push_tokens_user_provider
  on public.push_tokens (user_id, provider);

create index if not exists idx_push_tokens_provider_last_seen
  on public.push_tokens (provider, last_seen_at desc);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5) Online presence: visibility + active chat for push suppression
-- ---------------------------------------------------------------------------

alter table public.online_users
  add column if not exists visibility_state text not null default 'hidden';

alter table public.online_users
  add column if not exists active_chat_id uuid references public.chats (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'online_users_visibility_state_chk'
      and conrelid = 'public.online_users'::regclass
  ) then
    alter table public.online_users
      add constraint online_users_visibility_state_chk
      check (visibility_state in ('visible', 'hidden'));
  end if;
end $$;

create index if not exists idx_online_users_visibility_last_seen
  on public.online_users (visibility_state, last_seen desc);

-- ---------------------------------------------------------------------------
-- 6) Reliable RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_direct_chat(
  p_other_user_id uuid,
  p_listing_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid()::uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_chat_id uuid;
  v_listing_owner uuid;
  v_lock_key bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_other_user_id is null then
    raise exception 'other user required';
  end if;

  if p_other_user_id = v_uid then
    raise exception 'cannot create chat with self';
  end if;

  if p_listing_id is not null then
    select l.user_id
    into v_listing_owner
    from public.listings l
    where l.id = p_listing_id;

    if v_listing_owner is null then
      raise exception 'listing not found';
    end if;

    if v_listing_owner <> p_other_user_id then
      raise exception 'listing owner mismatch';
    end if;
  end if;

  v_user1 := least(v_uid, p_other_user_id);
  v_user2 := greatest(v_uid, p_other_user_id);

  v_lock_key := hashtextextended(
    'direct-chat:' || v_user1::text || ':' || v_user2::text || ':' || coalesce(p_listing_id::text, 'null'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select c.id
  into v_chat_id
  from public.chats c
  where coalesce(c.is_group, false) = false
    and least(c.user1, c.user2) = v_user1
    and greatest(c.user1, c.user2) = v_user2
    and coalesce(c.listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by c.created_at asc nulls first, c.id asc
  limit 1;

  if v_chat_id is null then
    insert into public.chats (user1, user2, listing_id, is_group, created_at, last_message_at)
    values (v_user1, v_user2, p_listing_id, false, now(), now())
    returning id into v_chat_id;
  end if;

  insert into public.chat_members (chat_id, user_id, role)
  values
    (v_chat_id, v_user1, 'admin'),
    (v_chat_id, v_user2, 'admin')
  on conflict (chat_id, user_id) do update
    set role = excluded.role;

  return v_chat_id;
end;
$$;

grant execute on function public.get_or_create_direct_chat(uuid, uuid) to authenticated;

create or replace function public.mark_chat_read(
  p_chat_id uuid,
  p_up_to_message_id uuid default null
)
returns table (
  chat_id uuid,
  last_read_at timestamptz,
  last_read_message_id uuid,
  unread_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid()::uuid;
  v_cutoff_at timestamptz;
  v_cutoff_message_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.chat_members cm
    where cm.chat_id = p_chat_id
      and cm.user_id = v_uid
  ) then
    raise exception 'chat membership required';
  end if;

  if p_up_to_message_id is not null then
    select m.created_at, m.id
    into v_cutoff_at, v_cutoff_message_id
    from public.messages m
    where m.id = p_up_to_message_id
      and m.chat_id = p_chat_id
    limit 1;
  else
    select m.created_at, m.id
    into v_cutoff_at, v_cutoff_message_id
    from public.messages m
    where m.chat_id = p_chat_id
      and not coalesce(m.deleted, false)
      and not (v_uid = any(coalesce(m.hidden_for_user_ids, '{}'::uuid[])))
    order by m.created_at desc, m.id desc
    limit 1;
  end if;

  if v_cutoff_at is null then
    v_cutoff_at := now();
    v_cutoff_message_id := null;
  end if;

  update public.chat_members cm
  set
    last_read_at = case
      when cm.last_read_at is null then v_cutoff_at
      else greatest(cm.last_read_at, v_cutoff_at)
    end,
    last_read_message_id = case
      when cm.last_read_at is null then v_cutoff_message_id
      when v_cutoff_at >= cm.last_read_at then coalesce(v_cutoff_message_id, cm.last_read_message_id)
      else cm.last_read_message_id
    end
  where cm.chat_id = p_chat_id
    and cm.user_id = v_uid;

  -- Compatibility for legacy "seen" UI.
  update public.messages m
  set status = 'seen'
  where m.chat_id = p_chat_id
    and m.sender_id <> v_uid
    and m.created_at <= v_cutoff_at
    and coalesce(m.status, 'sent') <> 'seen';

  return query
  select
    cm.chat_id,
    cm.last_read_at,
    cm.last_read_message_id,
    (
      select count(*)::bigint
      from public.messages m
      where m.chat_id = cm.chat_id
        and m.sender_id <> v_uid
        and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
        and not coalesce(m.deleted, false)
        and not (v_uid = any(coalesce(m.hidden_for_user_ids, '{}'::uuid[])))
    ) as unread_count
  from public.chat_members cm
  where cm.chat_id = p_chat_id
    and cm.user_id = v_uid;
end;
$$;

grant execute on function public.mark_chat_read(uuid, uuid) to authenticated;

create or replace function public.list_my_chats(
  p_limit int default 100,
  p_before timestamptz default null
)
returns table (
  chat_id uuid,
  listing_id uuid,
  is_group boolean,
  title text,
  other_user_id uuid,
  other_name text,
  other_avatar text,
  last_message_id uuid,
  last_message_text text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  last_message_deleted boolean,
  last_message_image_url text,
  last_message_voice_url text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select auth.uid()::uuid as uid
  ),
  my_membership as (
    select cm.*
    from public.chat_members cm
    join me on me.uid = cm.user_id
  ),
  base as (
    select
      c.id as chat_id,
      c.listing_id,
      coalesce(c.is_group, false) as is_group,
      c.title,
      c.last_message_at,
      mm.last_read_at
    from public.chats c
    join my_membership mm on mm.chat_id = c.id
    where p_before is null or c.last_message_at < p_before
    order by c.last_message_at desc, c.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ),
  others as (
    select
      b.chat_id,
      cm.user_id as other_user_id
    from base b
    left join public.chat_members cm
      on cm.chat_id = b.chat_id
     and cm.user_id <> (select uid from me)
    where b.is_group = false
  ),
  other_profile as (
    select
      o.chat_id,
      o.other_user_id,
      coalesce(p.name, u.name, 'Пользователь') as other_name,
      coalesce(p.avatar, u.avatar) as other_avatar
    from others o
    left join public.profiles p on p.id = o.other_user_id
    left join public.users u on u.id = o.other_user_id
  )
  select
    b.chat_id,
    b.listing_id,
    b.is_group,
    b.title,
    op.other_user_id,
    op.other_name,
    op.other_avatar,
    lm.id as last_message_id,
    lm.text as last_message_text,
    lm.created_at as last_message_created_at,
    lm.sender_id as last_message_sender_id,
    coalesce(lm.deleted, false) as last_message_deleted,
    lm.image_url as last_message_image_url,
    lm.voice_url as last_message_voice_url,
    b.last_message_at,
    coalesce((
      select count(*)::bigint
      from public.messages m
      where m.chat_id = b.chat_id
        and m.sender_id <> (select uid from me)
        and m.created_at > coalesce(b.last_read_at, '-infinity'::timestamptz)
        and not coalesce(m.deleted, false)
        and not ((select uid from me) = any(coalesce(m.hidden_for_user_ids, '{}'::uuid[])))
    ), 0) as unread_count
  from base b
  left join lateral (
    select
      m.id,
      m.text,
      m.created_at,
      m.sender_id,
      coalesce(m.deleted, false) as deleted,
      m.image_url,
      m.voice_url
    from public.messages m
    where m.chat_id = b.chat_id
      and not ((select uid from me) = any(coalesce(m.hidden_for_user_ids, '{}'::uuid[])))
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join other_profile op on op.chat_id = b.chat_id
  order by b.last_message_at desc, b.chat_id desc;
$$;

grant execute on function public.list_my_chats(int, timestamptz) to authenticated;

create or replace function public.ensure_dm_chat_membership(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid()::uuid;
  c record;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select id, user1, user2, coalesce(is_group, false) as is_group
  into c
  from public.chats
  where id = p_chat_id;

  if not found then
    raise exception 'chat not found';
  end if;

  if c.is_group then
    return;
  end if;

  if c.user1 is not null and c.user2 is not null and (uid = c.user1 or uid = c.user2) then
    insert into public.chat_members (chat_id, user_id, role)
    values
      (p_chat_id, c.user1, 'admin'),
      (p_chat_id, c.user2, 'admin')
    on conflict (chat_id, user_id) do nothing;
  end if;
end;
$$;

grant execute on function public.ensure_dm_chat_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Realtime publications for unread/chat sync
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_members'
  ) then
    alter publication supabase_realtime add table public.chat_members;
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'online_users'
  ) then
    alter publication supabase_realtime add table public.online_users;
  end if;
exception
  when duplicate_object then null;
end $$;

commit;
