-- Authenticated inbox for incoming guest chats/messages.

begin;

alter table public.guest_preauth_chats
  add column if not exists peer_last_read_at timestamptz;

create index if not exists idx_guest_preauth_chats_peer_last_message
  on public.guest_preauth_chats (peer_user_id, last_message_at desc)
  where status = 'active';

create or replace function public.list_incoming_guest_chats_controlled(
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'rows', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'chat_id', gc.id,
          'source', 'guest_inbox',
          'guest_uuid', gc.guest_uuid,
          'created_at', gc.created_at,
          'last_message_at', gc.last_message_at,
          'last_message_created_at', lm.created_at,
          'last_message_text', lm.text,
          'last_message_sender_role', lm.sender_role,
          'other_name', 'Пользователь Enigma',
          'other_public_id', right(gc.guest_uuid, 6),
          'unread_count', coalesce((
            select count(*)::int
            from public.guest_preauth_messages m
            where m.chat_id = gc.id
              and m.sender_role = 'guest'
              and m.created_at > coalesce(gc.peer_last_read_at, '-infinity'::timestamptz)
          ), 0)
        )
        order by gc.last_message_at desc, gc.id desc
      )
      from public.guest_preauth_chats gc
      left join lateral (
        select gm.text, gm.sender_role, gm.created_at
        from public.guest_preauth_messages gm
        where gm.chat_id = gc.id
        order by gm.created_at desc, gm.id desc
        limit 1
      ) lm on true
      where gc.peer_user_id = v_uid
        and gc.status = 'active'
      limit greatest(1, least(coalesce(p_limit, 100), 200))
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.list_incoming_guest_chats_controlled(int) to authenticated;

create or replace function public.list_incoming_guest_messages_controlled(
  p_chat_id uuid,
  p_limit int default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;
  if p_chat_id is null then
    raise exception 'chat_id required';
  end if;
  if not exists (
    select 1
    from public.guest_preauth_chats gc
    where gc.id = p_chat_id
      and gc.peer_user_id = v_uid
      and gc.status = 'active'
  ) then
    raise exception 'chat not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', gm.id,
          'chat_id', gm.chat_id,
          'sender_role', gm.sender_role,
          'text', gm.text,
          'created_at', gm.created_at,
          'delivered_at', gm.delivered_at,
          'read_at', gm.read_at,
          'pending', gm.pending
        )
        order by gm.created_at asc, gm.id asc
      )
      from (
        select *
        from public.guest_preauth_messages m
        where m.chat_id = p_chat_id
        order by m.created_at desc, m.id desc
        limit greatest(1, least(coalesce(p_limit, 300), 800))
      ) gm
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.list_incoming_guest_messages_controlled(uuid, int) to authenticated;

create or replace function public.mark_incoming_guest_chat_read_controlled(
  p_chat_id uuid,
  p_up_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cutoff timestamptz;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;
  if p_chat_id is null then
    raise exception 'chat_id required';
  end if;
  if not exists (
    select 1
    from public.guest_preauth_chats gc
    where gc.id = p_chat_id
      and gc.peer_user_id = v_uid
      and gc.status = 'active'
  ) then
    raise exception 'chat not found';
  end if;

  if p_up_to_message_id is not null then
    select gm.created_at
    into v_cutoff
    from public.guest_preauth_messages gm
    where gm.id = p_up_to_message_id
      and gm.chat_id = p_chat_id
    limit 1;
  else
    select gm.created_at
    into v_cutoff
    from public.guest_preauth_messages gm
    where gm.chat_id = p_chat_id
    order by gm.created_at desc, gm.id desc
    limit 1;
  end if;

  v_cutoff := coalesce(v_cutoff, now());

  update public.guest_preauth_chats gc
  set peer_last_read_at = greatest(coalesce(gc.peer_last_read_at, '-infinity'::timestamptz), v_cutoff)
  where gc.id = p_chat_id
    and gc.peer_user_id = v_uid;

  update public.guest_preauth_messages gm
  set read_at = coalesce(gm.read_at, now())
  where gm.chat_id = p_chat_id
    and gm.sender_role = 'guest'
    and gm.created_at <= v_cutoff
    and gm.read_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.mark_incoming_guest_chat_read_controlled(uuid, uuid) to authenticated;

create or replace function public.enqueue_guest_peer_reply_controlled(
  p_chat_id uuid,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_msg_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;
  if p_chat_id is null then
    raise exception 'chat_id required';
  end if;
  if not exists (
    select 1
    from public.guest_preauth_chats gc
    where gc.id = p_chat_id
      and gc.peer_user_id = v_uid
      and gc.status = 'active'
  ) then
    raise exception 'chat not found';
  end if;

  insert into public.guest_preauth_messages (
    chat_id,
    guest_uuid,
    sender_role,
    text,
    created_at,
    pending
  )
  select
    gc.id,
    gc.guest_uuid,
    'peer',
    left(trim(coalesce(p_text, '')), 4000),
    now(),
    false
  from public.guest_preauth_chats gc
  where gc.id = p_chat_id
    and gc.peer_user_id = v_uid
  returning id into v_msg_id;

  update public.guest_preauth_chats
  set last_message_at = now()
  where id = p_chat_id
    and peer_user_id = v_uid;

  return jsonb_build_object('ok', true, 'message_id', v_msg_id);
end;
$$;

grant execute on function public.enqueue_guest_peer_reply_controlled(uuid, text) to authenticated;

commit;
