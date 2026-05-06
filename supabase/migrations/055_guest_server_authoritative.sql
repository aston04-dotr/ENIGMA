-- Server-authoritative guest-first messaging layer.
-- Goals:
-- 1) transactional merge guest -> authenticated account
-- 2) duplicate guest identity protection
-- 3) server-side anti-abuse limits
-- 4) strict RLS/no direct table writes from clients

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Identity dedup and aliasing
-- ---------------------------------------------------------------------------

create table if not exists public.guest_identity_aliases (
  alias_guest_uuid text primary key,
  canonical_guest_uuid text not null references public.guest_identities (guest_uuid) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_identity_aliases_canonical
  on public.guest_identity_aliases (canonical_guest_uuid);

-- ---------------------------------------------------------------------------
-- 2) Server-side guest chat state (authoritative pre-auth state)
-- ---------------------------------------------------------------------------

create table if not exists public.guest_preauth_chats (
  id uuid primary key default gen_random_uuid(),
  guest_uuid text not null references public.guest_identities (guest_uuid) on delete cascade,
  peer_user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_read_at timestamptz,
  merged_to_chat_id uuid references public.chats (id) on delete set null,
  status text not null default 'active',
  constraint guest_preauth_chats_status_chk check (status in ('active', 'merged', 'archived'))
);

create unique index if not exists guest_preauth_chat_unique_active
  on public.guest_preauth_chats (
    guest_uuid,
    peer_user_id,
    coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

create index if not exists idx_guest_preauth_chats_guest_last_message
  on public.guest_preauth_chats (guest_uuid, last_message_at desc);

create table if not exists public.guest_preauth_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.guest_preauth_chats (id) on delete cascade,
  guest_uuid text not null references public.guest_identities (guest_uuid) on delete cascade,
  sender_role text not null default 'guest',
  text text not null default '',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  pending boolean not null default false,
  merged_to_message_id uuid references public.messages (id) on delete set null,
  merge_batch_id uuid,
  fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  constraint guest_preauth_messages_sender_role_chk check (sender_role in ('guest', 'peer'))
);

create index if not exists idx_guest_preauth_messages_chat_created
  on public.guest_preauth_messages (chat_id, created_at asc, id asc);

create index if not exists idx_guest_preauth_messages_guest_created
  on public.guest_preauth_messages (guest_uuid, created_at desc);

create table if not exists public.guest_drafts (
  guest_uuid text primary key references public.guest_identities (guest_uuid) on delete cascade,
  title text,
  description text,
  price numeric,
  city text,
  category text,
  updated_at timestamptz not null default now(),
  merged_at timestamptz,
  merged_user_id uuid references auth.users (id) on delete set null
);

create table if not exists public.guest_merge_audit (
  id uuid primary key default gen_random_uuid(),
  guest_uuid text not null references public.guest_identities (guest_uuid) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  merged_chats integer not null default 0,
  merged_messages integer not null default 0,
  merged_drafts integer not null default 0,
  merged_pending integer not null default 0,
  merged_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_guest_merge_audit_guest_user
  on public.guest_merge_audit (guest_uuid, user_id, merged_at desc);

-- ---------------------------------------------------------------------------
-- 3) Hard RLS posture: no direct table access
-- ---------------------------------------------------------------------------

alter table public.guest_identity_aliases enable row level security;
alter table public.guest_preauth_chats enable row level security;
alter table public.guest_preauth_messages enable row level security;
alter table public.guest_drafts enable row level security;
alter table public.guest_merge_audit enable row level security;

drop policy if exists "deny_guest_identity_aliases_select" on public.guest_identity_aliases;
create policy "deny_guest_identity_aliases_select"
on public.guest_identity_aliases
for select
using (false);

drop policy if exists "deny_guest_identity_aliases_insert" on public.guest_identity_aliases;
create policy "deny_guest_identity_aliases_insert"
on public.guest_identity_aliases
for insert
with check (false);

drop policy if exists "deny_guest_identity_aliases_update" on public.guest_identity_aliases;
create policy "deny_guest_identity_aliases_update"
on public.guest_identity_aliases
for update
using (false)
with check (false);

drop policy if exists "deny_guest_identity_aliases_delete" on public.guest_identity_aliases;
create policy "deny_guest_identity_aliases_delete"
on public.guest_identity_aliases
for delete
using (false);

drop policy if exists "deny_guest_preauth_chats_select" on public.guest_preauth_chats;
create policy "deny_guest_preauth_chats_select"
on public.guest_preauth_chats
for select
using (false);

