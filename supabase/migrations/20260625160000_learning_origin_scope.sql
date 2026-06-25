-- Base ÚNICA de aprendizado: origem + escopo (canais) + categoria, e retrieval ciente de escopo.
-- Convenção: scope '{all}' é canônico para "todos os canais" (não taguear os 3 canais juntos).

ALTER TABLE public.response_corrections
  ADD COLUMN IF NOT EXISTS origin_channel text,
  ADD COLUMN IF NOT EXISTS scope text[] NOT NULL DEFAULT '{all}',
  ADD COLUMN IF NOT EXISTS category text;

-- Backfill: preserva o comportamento atual (valem em todos os canais) + origem inferida
UPDATE public.response_corrections
SET scope = '{all}',
    origin_channel = CASE WHEN product_sku LIKE 'MLB%' THEN 'mercado_livre' ELSE 'whatsapp' END
WHERE origin_channel IS NULL;

CREATE INDEX IF NOT EXISTS idx_response_corrections_scope ON public.response_corrections USING gin (scope);

-- search_corrections ciente de escopo (overload de 4 args; a versão de 3 args
-- segue existindo para dedup channel-agnóstico). channel NULL = sem filtro.
CREATE OR REPLACE FUNCTION public.search_corrections(
  query_embedding vector, match_threshold double precision, match_count integer, p_channel text
)
RETURNS TABLE(id uuid, original_question text, recommended_response text, product_sku text, similarity double precision)
LANGUAGE sql STABLE AS $fn$
  SELECT rc.id, rc.original_question, rc.recommended_response, rc.product_sku,
         1 - (rc.embedding <=> query_embedding) AS similarity
  FROM public.response_corrections rc
  WHERE rc.status = 'processed' AND rc.embedding IS NOT NULL
    AND (p_channel IS NULL OR rc.scope @> ARRAY['all']::text[] OR rc.scope @> ARRAY[p_channel]::text[])
    AND 1 - (rc.embedding <=> query_embedding) > match_threshold
  ORDER BY rc.embedding <=> query_embedding
  LIMIT match_count;
$fn$;
