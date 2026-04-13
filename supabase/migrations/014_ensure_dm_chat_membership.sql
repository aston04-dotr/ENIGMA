-- Self-heal missing chat_members for 1:1 chats when user is chats.user1/user2 (RLS blocks direct client INSERT).
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
    values (p_chat_id, uid, 'admin')
    on conflict (chat_id, user_id) do nothing;
  end if;
end;
$$;

grant execute on function public.ensure_dm_chat_membership(uuid) to authenticated;
