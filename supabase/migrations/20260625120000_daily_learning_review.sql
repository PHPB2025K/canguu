-- Aprendizado contínuo da Ana — infra do daily-learning-review
-- Tabela de log das rodadas + agendamento do cron diário.

CREATE TABLE IF NOT EXISTS public.learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  channel text,
  window_hours integer,
  evaluated integer DEFAULT 0,
  good integer DEFAULT 0,
  bad integer DEFAULT 0,
  auto_applied integer DEFAULT 0,
  queued integer DEFAULT 0,
  deduped integer DEFAULT 0,
  errors jsonb,
  duration_ms integer
);
ALTER TABLE public.learning_runs ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.learning_runs IS 'Log das rodadas diarias de aprendizado da Ana (daily-learning-review)';

-- Cron diário (06:00 BRT = 09:00 UTC). Chama o edge function com a anon key
-- (public; a função roda com service_role internamente). Governança: por padrão
-- as correções vão para fila de revisão (status auto_review), não entram ativas
-- sozinhas — habilite auto-aplicação com agent_config.learning_auto_apply = 'true'.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'daily-learning-review',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/daily-learning-review',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwYWNtbG9xc2ZpZWJ2YWdmb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTI5NDYsImV4cCI6MjA4Nzc2ODk0Nn0.bRMeYGbG4m8B19rYof8t4G_U4NVoNZ95Q0QNQPXj5zY'
    ),
    body := '{}'::jsonb
  );
  $$
);
