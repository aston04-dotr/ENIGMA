-- Named UNIQUE on profiles.phone if not already present (015 may use implicit name profiles_phone_key).
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) like '%phone%'
  ) then
    alter table public.profiles add constraint unique_phone unique (phone);
  end if;
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;
