-- Реакции на сообщения (отдельно от messages, realtime и RLS на уровне чата)

begin;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  chat_id uuid,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_msg_user_emoji unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_id_idx
  on public.message_reactions (message_id);
create index if not exists message_reactions_chat_id_idx
  on public.message_reactions (chat_id);

comment on table public.message_reactions is
  'Реакция пользователя на сообщение (emoji). chat_id — из messages, триггером.';

-- Только для доставки полной строки в Realtime при DELETE
alter table public.message_reactions replica identity full;

-- chat_id = messages.chat_id (для RLS, фильтра Realtime, индексов)
create or replace function public.trg_message_reactions_set_chat_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat uuid;
begin
  select m.chat_id
  into v_chat
  from public.messages m
  where m.id = new.message_id;

  if v_chat is null then
    raise exception 'message not found: %', new.message_id;
  end if;

  new.chat_id := v_chat;
  return new;
end;
$$;

drop trigger if exists tr_message_reactions_set_chat on public.message_reactions;
create trigger tr_message_reactions_set_chat
  before insert on public.message_reactions
  for each row
  execute function public.trg_message_reactions_set_chat_id();

alter table public.message_reactions
  alter column chat_id set not null;

alter table public.message_reactions
  add constraint message_reactions_chat_fk
  foreign key (chat_id) references public.chats (id) on delete cascade;

alter table public.message_reactions enable row level security;

-- SELECT: участники чата
drop policy if exists "message_reactions_select_participants" on public.message_reactions;
create policy "message_reactions_select_participants"
  on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chats c
      where c.id = message_reactions.chat_id
        and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))
    )
  );

-- INSERT: только себя, только в своих чатах
drop policy if exists "message_reactions_insert_participant" on public.message_reactions;
create policy "message_reactions_insert_participant"
  on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.chats c
      where c.id = message_reactions.chat_id
        and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))
    )
  );

-- DELETE: только свои реакции
drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own"
  on public.message_reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.message_reactions to authenticated;

-- Realtime: INSERT, DELETE
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
exception
  when duplicate_object then null;
end $$;

commit;
