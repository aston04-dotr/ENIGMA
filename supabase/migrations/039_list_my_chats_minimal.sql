-- Минимальный list_my_chats: только id, buyer_id, seller_id, created_at.
-- Синхрон с фронтом (web); старые перегрузки с p_before / JSON убраны на стороне проекта.

drop function if exists public.list_my_chats(integer, timestamptz);
drop function if exists public.list_my_chats(int, timestamptz);
drop function if exists public.list_my_chats(integer);
drop function if exists public.list_my_chats(int);

create or replace function public.list_my_chats(
  p_limit int default 50
) returns table (
  id uuid,
  buyer_id uuid,
  seller_id uuid,
  created_at timestamptz
) language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.buyer_id,
    c.seller_id,
    c.created_at
  from chats c
  where c.buyer_id = auth.uid()
     or c.seller_id = auth.uid()
  order by c.created_at desc
  limit p_limit;
$$;

grant execute on function public.list_my_chats(int) to authenticated;
