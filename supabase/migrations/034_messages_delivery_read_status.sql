-- WhatsApp-style: delivered_at / read_at + mark_chat_read(p_chat_id, p_up_to_message_id)
-- Участники чата: chats.buyer_id / chats.seller_id (без chat_members).

alter table public.messages
  add column if not exists delivered_at timestamptz;

alter table public.messages
  add column if not exists read_at timestamptz;

comment on column public.messages.delivered_at is
  'Получатель открыл/получил сообщение (клиент или batch).';
comment on column public.messages.read_at is
  'Собеседник прочитал до этого сообщения (mark_chat_read).';

-- Получатель может помечать доставку входящих (sender_id <> auth.uid()).
drop policy if exists "messages_update_incoming_delivery" on public.messages;

create policy "messages_update_incoming_delivery"
  on public.messages
  for update
  to authenticated
  using (
    sender_id is distinct from auth.uid()
    and exists (
      select 1
      from public.chats c
      where c.id = messages.chat_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  )
  with check (
    sender_id is distinct from auth.uid()
    and exists (
      select 1
      from public.chats c
      where c.id = messages.chat_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- Замена mark_chat_read(uuid) на двухаргументную версию
drop function if exists public.mark_chat_read(uuid);

create or replace function public.mark_chat_read(
  p_chat_id uuid,
  p_up_to_message_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid()::uuid;
  v_buyer uuid;
  v_seller uuid;
  v_cutoff timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select c.buyer_id, c.seller_id
  into v_buyer, v_seller
  from public.chats c
  where c.id = p_chat_id;

  if not found then
    raise exception 'chat not found';
  end if;

  if v_uid is distinct from v_buyer and v_uid is distinct from v_seller then
    raise exception 'not a participant';
  end if;

  if p_up_to_message_id is not null then
    select m.created_at
    into v_cutoff
    from public.messages m
    where m.id = p_up_to_message_id
      and m.chat_id = p_chat_id;

    if not found then
      raise exception 'message not found in chat';
    end if;
  else
    select m.created_at
    into v_cutoff
    from public.messages m
    where m.chat_id = p_chat_id
    order by m.created_at desc, m.id desc
    limit 1;

    v_cutoff := coalesce(v_cutoff, now());
  end if;

  if v_uid = v_buyer then
    update public.chats
    set buyer_last_read_at = greatest(
      coalesce(buyer_last_read_at, '-infinity'::timestamptz),
      v_cutoff
    )
    where id = p_chat_id;
  else
    update public.chats
    set seller_last_read_at = greatest(
      coalesce(seller_last_read_at, '-infinity'::timestamptz),
      v_cutoff
    )
    where id = p_chat_id;
  end if;

  update public.messages m
  set read_at = now()
  where m.chat_id = p_chat_id
    and m.sender_id is distinct from v_uid
    and m.created_at <= v_cutoff
    and m.read_at is null;
end;
$$;

grant execute on function public.mark_chat_read(uuid, uuid) to authenticated;