drop policy if exists "deny_guest_preauth_chats_insert" on public.guest_preauth_chats;
create policy "deny_guest_preauth_chats_insert"
on public.guest_preauth_chats
for insert
with check (false);

drop policy if exists "deny_guest_preauth_chats_update" on public.guest_preauth_chats;
create policy "deny_guest_preauth_chats_update"
on public.guest_preauth_chats
for update
using (false)
with check (false);

drop policy if exists "deny_guest_preauth_chats_delete" on public.guest_preauth_chats;
create policy "deny_guest_preauth_chats_delete"
on public.guest_preauth_chats
for delete
using (false);

drop policy if exists "deny_guest_preauth_messages_select" on public.guest_preauth_messages;
create policy "deny_guest_preauth_messages_select"
on public.guest_preauth_messages
for select
using (false);

drop policy if exists "deny_guest_preauth_messages_insert" on public.guest_preauth_messages;
create policy "deny_guest_preauth_messages_insert"
on public.guest_preauth_messages
for insert
with check (false);

drop policy if exists "deny_guest_preauth_messages_update" on public.guest_preauth_messages;
create policy "deny_guest_preauth_messages_update"
on public.guest_preauth_messages
for update
using (false)
with check (false);

drop policy if exists "deny_guest_preauth_messages_delete" on public.guest_preauth_messages;
create policy "deny_guest_preauth_messages_delete"
on public.guest_preauth_messages
for delete
using (false);

drop policy if exists "deny_guest_drafts_select" on public.guest_drafts;
create policy "deny_guest_drafts_select"
on public.guest_drafts
for select
using (false);

drop policy if exists "deny_guest_drafts_insert" on public.guest_drafts;
create policy "deny_guest_drafts_insert"
on public.guest_drafts
for insert
with check (false);

drop policy if exists "deny_guest_drafts_update" on public.guest_drafts;
create policy "deny_guest_drafts_update"
on public.guest_drafts
for update
using (false)
with check (false);

drop policy if exists "deny_guest_drafts_delete" on public.guest_drafts;
create policy "deny_guest_drafts_delete"
on public.guest_drafts
for delete
using (false);

drop policy if exists "deny_guest_merge_audit_select" on public.guest_merge_audit;
create policy "deny_guest_merge_audit_select"
on public.guest_merge_audit
for select
using (false);

drop policy if exists "deny_guest_merge_audit_insert" on public.guest_merge_audit;
create policy "deny_guest_merge_audit_insert"
on public.guest_merge_audit
for insert
with check (false);

drop policy if exists "deny_guest_merge_audit_update" on public.guest_merge_audit;
create policy "deny_guest_merge_audit_update"
on public.guest_merge_audit
for update
using (false)
with check (false);

drop policy if exists "deny_guest_merge_audit_delete" on public.guest_merge_audit;
create policy "deny_guest_merge_audit_delete"
on public.guest_merge_audit
for delete
using (false);

revoke all on public.guest_identity_aliases from anon, authenticated;
revoke all on public.guest_preauth_chats from anon, authenticated;
revoke all on public.guest_preauth_messages from anon, authenticated;
revoke all on public.guest_drafts from anon, authenticated;
revoke all on public.guest_merge_audit from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Core helpers: canonical guest identity + anti-dup
-- ---------------------------------------------------------------------------

