-- Снятие CHECK-ограничений на public.messages, которые мешают INSERT.
-- Выполните в Supabase → SQL Editor (или supabase db push / migrate).

-- ─── 1. Список имён ограничений (можно выполнить отдельно для диагностики) ───
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.messages'::regclass;

-- ─── 2. Явное снятие типичного ограничения (имя из ошибки / инспекции) ────────
ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS messages_chat_id_two_uids_chk;

-- На случай другого регистра/кавычек при создании:
ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS "messages_chat_id_two_uids_chk";

-- ─── 3. Если нужно снять ВСЕ CHECK на этой таблице ───────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
