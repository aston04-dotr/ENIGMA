-- Production / ручной запуск: RLS UPDATE для получателя (только чужие сообщения в своих чатах).
-- Предусловия: на public.messages уже включён RLS и настроены политики SELECT / INSERT
-- (этот скрипт их не меняет и RLS не включает).

drop policy if exists "messages_update_incoming_delivery" on public.messages;

create policy "messages_update_incoming_delivery"
  on public.messages
  for update
  to authenticated
  using (
    sender_id is distinct from auth.uid()
    and exists (
      select 1
      from public.chats c
      where c.id = messages.chat_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  )
  with check (
    sender_id is distinct from auth.uid()
    and exists (
      select 1
      from public.chats c
      where c.id = messages.chat_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );
