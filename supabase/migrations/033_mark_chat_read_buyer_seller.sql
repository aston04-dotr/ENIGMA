-- mark_chat_read для схемы chats.buyer_id / chats.seller_id + buyer_last_read_at / seller_last_read_at
-- Выполните в Supabase SQL Editor.

-- Старые сигнатуры из 031 (chat_members)
drop function if exists public.mark_chat_read(uuid, uuid);

create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid()::uuid;
  v_buyer uuid;
  v_seller uuid;
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

  if v_uid = v_buyer then
    update public.chats
    set buyer_last_read_at = now()
    where id = p_chat_id;
  elsif v_uid = v_seller then
    update public.chats
    set seller_last_read_at = now()
    where id = p_chat_id;
  else
    raise exception 'not a participant';
  end if;
end;
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;
