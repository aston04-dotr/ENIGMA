-- Ensure chat_members is part of Supabase realtime publication.
do $$
begin
  if to_regclass('public.chat_members') is null then
    raise notice 'public.chat_members not found, skipping publication update';
    return;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_members'
  ) then
    alter publication supabase_realtime add table public.chat_members;
  end if;
end
$$;
