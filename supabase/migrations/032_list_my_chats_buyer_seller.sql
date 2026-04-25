-- list_my_chats для схемы без chat_members: участие через chats.buyer_id / chats.seller_id.
-- Выполните в Supabase SQL Editor (или через supabase db push).

-- ---------------------------------------------------------------------------
-- 1) Метки «прочитано» на чате (нужны для unread_count; без них счётчик = все сообщения собеседника)
-- ---------------------------------------------------------------------------
alter table public.chats
  add column if not exists buyer_last_read_at timestamptz;

alter table public.chats
  add column if not exists seller_last_read_at timestamptz;

comment on column public.chats.buyer_last_read_at is
  'Для покупателя: сообщения собеседника с created_at > этого времени считаются непрочитанными.';
comment on column public.chats.seller_last_read_at is
  'Для продавца: то же для стороны seller.';

-- ---------------------------------------------------------------------------
-- 2) Удалить старые перегрузки list_my_chats (в т.ч. с p_user)
-- ---------------------------------------------------------------------------
drop function if exists public.list_my_chats(uuid);
drop function if exists public.list_my_chats(uuid, timestamptz);
drop function if exists public.list_my_chats(int, timestamptz);
drop function if exists public.list_my_chats(integer, timestamptz);

-- ---------------------------------------------------------------------------
-- 3) Новая функция: auth.uid() внутри, без p_user
-- ---------------------------------------------------------------------------
create or replace function public.list_my_chats(
  p_limit int default 100,
  p_before timestamptz default null
)
returns table (
  chat_id uuid,
  buyer_id uuid,
  seller_id uuid,
  last_message_text text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with u as (
    select auth.uid()::uuid as uid
  ),
  base as (
    select
      c.id as chat_id,
      c.buyer_id,
      c.seller_id,
      c.buyer_last_read_at,
      c.seller_last_read_at
    from public.chats c
    cross join u
    where c.buyer_id = u.uid
       or c.seller_id = u.uid
  ),
  with_last as (
    select
      b.chat_id,
      b.buyer_id,
      b.seller_id,
      b.buyer_last_read_at,
      b.seller_last_read_at,
      lm.text as lm_text,
      lm.created_at as lm_at
    from base b
    left join lateral (
      select m.text, m.created_at
      from public.messages m
      where m.chat_id = b.chat_id
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
    cross join u
    where p_before is null
       or coalesce(lm.created_at, '-infinity'::timestamptz) < p_before
  )
  select
    wl.chat_id,
    wl.buyer_id,
    wl.seller_id,
    wl.lm_text as last_message_text,
    wl.lm_at as last_message_at,
    (
      select count(*)::bigint
      from public.messages m
      cross join u
      where m.chat_id = wl.chat_id
        and m.sender_id is not null
        and m.sender_id <> u.uid
        and m.created_at > coalesce(
          case
            when u.uid = wl.buyer_id then wl.buyer_last_read_at
            else wl.seller_last_read_at
          end,
          '-infinity'::timestamptz
        )
    ) as unread_count
  from with_last wl
  order by
    coalesce(wl.lm_at, '-infinity'::timestamptz) desc,
    wl.chat_id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

grant execute on function public.list_my_chats(int, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- unread_count здесь согласуется с mark_chat_read, который выставляет
-- buyer_last_read_at / seller_last_read_at и messages.read_at — см. 038_mark_chat_read_sync_unread_cursors.sql
-- (без этого — счётчик непрочитанного завышен относительно «прочитано»).
-- ---------------------------------------------------------------------------
