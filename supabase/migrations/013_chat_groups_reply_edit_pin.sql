create table if not exists public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member',
  primary key (chat_id, user_id)
);

create index if not exists idx_chat_members_user on public.chat_members (user_id);

insert into public.chat_members (chat_id, user_id, role)
select c.id, c.user1, 'member'
from public.chats c
where c.user1 is not null
on conflict (chat_id, user_id) do nothing;

insert into public.chat_members (chat_id, user_id, role)
select c.id, c.user2, 'member'
from public.chats c
where c.user2 is not null
on conflict (chat_id, user_id) do nothing;

alter table public.chats add column if not exists title text;
alter table public.chats add column if not exists is_group boolean not null default false;
alter table public.chats add column if not exists pinned_message_id uuid;

alter table public.chats alter column user1 drop not null;
alter table public.chats alter column user2 drop not null;

drop index if exists chats_pair_idx;
create unique index if not exists chats_pair_idx on public.chats (
  least(user1, user2),
  greatest(user1, user2)
) where user1 is not null and user2 is not null;

update public.chat_members cm
set role = 'admin'
from public.chats c
where c.id = cm.chat_id
  and coalesce(c.is_group, false) = false;

alter table public.messages add column if not exists reply_to uuid;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted boolean not null default false;
alter table public.messages add column if not exists hidden_for_user_ids uuid[] not null default '{}';

do $$
begin
  alter table public.messages
    add constraint messages_reply_to_fk
    foreign key (reply_to) references public.messages (id) on delete set null;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.chats
    add constraint chats_pinned_message_fk
    foreign key (pinned_message_id) references public.messages (id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create or replace function public.chats_after_insert_fill_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user1 is not null then
    insert into public.chat_members (chat_id, user_id, role)
    values (new.id, new.user1, case when coalesce(new.is_group, false) then 'member' else 'admin' end)
    on conflict (chat_id, user_id) do update set role = excluded.role;
  end if;
  if new.user2 is not null then
    insert into public.chat_members (chat_id, user_id, role)
    values (new.id, new.user2, case when coalesce(new.is_group, false) then 'member' else 'admin' end)
    on conflict (chat_id, user_id) do update set role = excluded.role;
  end if;
  return new;
end;
$$;

drop trigger if exists chats_after_insert_members on public.chats;
create trigger chats_after_insert_members
  after insert on public.chats
  for each row execute function public.chats_after_insert_fill_members();

create or replace function public.messages_enforce_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    raise exception 'sender_id immutable';
  end if;
  if new.chat_id is distinct from old.chat_id then
    raise exception 'chat_id immutable';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id immutable';
  end if;
  if old.sender_id is distinct from auth.uid()::uuid then
    if new.text is distinct from old.text
       or new.image_url is distinct from old.image_url
       or new.voice_url is distinct from old.voice_url
       or new.reply_to is distinct from old.reply_to
       or new.edited_at is distinct from old.edited_at
       or new.deleted is distinct from old.deleted then
      raise exception 'only sender can change content';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_update_enforce on public.messages;
create trigger messages_before_update_enforce
  before update on public.messages
  for each row execute function public.messages_enforce_update();

alter table public.chat_members enable row level security;

drop policy if exists "chat_members_select" on public.chat_members;
create policy "chat_members_select" on public.chat_members for select to authenticated using (
  exists (
    select 1 from public.chat_members cm
    where cm.chat_id = chat_members.chat_id and cm.user_id = auth.uid()::uuid
  )
);

drop policy if exists "chat_members_insert" on public.chat_members;
create policy "chat_members_insert" on public.chat_members for insert to authenticated with check (false);

drop policy if exists "chats_select" on public.chats;
create policy "chats_select" on public.chats for select to authenticated using (
  exists (select 1 from public.chat_members cm where cm.chat_id = chats.id and cm.user_id = auth.uid()::uuid)
);

drop policy if exists "chats_insert" on public.chats;
create policy "chats_insert" on public.chats for insert to authenticated with check (
  (user1 is not null and auth.uid()::uuid = user1)
  or (user2 is not null and auth.uid()::uuid = user2)
);

drop policy if exists "chats_update_admin" on public.chats;
create policy "chats_update_admin" on public.chats for update to authenticated using (
  exists (
    select 1 from public.chat_members cm
    where cm.chat_id = chats.id and cm.user_id = auth.uid()::uuid and cm.role = 'admin'
  )
) with check (
  exists (
    select 1 from public.chat_members cm
    where cm.chat_id = chats.id and cm.user_id = auth.uid()::uuid and cm.role = 'admin'
  )
);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated using (
  exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()::uuid)
  and not (auth.uid()::uuid = any (messages.hidden_for_user_ids))
);

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated with check (
  sender_id = auth.uid()::uuid
  and exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()::uuid)
);

drop policy if exists "messages_update_participants" on public.messages;
drop policy if exists "messages_update_sender" on public.messages;
drop policy if exists "messages_update_receiver_status" on public.messages;

create policy "messages_update_sender" on public.messages for update to authenticated using (sender_id = auth.uid()::uuid) with check (sender_id = auth.uid()::uuid);

create policy "messages_update_receiver_status" on public.messages for update to authenticated using (
  sender_id <> auth.uid()::uuid
  and exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()::uuid)
) with check (
  sender_id <> auth.uid()::uuid
  and exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()::uuid)
);

drop policy if exists "typing_select_chat" on public.typing_status;
create policy "typing_select_chat" on public.typing_status for select to authenticated using (
  exists (select 1 from public.chat_members cm where cm.chat_id = typing_status.chat_id and cm.user_id = auth.uid()::uuid)
);

drop policy if exists "typing_insert_own" on public.typing_status;
create policy "typing_insert_own" on public.typing_status for insert to authenticated with check (
  auth.uid()::uuid = user_id
  and exists (select 1 from public.chat_members cm where cm.chat_id = typing_status.chat_id and cm.user_id = auth.uid()::uuid)
);
