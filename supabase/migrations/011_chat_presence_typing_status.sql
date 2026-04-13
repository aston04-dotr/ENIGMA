-- Онлайн, «печатает», статусы сообщений. Realtime: включите replication для online_users, typing_status, messages (UPDATE).

create table if not exists public.online_users (
  user_id uuid primary key references public.users (id) on delete cascade,
  last_seen timestamptz not null default now()
);

create table if not exists public.typing_status (
  user_id uuid not null references public.users (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

alter table public.messages add column if not exists status text not null default 'sent';

alter table public.online_users enable row level security;
alter table public.typing_status enable row level security;

create policy "online_select_auth" on public.online_users for select to authenticated using (true);
create policy "online_insert_own" on public.online_users for insert to authenticated with check (auth.uid() = user_id);
create policy "online_update_own" on public.online_users for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "typing_select_chat" on public.typing_status for select to authenticated using (
  exists (select 1 from public.chats c where c.id = chat_id and (c.user1 = auth.uid() or c.user2 = auth.uid()))
);
create policy "typing_insert_own" on public.typing_status for insert to authenticated with check (
  auth.uid() = user_id
  and exists (select 1 from public.chats c where c.id = chat_id and (c.user1 = auth.uid() or c.user2 = auth.uid()))
);
create policy "typing_update_own" on public.typing_status for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "typing_delete_own" on public.typing_status for delete to authenticated using (auth.uid() = user_id);

create policy "messages_update_participants" on public.messages for update to authenticated using (
  exists (select 1 from public.chats c where c.id = chat_id and (c.user1 = auth.uid() or c.user2 = auth.uid()))
) with check (
  exists (select 1 from public.chats c where c.id = chat_id and (c.user1 = auth.uid() or c.user2 = auth.uid()))
);

create index if not exists idx_typing_status_chat on public.typing_status (chat_id);
