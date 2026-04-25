-- Production hardening for chat message deletion:
-- 1) allow soft-delete payload with text = null
-- 2) hide-for-me update without duplicates
-- 3) explicit sender-only delete/update policy (defense in depth)

alter table public.messages
  alter column text drop not null;

create or replace function public.hide_message_for_me(p_message_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.messages m
  set hidden_for_user_ids = (
    select coalesce(array_agg(distinct x), '{}'::uuid[])
    from unnest(array_append(coalesce(m.hidden_for_user_ids, '{}'::uuid[]), auth.uid()::uuid)) as x
  )
  where m.id = p_message_id
    and exists (
      select 1
      from public.chat_members cm
      where cm.chat_id = m.chat_id
        and cm.user_id = auth.uid()::uuid
    );
$$;

grant execute on function public.hide_message_for_me(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users can delete own messages only'
  ) then
    create policy "Users can delete own messages only"
      on public.messages
      for update
      to authenticated
      using (sender_id = auth.uid()::uuid)
      with check (sender_id = auth.uid()::uuid);
  end if;
end;
$$;
