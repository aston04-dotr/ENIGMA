-- Вариант mark_chat_read для БД, где list_my_chats считает unread по chat_members.last_read_at
-- (как в миграции 031, без переопределения 032).
--
-- Не входит в цепочку supabase/migrations. Применить вручную в SQL Editor, если list_my_chats у вас от 031.
-- Стандартный Enigma после полного db push: используйте миграции 034/037/038 (buyer/seller + messages.read_at).
--
-- Перед примением отключите или замените mark_chat_read из 034/037/038, иначе будет конфликт одной сигнатуры.

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
  v_cutoff timestamptz;
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

  update public.chat_members cm
  set last_read_at = greatest(
    coalesce(cm.last_read_at, '-infinity'::timestamptz),
    v_cutoff
  )
  where cm.chat_id = p_chat_id
    and cm.user_id = v_uid;
end;
$$;

grant execute on function public.mark_chat_read(uuid, uuid) to authenticated;
