-- Preserve authenticated RLS. Enable change delivery, without modifying any answer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
      AND schemaname='public' AND tablename='marketplace_questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_questions;
  END IF;
END $$;