create or replace function public.resolve_guest_uuid(
  p_guest_uuid text,
  p_fingerprint text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text := trim(coalesce(p_guest_uuid, ''));
  v_fingerprint text := nullif(trim(coalesce(p_fingerprint, '')), '');
  v_canonical text;
  v_lock_key bigint;
begin
  if v_guest = '' then
    raise exception 'guest_uuid required';
  end if;

  v_lock_key := hashtextextended('resolve-guest:' || coalesce(v_fingerprint, v_guest), 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select a.canonical_guest_uuid
  into v_canonical
  from public.guest_identity_aliases a
  where a.alias_guest_uuid = v_guest
  limit 1;

  if v_canonical is not null then
    update public.guest_identities gi
    set
      last_seen_at = now(),
      fingerprint = coalesce(v_fingerprint, gi.fingerprint)
    where gi.guest_uuid = v_canonical;
    return v_canonical;
  end if;

  if v_fingerprint is not null then
    select gi.guest_uuid
    into v_canonical
    from public.guest_identities gi
    where gi.fingerprint = v_fingerprint
      and gi.linked_user_id is null
      and gi.last_seen_at > now() - interval '14 days'
    order by gi.last_seen_at desc
    limit 1;
  end if;

  if v_canonical is null then
    v_canonical := v_guest;
    insert into public.guest_identities (guest_uuid, fingerprint, last_seen_at)
    values (v_canonical, v_fingerprint, now())
    on conflict (guest_uuid) do update
      set fingerprint = coalesce(excluded.fingerprint, guest_identities.fingerprint),
          last_seen_at = now();
  end if;

  if v_guest <> v_canonical then
    insert into public.guest_identity_aliases (alias_guest_uuid, canonical_guest_uuid)
    values (v_guest, v_canonical)
    on conflict (alias_guest_uuid) do update
      set canonical_guest_uuid = excluded.canonical_guest_uuid;
  end if;

  update public.guest_identities gi
  set
    last_seen_at = now(),
    fingerprint = coalesce(v_fingerprint, gi.fingerprint)
  where gi.guest_uuid = v_canonical;

  return v_canonical;
end;
$$;

grant execute on function public.resolve_guest_uuid(text, text) to anon, authenticated;

drop function if exists public.register_guest_presence(text, text);

create or replace function public.register_guest_presence(
  p_guest_uuid text,
  p_fingerprint text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
begin
  v_canonical := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);
  return v_canonical;
end;
$$;

grant execute on function public.register_guest_presence(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Server-side anti-abuse gate
-- ---------------------------------------------------------------------------

create or replace function public.enforce_guest_message_guard(
  p_guest_uuid text,
  p_chat_id uuid,
  p_fingerprint text,
  p_text text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text;
  v_count_10s integer;
  v_count_60s integer;
  v_dup_30s integer;
  v_fp_guests_24h integer;
  v_normalized_text text := left(trim(coalesce(p_text, '')), 4000);
begin
  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);

  if v_normalized_text = '' then
    raise exception 'empty message';
  end if;

  select count(*)::int
  into v_count_10s
  from public.guest_preauth_messages gm
  where gm.guest_uuid = v_guest
    and gm.created_at > now() - interval '10 seconds';

  select count(*)::int
  into v_count_60s
  from public.guest_preauth_messages gm
  where gm.guest_uuid = v_guest
    and gm.created_at > now() - interval '60 seconds';

  select count(*)::int
  into v_dup_30s
  from public.guest_preauth_messages gm
  where gm.guest_uuid = v_guest
    and gm.created_at > now() - interval '30 seconds'
    and md5(coalesce(gm.text, '')) = md5(v_normalized_text);

  if nullif(trim(coalesce(p_fingerprint, '')), '') is not null then
    select count(distinct gi.guest_uuid)::int
    into v_fp_guests_24h
    from public.guest_identities gi
    where gi.fingerprint = nullif(trim(p_fingerprint), '')
      and gi.last_seen_at > now() - interval '24 hours';
  else
    v_fp_guests_24h := 0;
  end if;

  if v_count_10s >= 7 or v_count_60s >= 20 or v_dup_30s >= 3 or v_fp_guests_24h >= 6 then
    insert into public.guest_message_events (guest_uuid, chat_id, event_type, fingerprint, details)
    values (
      v_guest,
      p_chat_id,
      'blocked_rate_limit',
      nullif(trim(coalesce(p_fingerprint, '')), ''),
      jsonb_build_object(
        'count_10s', v_count_10s,
        'count_60s', v_count_60s,
        'dup_30s', v_dup_30s,
        'fp_guests_24h', v_fp_guests_24h
      )
    );
    raise exception 'guest_rate_limited';
  end if;

  return v_guest;
end;
$$;

grant execute on function public.enforce_guest_message_guard(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Authoritative guest write RPCs (chat + draft + read)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_guest_message(
  p_guest_uuid text,
  p_peer_user_id uuid,
  p_text text,
  p_listing_id uuid default null,
  p_fingerprint text default null,
  p_created_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text;
  v_chat_id uuid;
  v_message_id uuid;
  v_lock_key bigint;
  v_text text := left(trim(coalesce(p_text, '')), 4000);
begin
  if p_peer_user_id is null then
    raise exception 'peer user required';
  end if;

  v_lock_key := hashtextextended(
    'guest-chat:' || trim(coalesce(p_guest_uuid, '')) || ':' || p_peer_user_id::text || ':' || coalesce(p_listing_id::text, 'null'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);
  v_guest := public.enforce_guest_message_guard(v_guest, null, p_fingerprint, v_text);

  insert into public.guest_preauth_chats (
    guest_uuid,
    peer_user_id,
    listing_id,
    created_at,
    last_message_at,
    status
  )
  values (
    v_guest,
    p_peer_user_id,
    p_listing_id,
    coalesce(p_created_at, now()),
    coalesce(p_created_at, now()),
    'active'
  )
  on conflict (
    guest_uuid,
    peer_user_id,
    coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active'
  do update set last_message_at = greatest(guest_preauth_chats.last_message_at, excluded.last_message_at)
  returning id into v_chat_id;

  insert into public.guest_preauth_messages (
    chat_id,
    guest_uuid,
    sender_role,
    text,
    created_at,
    pending,
    fingerprint
  )
  values (
    v_chat_id,
    v_guest,
    'guest',
    v_text,
    coalesce(p_created_at, now()),
    false,
    nullif(trim(coalesce(p_fingerprint, '')), '')
  )
  returning id into v_message_id;

  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'guest_chat_id', v_chat_id,
    'guest_message_id', v_message_id
  );
end;
$$;

grant execute on function public.enqueue_guest_message(text, uuid, text, uuid, text, timestamptz) to anon, authenticated;

create or replace function public.mark_guest_chat_read(
  p_guest_uuid text,
  p_guest_chat_id uuid,
  p_fingerprint text default null,
  p_up_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text;
  v_cutoff timestamptz;
begin
  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);

  if not exists (
    select 1
    from public.guest_preauth_chats gc
    where gc.id = p_guest_chat_id
      and gc.guest_uuid = v_guest
      and gc.status = 'active'
  ) then
    raise exception 'guest chat not found';
  end if;

  if p_up_to_message_id is not null then
    select gm.created_at
    into v_cutoff
    from public.guest_preauth_messages gm
    where gm.id = p_up_to_message_id
      and gm.chat_id = p_guest_chat_id
    limit 1;
  else
    select gm.created_at
    into v_cutoff
    from public.guest_preauth_messages gm
    where gm.chat_id = p_guest_chat_id
    order by gm.created_at desc, gm.id desc
    limit 1;
  end if;

  v_cutoff := coalesce(v_cutoff, now());

  update public.guest_preauth_chats gc
  set last_read_at = greatest(coalesce(gc.last_read_at, '-infinity'::timestamptz), v_cutoff)
  where gc.id = p_guest_chat_id
    and gc.guest_uuid = v_guest
    and gc.status = 'active';

  update public.guest_preauth_messages gm
  set read_at = coalesce(gm.read_at, now())
  where gm.chat_id = p_guest_chat_id
    and gm.sender_role = 'peer'
    and gm.created_at <= v_cutoff
    and gm.read_at is null;

  return jsonb_build_object('ok', true, 'guest_uuid', v_guest, 'chat_id', p_guest_chat_id);
end;
$$;

grant execute on function public.mark_guest_chat_read(text, uuid, text, uuid) to anon, authenticated;

create or replace function public.upsert_guest_draft(
  p_guest_uuid text,
  p_fingerprint text default null,
  p_title text default null,
  p_description text default null,
  p_price numeric default null,
  p_city text default null,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest text;
begin
  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);

  insert into public.guest_drafts (
    guest_uuid,
    title,
    description,
    price,
    city,
    category,
    updated_at
  )
  values (
    v_guest,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    p_price,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    now()
  )
  on conflict (guest_uuid)
  do update set
    title = excluded.title,
    description = excluded.description,
    price = excluded.price,
    city = excluded.city,
    category = excluded.category,
    updated_at = now();

  return jsonb_build_object('ok', true, 'guest_uuid', v_guest);
end;
$$;

grant execute on function public.upsert_guest_draft(text, text, text, text, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Transactional authoritative merge
-- ---------------------------------------------------------------------------

create or replace function public.merge_guest_state_authoritative(
  p_guest_uuid text,
  p_guest_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guest text;
  v_lock_guest bigint;
  v_lock_user bigint;
  v_merge_batch uuid := gen_random_uuid();
  v_merged_chats integer := 0;
  v_merged_messages integer := 0;
  v_merged_drafts integer := 0;
  v_merged_pending integer := 0;
  v_target_chat uuid;
  v_inserted_msg uuid;
  v_chat_row record;
  v_message_row record;
  v_draft_row record;
  v_linked_user uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_guest_fingerprint);

  v_lock_guest := hashtextextended('guest-merge:' || v_guest, 0);
  v_lock_user := hashtextextended('guest-merge-user:' || v_uid::text, 0);
  perform pg_advisory_xact_lock(v_lock_guest);
  perform pg_advisory_xact_lock(v_lock_user);

  select gi.linked_user_id
  into v_linked_user
  from public.guest_identities gi
  where gi.guest_uuid = v_guest
  limit 1;

  if v_linked_user is not null and v_linked_user <> v_uid then
    raise exception 'guest identity already linked to another account';
  end if;

  update public.guest_identities gi
  set
    linked_user_id = v_uid,
    upgraded_at = coalesce(gi.upgraded_at, now()),
    last_seen_at = now(),
    fingerprint = coalesce(nullif(trim(coalesce(p_guest_fingerprint, '')), ''), gi.fingerprint)
  where gi.guest_uuid = v_guest;

  for v_chat_row in
    select gc.*
    from public.guest_preauth_chats gc
    where gc.guest_uuid = v_guest
      and gc.status = 'active'
    order by gc.created_at asc, gc.id asc
  loop
    select public.get_or_create_direct_chat(v_chat_row.peer_user_id, v_chat_row.listing_id)
    into v_target_chat;

    if v_target_chat is null then
      continue;
    end if;

    for v_message_row in
      select gm.*
      from public.guest_preauth_messages gm
      where gm.chat_id = v_chat_row.id
        and gm.sender_role = 'guest'
        and gm.merged_to_message_id is null
      order by gm.created_at asc, gm.id asc
    loop
      insert into public.messages (
        chat_id,
        sender_id,
        text,
        type,
        created_at,
        deleted,
        hidden_for_user_ids,
        delivered_at,
        read_at
      )
      values (
        v_target_chat,
        v_uid,
        left(coalesce(v_message_row.text, ''), 4000),
        'text',
        coalesce(v_message_row.created_at, now()),
        false,
        '{}'::uuid[],
        v_message_row.delivered_at,
        v_message_row.read_at
      )
      returning id into v_inserted_msg;

      update public.guest_preauth_messages gm
      set
        merged_to_message_id = v_inserted_msg,
        merge_batch_id = v_merge_batch,
        pending = false
      where gm.id = v_message_row.id;

      v_merged_messages := v_merged_messages + 1;
      if coalesce(v_message_row.pending, false) then
        v_merged_pending := v_merged_pending + 1;
      end if;
    end loop;

    if v_chat_row.last_read_at is not null then
      update public.chats c
      set
        buyer_last_read_at = case
          when c.buyer_id = v_uid then greatest(coalesce(c.buyer_last_read_at, '-infinity'::timestamptz), v_chat_row.last_read_at)
          else c.buyer_last_read_at
        end,
        seller_last_read_at = case
          when c.seller_id = v_uid then greatest(coalesce(c.seller_last_read_at, '-infinity'::timestamptz), v_chat_row.last_read_at)
          else c.seller_last_read_at
        end
      where c.id = v_target_chat;
    end if;

    update public.guest_preauth_chats gc
    set
      merged_to_chat_id = v_target_chat,
      status = 'merged'
    where gc.id = v_chat_row.id;

    v_merged_chats := v_merged_chats + 1;
  end loop;

  select gd.*
  into v_draft_row
  from public.guest_drafts gd
  where gd.guest_uuid = v_guest
  limit 1;

  if found then
    insert into public.drafts (
      user_id,
      title,
      description,
      price,
      city,
      category,
      updated_at
    )
    values (
      v_uid,
      v_draft_row.title,
      v_draft_row.description,
      v_draft_row.price,
      v_draft_row.city,
      v_draft_row.category,
      coalesce(v_draft_row.updated_at, now())
    )
    on conflict (user_id) do update
      set
        title = coalesce(excluded.title, drafts.title),
        description = coalesce(excluded.description, drafts.description),
        price = coalesce(excluded.price, drafts.price),
        city = coalesce(excluded.city, drafts.city),
        category = coalesce(excluded.category, drafts.category),
        updated_at = greatest(coalesce(drafts.updated_at, '-infinity'::timestamptz), coalesce(excluded.updated_at, now()));

    update public.guest_drafts gd
    set
      merged_at = now(),
      merged_user_id = v_uid
    where gd.guest_uuid = v_guest;

    v_merged_drafts := 1;
  end if;

  insert into public.guest_merge_audit (
    guest_uuid,
    user_id,
    merged_chats,
    merged_messages,
    merged_drafts,
    merged_pending,
    details
  )
  values (
    v_guest,
    v_uid,
    v_merged_chats,
    v_merged_messages,
    v_merged_drafts,
    v_merged_pending,
    jsonb_build_object('merge_batch_id', v_merge_batch)
  );

  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'linked_user_id', v_uid,
    'merged_chats', v_merged_chats,
    'merged_messages', v_merged_messages,
    'merged_drafts', v_merged_drafts,
    'merged_pending', v_merged_pending,
    'merge_batch_id', v_merge_batch
  );
end;
$$;

grant execute on function public.merge_guest_state_authoritative(text, text) to authenticated;

commit;
