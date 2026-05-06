-- Runtime controls, kill-switch, idempotency and observability
-- for guest-first chat architecture.

begin;

create table if not exists public.guest_runtime_flags (
  flag text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.guest_runtime_flags (flag, value) values
  ('guest_chat_enabled', 'true'::jsonb),
  ('guest_chat_rollout_percent', '0'::jsonb),
  ('guest_merge_enabled', 'true'::jsonb),
  ('guest_kill_switch', 'false'::jsonb),
  ('guest_presence_enabled', 'true'::jsonb)
on conflict (flag) do nothing;

revoke all on public.guest_runtime_flags from anon, authenticated;

create or replace function public.guest_runtime_flag_bool(
  p_flag text,
  p_default boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(grf.value) = 'boolean' then (grf.value #>> '{}')::boolean
        when jsonb_typeof(grf.value) = 'string' then lower(grf.value #>> '{}') in ('1', 'true', 'on', 'yes')
        when jsonb_typeof(grf.value) = 'number' then ((grf.value #>> '{}')::numeric <> 0)
        else null
      end
      from public.guest_runtime_flags grf
      where grf.flag = p_flag
      limit 1
    ),
    p_default
  );
$$;

create or replace function public.guest_runtime_flag_int(
  p_flag text,
  p_default integer
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(grf.value) in ('number', 'string') then greatest(0, least(100, (grf.value #>> '{}')::integer))
        when jsonb_typeof(grf.value) = 'boolean' then case when (grf.value #>> '{}')::boolean then 100 else 0 end
        else null
      end
      from public.guest_runtime_flags grf
      where grf.flag = p_flag
      limit 1
    ),
    p_default
  );
$$;

create or replace function public.get_guest_runtime_flags(
  p_guest_uuid text default null,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chat_enabled boolean := public.guest_runtime_flag_bool('guest_chat_enabled', true);
  v_merge_enabled boolean := public.guest_runtime_flag_bool('guest_merge_enabled', true);
  v_presence_enabled boolean := public.guest_runtime_flag_bool('guest_presence_enabled', true);
  v_kill_switch boolean := public.guest_runtime_flag_bool('guest_kill_switch', false);
  v_rollout integer := public.guest_runtime_flag_int('guest_chat_rollout_percent', 0);
  v_subject text := coalesce(nullif(trim(coalesce(p_guest_uuid, '')), ''), coalesce(p_user_id::text, 'anon'));
  v_bucket integer := abs(mod(hashtextextended(v_subject, 0)::numeric, 100::numeric))::integer;
  v_rollout_allowed boolean;
begin
  v_rollout_allowed := v_bucket < greatest(0, least(v_rollout, 100));
  return jsonb_build_object(
    'guest_chat_enabled', (v_chat_enabled and (not v_kill_switch) and v_rollout_allowed),
    'guest_chat_global_enabled', v_chat_enabled,
    'guest_chat_rollout_percent', v_rollout,
    'guest_chat_rollout_bucket', v_bucket,
    'guest_chat_rollout_allowed', v_rollout_allowed,
    'guest_merge_enabled', (v_merge_enabled and (not v_kill_switch)),
    'guest_presence_enabled', (v_presence_enabled and (not v_kill_switch)),
    'guest_kill_switch', v_kill_switch
  );
end;
$$;

grant execute on function public.get_guest_runtime_flags(text, uuid) to anon, authenticated;

create table if not exists public.guest_rpc_metrics (
  id bigserial primary key,
  operation text not null,
  ok boolean not null default true,
  latency_ms integer not null default 0,
  lock_wait_ms integer not null default 0,
  guest_uuid text,
  user_id uuid,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_rpc_metrics_created_at
  on public.guest_rpc_metrics (created_at desc);

create index if not exists idx_guest_rpc_metrics_operation_created
  on public.guest_rpc_metrics (operation, created_at desc);

alter table public.guest_rpc_metrics enable row level security;
drop policy if exists "deny_guest_rpc_metrics_select" on public.guest_rpc_metrics;
create policy "deny_guest_rpc_metrics_select"
on public.guest_rpc_metrics
for select
using (false);
drop policy if exists "deny_guest_rpc_metrics_insert" on public.guest_rpc_metrics;
create policy "deny_guest_rpc_metrics_insert"
on public.guest_rpc_metrics
for insert
with check (false);
drop policy if exists "deny_guest_rpc_metrics_update" on public.guest_rpc_metrics;
create policy "deny_guest_rpc_metrics_update"
on public.guest_rpc_metrics
for update
using (false)
with check (false);
drop policy if exists "deny_guest_rpc_metrics_delete" on public.guest_rpc_metrics;
create policy "deny_guest_rpc_metrics_delete"
on public.guest_rpc_metrics
for delete
using (false);
revoke all on public.guest_rpc_metrics from anon, authenticated;

alter table public.guest_preauth_messages
  add column if not exists client_nonce text;

create unique index if not exists guest_preauth_messages_nonce_uidx
  on public.guest_preauth_messages (chat_id, guest_uuid, client_nonce)
  where client_nonce is not null and length(trim(client_nonce)) > 0;

create or replace function public.enqueue_guest_message_controlled(
  p_guest_uuid text,
  p_peer_user_id uuid,
  p_text text,
  p_listing_id uuid default null,
  p_fingerprint text default null,
  p_created_at timestamptz default now(),
  p_client_nonce text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_before_lock timestamptz := clock_timestamp();
  v_after_lock timestamptz;
  v_lock_wait_ms integer := 0;
  v_guest text;
  v_chat_id uuid;
  v_message_id uuid;
  v_lock_key bigint;
  v_text text := left(trim(coalesce(p_text, '')), 4000);
  v_nonce text := nullif(trim(coalesce(p_client_nonce, '')), '');
  v_flags jsonb;
begin
  if p_peer_user_id is null then
    raise exception 'peer user required';
  end if;

  v_flags := public.get_guest_runtime_flags(p_guest_uuid, null);
  if coalesce((v_flags->>'guest_chat_enabled')::boolean, false) is false then
    raise exception 'guest_chat_disabled';
  end if;

  v_lock_key := hashtextextended(
    'guest-chat:' || trim(coalesce(p_guest_uuid, '')) || ':' || p_peer_user_id::text || ':' || coalesce(p_listing_id::text, 'null'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);
  v_after_lock := clock_timestamp();
  v_lock_wait_ms := greatest(0, floor(extract(epoch from (v_after_lock - v_before_lock)) * 1000)::integer);

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

  if v_nonce is not null then
    select gm.id
    into v_message_id
    from public.guest_preauth_messages gm
    where gm.chat_id = v_chat_id
      and gm.guest_uuid = v_guest
      and gm.client_nonce = v_nonce
    order by gm.created_at desc, gm.id desc
    limit 1;
    if v_message_id is not null then
      insert into public.guest_rpc_metrics (operation, ok, latency_ms, lock_wait_ms, guest_uuid)
      values (
        'enqueue_guest_message_controlled',
        true,
        greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer),
        v_lock_wait_ms,
        v_guest
      );
      return jsonb_build_object(
        'ok', true,
        'guest_uuid', v_guest,
        'guest_chat_id', v_chat_id,
        'guest_message_id', v_message_id,
        'duplicate', true
      );
    end if;
  end if;

  insert into public.guest_preauth_messages (
    chat_id,
    guest_uuid,
    sender_role,
    text,
    created_at,
    pending,
    fingerprint,
    client_nonce
  )
  values (
    v_chat_id,
    v_guest,
    'guest',
    v_text,
    coalesce(p_created_at, now()),
    false,
    nullif(trim(coalesce(p_fingerprint, '')), ''),
    v_nonce
  )
  returning id into v_message_id;

  insert into public.guest_rpc_metrics (operation, ok, latency_ms, lock_wait_ms, guest_uuid)
  values (
    'enqueue_guest_message_controlled',
    true,
    greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer),
    v_lock_wait_ms,
    v_guest
  );

  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'guest_chat_id', v_chat_id,
    'guest_message_id', v_message_id,
    'duplicate', false
  );
exception
  when others then
    insert into public.guest_rpc_metrics (
      operation,
      ok,
      latency_ms,
      lock_wait_ms,
      guest_uuid,
      error_code,
      error_message
    )
    values (
      'enqueue_guest_message_controlled',
      false,
      greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer),
      v_lock_wait_ms,
      nullif(trim(coalesce(p_guest_uuid, '')), ''),
      SQLSTATE,
      left(SQLERRM, 280)
    );
    raise;
end;
$$;

grant execute on function public.enqueue_guest_message_controlled(text, uuid, text, uuid, text, timestamptz, text) to anon, authenticated;
revoke execute on function public.enqueue_guest_message(text, uuid, text, uuid, text, timestamptz) from anon, authenticated;

create or replace function public.merge_guest_state_controlled(
  p_guest_uuid text,
  p_guest_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_flags jsonb;
  v_user uuid := auth.uid();
  v_res jsonb;
begin
  v_flags := public.get_guest_runtime_flags(p_guest_uuid, v_user);
  if coalesce((v_flags->>'guest_merge_enabled')::boolean, false) is false then
    return jsonb_build_object('ok', false, 'reason', 'guest_merge_disabled');
  end if;

  v_res := public.merge_guest_state_authoritative(p_guest_uuid, p_guest_fingerprint);

  insert into public.guest_rpc_metrics (operation, ok, latency_ms, user_id, guest_uuid)
  values (
    'merge_guest_state_controlled',
    true,
    greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer),
    v_user,
    nullif(trim(coalesce(p_guest_uuid, '')), '')
  );

  return v_res;
exception
  when others then
    insert into public.guest_message_events (guest_uuid, event_type, fingerprint, details)
    values (
      nullif(trim(coalesce(p_guest_uuid, '')), ''),
      'merge_failed',
      nullif(trim(coalesce(p_guest_fingerprint, '')), ''),
      jsonb_build_object('code', SQLSTATE, 'message', left(SQLERRM, 280))
    );
    insert into public.guest_rpc_metrics (
      operation,
      ok,
      latency_ms,
      user_id,
      guest_uuid,
      error_code,
      error_message
    )
    values (
      'merge_guest_state_controlled',
      false,
      greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer),
      v_user,
      nullif(trim(coalesce(p_guest_uuid, '')), ''),
      SQLSTATE,
      left(SQLERRM, 280)
    );
    raise;
end;
$$;

grant execute on function public.merge_guest_state_controlled(text, text) to authenticated;
revoke execute on function public.merge_guest_state_authoritative(text, text) from authenticated;

create or replace view public.guest_ops_dashboard_v1 as
select
  now() as snapshot_at,
  coalesce((select count(*)::bigint from public.guest_merge_audit where merged_at > now() - interval '1 minute'), 0) as guest_merges_1m,
  coalesce((select count(*)::bigint from public.guest_message_events where event_type = 'merge_failed' and created_at > now() - interval '1 minute'), 0) as merge_failures_1m,
  coalesce((select count(*)::bigint from public.guest_message_events where event_type = 'blocked_rate_limit' and created_at > now() - interval '1 minute'), 0) as guest_rate_limits_1m,
  coalesce((select count(*)::bigint from public.guest_identity_aliases), 0) as duplicate_alias_resolutions_total,
  coalesce((select count(*)::bigint from public.guest_preauth_messages where created_at > now() - interval '1 minute'), 0) as guest_chat_sends_1m,
  coalesce((select avg(grm.latency_ms)::numeric(10,2) from public.guest_rpc_metrics grm where grm.created_at > now() - interval '5 minutes'), 0) as rpc_latency_avg_5m_ms,
  coalesce((select percentile_cont(0.95) within group (order by grm.latency_ms) from public.guest_rpc_metrics grm where grm.created_at > now() - interval '5 minutes'), 0)::numeric(10,2) as rpc_latency_p95_5m_ms,
  coalesce((select percentile_cont(0.95) within group (order by grm.lock_wait_ms) from public.guest_rpc_metrics grm where grm.created_at > now() - interval '5 minutes'), 0)::numeric(10,2) as advisory_lock_wait_p95_5m_ms;

grant select on public.guest_ops_dashboard_v1 to authenticated;

commit;
