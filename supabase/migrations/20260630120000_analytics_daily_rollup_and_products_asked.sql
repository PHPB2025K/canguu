-- Analytics — rollup diário + rastreamento de produto consultado
--
-- Contexto: o módulo Analytics lia só a tabela analytics_daily, que tinha apenas dados de
-- demonstração e nunca era populada (causa-raiz do "Analytics vazio"). Esta migration versiona
-- o que já foi aplicado em produção (via MCP) em 29-30/06/2026:
--   1. Coluna conversations.products_asked  -> produtos (família) consultados por conversa
--   2. Função refresh_analytics_daily()     -> agrega conversations/messages em analytics_daily
--      (upsert por date). Alimenta: KPIs, Sentimento, Top Categorias, Top Produtos Consultados.
--
-- Só LÊ as tabelas cruas (conversations/messages) e só ESCREVE em analytics_daily (upsert).
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS products_asked text[];

CREATE OR REPLACE FUNCTION public.refresh_analytics_daily(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from date := COALESCE(
    p_from,
    LEAST(
      (SELECT min(created_at)::date FROM conversations),
      (SELECT min(created_at)::date FROM messages)
    )
  );
  v_to date := COALESCE(p_to, current_date);
  v_rate_usd_per_token numeric := 0.0000025;
  v_count integer;
BEGIN
  WITH conv AS (
    SELECT created_at::date AS d,
           count(*) AS total_conversations,
           count(*) FILTER (WHERE status = 'resolved' OR resolved_at IS NOT NULL) AS resolved_cnt,
           count(*) FILTER (WHERE status = 'escalated') AS escalated_cnt,
           count(*) FILTER (WHERE sentiment = 'positivo') AS s_pos,
           count(*) FILTER (WHERE sentiment = 'neutro') AS s_neu,
           count(*) FILTER (WHERE sentiment IN ('negativo','critico')) AS s_neg
    FROM conversations
    WHERE created_at::date BETWEEN v_from AND v_to
    GROUP BY created_at::date
  ),
  cat AS (
    SELECT d, jsonb_object_agg(category, c) AS top_categories
    FROM (
      SELECT created_at::date AS d, category, count(*) AS c
      FROM conversations
      WHERE created_at::date BETWEEN v_from AND v_to
        AND category IS NOT NULL AND category <> ''
      GROUP BY created_at::date, category
    ) x
    GROUP BY d
  ),
  prod AS (
    -- objeto jsonb {nome_produto: nº de conversas} a partir de conversations.products_asked
    SELECT d, jsonb_object_agg(pname, c) AS top_products_asked
    FROM (
      SELECT cc.created_at::date AS d, pname, count(DISTINCT cc.id) AS c
      FROM conversations cc, unnest(cc.products_asked) AS pname
      WHERE cc.created_at::date BETWEEN v_from AND v_to
        AND pname IS NOT NULL AND pname <> ''
      GROUP BY cc.created_at::date, pname
    ) y
    GROUP BY d
  ),
  msg AS (
    SELECT created_at::date AS d,
           count(*) AS total_messages,
           COALESCE(round(avg(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL AND response_time_ms > 0)),0)::int AS avg_rt,
           COALESCE(sum(tokens_used),0)::int AS tokens
    FROM messages
    WHERE created_at::date BETWEEN v_from AND v_to
    GROUP BY created_at::date
  ),
  days AS (
    SELECT d FROM conv
    UNION
    SELECT d FROM msg
  )
  INSERT INTO public.analytics_daily AS a (
    id, date, total_conversations, total_messages, avg_response_time_ms,
    avg_messages_per_conversation, resolution_rate, escalation_rate,
    sentiment_positive, sentiment_neutral, sentiment_negative,
    top_categories, top_products_asked, total_tokens_used, estimated_cost, created_at
  )
  SELECT
    gen_random_uuid(),
    days.d,
    COALESCE(conv.total_conversations, 0),
    COALESCE(msg.total_messages, 0),
    COALESCE(msg.avg_rt, 0),
    CASE WHEN COALESCE(conv.total_conversations,0) > 0
         THEN round(COALESCE(msg.total_messages,0)::numeric / conv.total_conversations, 2) ELSE 0 END,
    CASE WHEN COALESCE(conv.total_conversations,0) > 0
         THEN round(100.0 * conv.resolved_cnt / conv.total_conversations, 1) ELSE 0 END,
    CASE WHEN COALESCE(conv.total_conversations,0) > 0
         THEN round(100.0 * conv.escalated_cnt / conv.total_conversations, 1) ELSE 0 END,
    COALESCE(conv.s_pos, 0),
    COALESCE(conv.s_neu, 0),
    COALESCE(conv.s_neg, 0),
    COALESCE(cat.top_categories, '{}'::jsonb),
    COALESCE(prod.top_products_asked, '{}'::jsonb),
    COALESCE(msg.tokens, 0),
    round(COALESCE(msg.tokens,0) * v_rate_usd_per_token, 4),
    now()
  FROM days
  LEFT JOIN conv ON conv.d = days.d
  LEFT JOIN cat  ON cat.d  = days.d
  LEFT JOIN prod ON prod.d = days.d
  LEFT JOIN msg  ON msg.d  = days.d
  ON CONFLICT (date) DO UPDATE SET
    total_conversations = EXCLUDED.total_conversations,
    total_messages = EXCLUDED.total_messages,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    avg_messages_per_conversation = EXCLUDED.avg_messages_per_conversation,
    resolution_rate = EXCLUDED.resolution_rate,
    escalation_rate = EXCLUDED.escalation_rate,
    sentiment_positive = EXCLUDED.sentiment_positive,
    sentiment_neutral = EXCLUDED.sentiment_neutral,
    sentiment_negative = EXCLUDED.sentiment_negative,
    top_categories = EXCLUDED.top_categories,
    top_products_asked = EXCLUDED.top_products_asked,
    total_tokens_used = EXCLUDED.total_tokens_used,
    estimated_cost = EXCLUDED.estimated_cost;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.refresh_analytics_daily(date, date) IS
  'Rollup diario do Analytics do Canggu: agrega conversations/messages em analytics_daily (upsert por date). Backfill + cron diario. Fix causa-raiz: tabela nunca era populada.';
