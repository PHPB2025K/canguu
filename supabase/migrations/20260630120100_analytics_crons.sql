-- Analytics — cron jobs (pg_cron)
--
-- Versiona os 2 crons aplicados em produção (via MCP) em 29-30/06/2026. Requer pg_cron.
-- cron.schedule é upsert por jobname (idempotente).
--
-- 1) refresh-analytics-daily: recomputa o rollup dos últimos 3 dias a cada 3h
--    (pega dado que chega atrasado + mantém o "hoje" fresco). SQL puro, sem segredo -> executável.
SELECT cron.schedule(
  'refresh-analytics-daily',
  '0 */3 * * *',
  $$SELECT public.refresh_analytics_daily((current_date - interval '3 days')::date, current_date)$$
);

-- 2) classify-pending-sentiment: hora em hora, chama a edge function que preenche
--    sentiment/category/products_asked das conversas que ficaram nulas.
--
--    ⚠️ NÃO versionado de forma executável: o comando carrega ?key=<IG_VERIFY_TOKEN> (secret do
--    projeto) e não comitamos segredo no Git. Recriar em produção UMA vez, substituindo o token:
--
--    SELECT cron.schedule(
--      'classify-pending-sentiment',
--      '30 * * * *',
--      $$SELECT net.http_post(
--          url := 'https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/classify-pending-sentiment?key=<IG_VERIFY_TOKEN>',
--          headers := '{"Content-Type":"application/json"}'::jsonb
--      )$$
--    );
--
--    (IG_VERIFY_TOKEN = mesmo secret usado pelos crons do Instagram; está nas env vars do projeto.)
