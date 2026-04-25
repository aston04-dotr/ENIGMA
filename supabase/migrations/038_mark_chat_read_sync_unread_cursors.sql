-- mark_chat_read: согласовано с list_my_chats (032) — unread_count из chats.buyer_last_read_at / seller_last_read_at.
-- + messages.read_at (галочки) по created_at <= v_cutoff (а не по сравнению id).
-- Порядок: сначала messages, потом курсор на чате — в одной транзакции список и UI сходятся.
--
-- Схема 031 (list_my_chats читает chat_members.last_read_at) не в этой миграции: см. supabase/alternates/mark_chat_read_031_list_my_chats.sql

drop function if exists public.mark_chat_read(uuid, uuid);
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

  update public.messages m
  set read_at = now()
  where m.chat_id = p_chat_id
    and m.sender_id is distinct from v_uid
    and m.created_at <= v_cutoff
    and m.read_at is null;

  update public.chats
  set
    buyer_last_read_at = case
      when v_uid = v_buyer then greatest(
        coalesce(buyer_last_read_at, '-infinity'::timestamptz),
        v_cutoff
      )
      else buyer_last_read_at
    end,
    seller_last_read_at = case
      when v_uid = v_seller then greatest(
        coalesce(seller_last_read_at, '-infinity'::timestamptz),
        v_cutoff
      )
      else seller_last_read_at
    end
  where id = p_chat_id;
end;
$$;

grant execute on function public.mark_chat_read(uuid, uuid) to authenticated;
