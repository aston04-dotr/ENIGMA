-- Product-facing guest chat RPCs (controlled by runtime flags).

begin;

create or replace function public.get_or_create_guest_chat_controlled(
  p_guest_uuid text,
  p_peer_user_id uuid,
  p_listing_id uuid default null,
  p_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flags jsonb;
  v_guest text;
  v_chat_id uuid;
  v_lock_key bigint;
begin
  if p_peer_user_id is null then
    raise exception 'peer user required';
  end if;

  v_flags := public.get_guest_runtime_flags(p_guest_uuid, null);
  if coalesce((v_flags->>'guest_chat_enabled')::boolean, false) is false then
    raise exception 'guest_chat_disabled';
  end if;

  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);
  v_lock_key := hashtextextended(
    'guest-chat-open:' || v_guest || ':' || p_peer_user_id::text || ':' || coalesce(p_listing_id::text, 'null'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

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
    now(),
    now(),
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

  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'chat_id', v_chat_id
  );
end;
$$;

grant execute on function public.get_or_create_guest_chat_controlled(text, uuid, uuid, text) to anon, authenticated;

create or replace function public.list_guest_chats_controlled(
  p_guest_uuid text,
  p_fingerprint text default null,
  p_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flags jsonb;
  v_guest text;
begin
  v_flags := public.get_guest_runtime_flags(p_guest_uuid, null);
  if coalesce((v_flags->>'guest_chat_enabled')::boolean, false) is false then
    return jsonb_build_object('ok', true, 'rows', '[]'::jsonb, 'disabled', true);
  end if;

  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);

  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'chat_id', gc.id,
          'peer_user_id', gc.peer_user_id,
          'listing_id', gc.listing_id,
          'created_at', gc.created_at,
          'last_message_at', gc.last_message_at,
          'last_read_at', gc.last_read_at,
          'other_name', coalesce(p.name, 'Пользователь Enigma'),
          'last_message_text', lm.text,
          'last_message_sender_role', lm.sender_role,
          'last_message_created_at', lm.created_at,
          'unread_count', coalesce((
            select count(*)::int
            from public.guest_preauth_messages m
            where m.chat_id = gc.id
              and m.sender_role = 'peer'
              and m.created_at > coalesce(gc.last_read_at, '-infinity'::timestamptz)
          ), 0)
        )
        order by gc.last_message_at desc, gc.id desc
      )
      from public.guest_preauth_chats gc
      left join public.profiles p on p.id = gc.peer_user_id
      left join lateral (
        select m.text, m.sender_role, m.created_at
        from public.guest_preauth_messages m
        where m.chat_id = gc.id
        order by m.created_at desc, m.id desc
        limit 1
      ) lm on true
      where gc.guest_uuid = v_guest
        and gc.status = 'active'
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.list_guest_chats_controlled(text, text, int) to anon, authenticated;

create or replace function public.list_guest_messages_controlled(
  p_guest_uuid text,
  p_chat_id uuid,
  p_fingerprint text default null,
  p_limit int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flags jsonb;
  v_guest text;
begin
  if p_chat_id is null then
    raise exception 'chat_id required';
  end if;

  v_flags := public.get_guest_runtime_flags(p_guest_uuid, null);
  if coalesce((v_flags->>'guest_chat_enabled')::boolean, false) is false then
    return jsonb_build_object('ok', true, 'rows', '[]'::jsonb, 'disabled', true);
  end if;

  v_guest := public.resolve_guest_uuid(p_guest_uuid, p_fingerprint);

  if not exists (
    select 1
    from public.guest_preauth_chats gc
    where gc.id = p_chat_id
      and gc.guest_uuid = v_guest
      and gc.status = 'active'
  ) then
    raise exception 'guest chat not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'guest_uuid', v_guest,
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'chat_id', m.chat_id,
          'sender_role', m.sender_role,
          'text', m.text,
          'created_at', m.created_at,
          'delivered_at', m.delivered_at,
          'read_at', m.read_at,
          'pending', m.pending
        )
        order by m.created_at asc, m.id asc
      )
      from (
        select *
        from public.guest_preauth_messages gm
        where gm.chat_id = p_chat_id
        order by gm.created_at desc, gm.id desc
        limit greatest(1, least(coalesce(p_limit, 200), 500))
      ) m
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.list_guest_messages_controlled(text, uuid, text, int) to anon, authenticated;

create or replace function public.mark_guest_chat_read_controlled(
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
  v_flags jsonb;
begin
  v_flags := public.get_guest_runtime_flags(p_guest_uuid, null);
  if coalesce((v_flags->>'guest_chat_enabled')::boolean, false) is false then
    return jsonb_build_object('ok', false, 'reason', 'guest_chat_disabled');
  end if;
  return public.mark_guest_chat_read(
    p_guest_uuid,
    p_guest_chat_id,
    p_fingerprint,
    p_up_to_message_id
  );
end;
$$;

grant execute on function public.mark_guest_chat_read_controlled(text, uuid, text, uuid) to anon, authenticated;

commit;
