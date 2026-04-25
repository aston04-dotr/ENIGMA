-- Final hardening for "delete for me" flow:
-- - strict access check in RPC (raise Access denied)
-- - explicit update policy for hidden_for_user_ids updates by participants only

create or replace function public.hide_message_for_me(p_message_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and exists (
        select 1
        from public.chat_members cm
        where cm.chat_id = m.chat_id
          and cm.user_id = auth.uid()::uuid
      )
  )
  into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  update public.messages m
  set hidden_for_user_ids = (
    select coalesce(array_agg(distinct x), '{}'::uuid[])
    from unnest(array_append(coalesce(m.hidden_for_user_ids, '{}'::uuid[]), auth.uid()::uuid)) as x
  )
  where m.id = p_message_id;
end;
$$;

grant execute on function public.hide_message_for_me(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users can update hidden_for_themselves_only'
  ) then
    create policy "Users can update hidden_for_themselves_only"
      on public.messages
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.chat_members cm
          where cm.chat_id = messages.chat_id
            and cm.user_id = auth.uid()::uuid
        )
      )
      with check (
        exists (
          select 1
          from public.chat_members cm
          where cm.chat_id = messages.chat_id
            and cm.user_id = auth.uid()::uuid
        )
      );
  end if;
end;
$$;
