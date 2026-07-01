-- Item 6: prompt caching na Ana (WhatsApp/Instagram). Contabiliza tokens de cache no custo.
-- Aplicado em prod via MCP em 2026-06-30; versionado aqui pra reprodutibilidade.
-- Sonnet 4.6: cache_read = US$0,30/1M (0.1x input); cache_write(5min) = US$3,75/1M (1.25x input).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS tokens_cache_read  integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS tokens_cache_write integer;

CREATE OR REPLACE FUNCTION public.refresh_analytics_daily(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from date := COALESCE(p_from, LEAST(
    (SELECT min(created_at)::date FROM conversations),
    (SELECT min(created_at)::date FROM messages)));
  v_to date := COALESCE(p_to, current_date);
  v_fx numeric := COALESCE((SELECT config_value::numeric FROM agent_config WHERE config_key='usd_brl_rate'), 5.50);
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
           COALESCE(sum(COALESCE(tokens_used,0) + COALESCE(tokens_cache_read,0) + COALESCE(tokens_cache_write,0)),0)::int AS tokens,
           COALESCE(sum(tokens_in),0)::int  AS tok_in,
           COALESCE(sum(tokens_out),0)::int AS tok_out,
           sum(CASE WHEN tokens_in IS NOT NULL OR tokens_out IS NOT NULL OR tokens_cache_read IS NOT NULL
                    THEN COALESCE(tokens_in,0)*3.0 + COALESCE(tokens_cache_read,0)*0.30
                       + COALESCE(tokens_cache_write,0)*3.75 + COALESCE(tokens_out,0)*15.0
                    ELSE COALESCE(tokens_used,0)*4.80 END) / 1000000.0 AS cost_usd
    FROM messages
    WHERE created_at::date BETWEEN v_from AND v_to
    GROUP BY created_at::date
  ),
  ml AS (
    SELECT COALESCE(answered_at, created_at)::date AS d,
           COALESCE(sum(tokens_used),0)::int AS tokens,
           COALESCE(sum(tokens_in),0)::int  AS tok_in,
           COALESCE(sum(tokens_out),0)::int AS tok_out,
           sum(CASE WHEN tokens_in IS NOT NULL OR tokens_out IS NOT NULL
                    THEN COALESCE(tokens_in,0)*5.0 + COALESCE(tokens_out,0)*25.0
                    ELSE COALESCE(tokens_used,0)*8.00 END) / 1000000.0 AS cost_usd
    FROM marketplace_questions
    WHERE (tokens_used IS NOT NULL OR tokens_in IS NOT NULL)
      AND COALESCE(answered_at, created_at)::date BETWEEN v_from AND v_to
    GROUP BY COALESCE(answered_at, created_at)::date
  ),
  days AS (
    SELECT d FROM conv UNION SELECT d FROM msg UNION SELECT d FROM ml
  )
  INSERT INTO public.analytics_daily AS a (
    id, date, total_conversations, total_messages, avg_response_time_ms,
    avg_messages_per_conversation, resolution_rate, escalation_rate,
    sentiment_positive, sentiment_neutral, sentiment_negative,
    top_categories, top_products_asked,
    total_tokens_used, total_tokens_in, total_tokens_out,
    estimated_cost, estimated_cost_brl, created_at
  )
  SELECT
    gen_random_uuid(), days.d,
    COALESCE(conv.total_conversations, 0),
    COALESCE(msg.total_messages, 0),
    COALESCE(msg.avg_rt, 0),
    CASE WHEN COALESCE(conv.total_conversations,0) > 0
         THEN round(COALESCE(msg.total_messages,0)::numeric / conv.total_conversations, 2) ELSE 0 END,
    CASE WHEN COALESCE(conv.total_conversations,0) > 0
         THEN round(100.0 * conv.resolved_cnt / conv.total_conversations, 1) ELSE 0 END,
    CASE WHEN COALESCE(conv.total_conversations,0) > 0
         THEN round(100.0 * conv.escalated_cnt / conv.total_conversations, 1) ELSE 0 END,
    COALESCE(conv.s_pos, 0), COALESCE(conv.s_neu, 0), COALESCE(conv.s_neg, 0),
    COALESCE(cat.top_categories, '{}'::jsonb),
    COALESCE(prod.top_products_asked, '{}'::jsonb),
    (COALESCE(msg.tokens,0)  + COALESCE(ml.tokens,0)),
    (COALESCE(msg.tok_in,0)  + COALESCE(ml.tok_in,0)),
    (COALESCE(msg.tok_out,0) + COALESCE(ml.tok_out,0)),
    round((COALESCE(msg.cost_usd,0) + COALESCE(ml.cost_usd,0))::numeric, 4),
    round(((COALESCE(msg.cost_usd,0) + COALESCE(ml.cost_usd,0)) * v_fx)::numeric, 4),
    now()
  FROM days
  LEFT JOIN conv ON conv.d = days.d
  LEFT JOIN cat  ON cat.d  = days.d
  LEFT JOIN prod ON prod.d = days.d
  LEFT JOIN msg  ON msg.d  = days.d
  LEFT JOIN ml   ON ml.d   = days.d
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
    total_tokens_in = EXCLUDED.total_tokens_in,
    total_tokens_out = EXCLUDED.total_tokens_out,
    estimated_cost = EXCLUDED.estimated_cost,
    estimated_cost_brl = EXCLUDED.estimated_cost_brl;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
