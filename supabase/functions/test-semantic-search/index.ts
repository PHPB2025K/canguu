import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { query } = await req.json()
  if (!query) return jsonResponse({ error: 'missing query' })

  const key = Deno.env.get('OPENAI_API_KEY')!
  const embRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  })
  const embData = await embRes.json()
  const embedding = embData.data[0].embedding

  const { data, error } = await supabase.rpc('search_products_semantic', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.3,
    match_count: 3,
  })

  return jsonResponse({ query, results: data, error: error?.message })
})
