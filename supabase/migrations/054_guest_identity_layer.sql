-- Guest-first foundation: persistent guest identity, basic trust hooks,
-- and a merge endpoint for guest -> authenticated upgrades.

create table if not exists public.guest_identities (
  guest_uuid text primary key,
  fingerprint text,
  linked_user_id uuid references public.profiles (id) on delete set null,
  trust_score integer not null default 100,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  upgraded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_guest_identities_linked_user
  on public.guest_identities (linked_user_id)
  where linked_user_id is not null;

create index if not exists idx_guest_identities_last_seen
  on public.guest_identities (last_seen_at desc);

create table if not exists public.guest_message_events (
  id bigserial primary key,
  guest_uuid text not null references public.guest_identities (guest_uuid) on delete cascade,
  chat_id uuid,
  event_type text not null,
  fingerprint text,
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_guest_message_events_guest_created
  on public.guest_message_events (guest_uuid, created_at desc);

alter table public.guest_identities enable row level security;
alter table public.guest_message_events enable row level security;

drop policy if exists "Guest identities are owner-readable" on public.guest_identities;
create policy "Guest identities are owner-readable"
on public.guest_identities
for select
using (linked_user_id = auth.uid());

drop policy if exists "Guest message events are owner-readable" on public.guest_message_events;
create policy "Guest message events are owner-readable"
on public.guest_message_events
for select
using (
  exists (
    select 1
    from public.guest_identities gi
    where gi.guest_uuid = guest_message_events.guest_uuid
      and gi.linked_user_id = auth.uid()
  )
);

create or replace function public.register_guest_presence(
  p_guest_uuid text,
  p_fingerprint text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_guest_uuid), '') = '' then
    return;
  end if;

  insert into public.guest_identities (guest_uuid, fingerprint, last_seen_at)
  values (trim(p_guest_uuid), nullif(trim(p_fingerprint), ''), now())
  on conflict (guest_uuid) do update
    set fingerprint = coalesce(nullif(excluded.fingerprint, ''), guest_identities.fingerprint),
        last_seen_at = now();
end;
$$;

grant execute on function public.register_guest_presence(text, text) to anon, authenticated;

create or replace function public.merge_guest_state(
  p_guest_uuid text,
  p_guest_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_guest text := trim(coalesce(p_guest_uuid, ''));
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;
  if v_guest = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_guest_uuid');
  end if;

  perform public.register_guest_presence(v_guest, p_guest_fingerprint);

  update public.guest_identities
     set linked_user_id = v_user,
         upgraded_at = now(),
         last_seen_at = now(),
         fingerprint = coalesce(nullif(trim(p_guest_fingerprint), ''), fingerprint)
   where guest_uuid = v_guest;

  -- Future extension point:
  -- 1) move guest chats to auth user
  -- 2) merge unread counters
  -- 3) migrate guest drafts to server-side draft table
  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'linked_user_id', v_user,
    'merged_chats', 0,
    'merged_unread', 0,
    'merged_drafts', 0
  );
end;
$$;

grant execute on function public.merge_guest_state(text, text) to authenticated;
