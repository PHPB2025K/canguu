// classify-pending-sentiment — Classifica sentimento E categoria de conversas que ficaram SEM (null).
//
// Por quê: sentimento e categoria só são gravados em alguns caminhos do process-message (e não no
// Instagram, nem quando a Ana está em handoff/escalada), então boa parte das conversas ficava sem
// um ou outro — e o Analytics saía com gráfico de sentimento e Top Categorias incompletos.
//
// DESACOPLADA do fluxo de resposta da Ana (NÃO toca process-message): pega conversas com sentiment
// OU category nulos, reusa o mesmo classificador (Claude Haiku) sobre as mensagens e preenche só os
// campos que estão nulos (nunca sobrescreve o que a Ana já classificou). Roda via cron (backfill +
// contínuo). Protegida por ?key=IG_VERIFY_TOKEN. Deploy --no-verify-jwt (ver config.toml).
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { classifyIntent } from '../_shared/intent-classifier.ts'

const KEY = Deno.env.get('IG_VERIFY_TOKEN')
const BATCH = 15 // por rodada (Haiku é rápido; cabe no limite de tempo do edge)

// classificador retorna positive|negative|neutral; DB usa positivo|neutro|negativo
function mapSentimentToDb(s: string): string {
  if (s === 'positive') return 'positivo'
  if (s === 'negative') return 'negativo'
  return 'neutro'
}

// intenção (EN) -> categoria (PT). Mesmo mapa do process-message; 'other'/desconhecido -> 'outro'
// (nunca null, pra não re-selecionar a mesma conversa em loop a cada rodada do cron).
function mapIntentionToCategory(intention: string): string {
  const map: Record<string, string> = {
    pre_sale: 'pre_venda',
    post_sale: 'pos_venda',
    complaint: 'reclamacao',
    faq: 'duvida',
    product_inquiry: 'pre_venda',
    order_status: 'pos_venda',
    greeting: 'duvida',
    farewell: 'duvida',
    human_request: 'reclamacao',
  }
  return map[intention] ?? 'outro'
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const u = new URL(req.url)
  if (!KEY || u.searchParams.get('key') !== KEY) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403)
  }

  // conversas sem sentimento OU sem categoria, mais recentes primeiro
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, sentiment, category, customers(name)')
    .or('sentiment.is.null,category.is.null')
    .order('created_at', { ascending: false })
    .limit(BATCH)

  if (error) return jsonResponse({ ok: false, error: error.message }, 500)
  if (!convs || convs.length === 0) {
    return jsonResponse({ ok: true, processed: 0, skipped: 0, remaining: 0 })
  }

  let processed = 0
  let skipped = 0

  for (const c of convs) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: true })
      .limit(40)

    const history = (msgs ?? [])
      .filter((m) => ((m.content as string | null) ?? '').trim().length > 0)
      .map((m) => ({
        role: m.sender === 'customer' ? 'customer' : 'agent',
        content: m.content as string,
      }))

    // precisa de pelo menos uma mensagem de texto do cliente pra classificar
    const lastCustomer = [...history].reverse().find((m) => m.role === 'customer')
    if (!lastCustomer) {
      skipped++
      continue
    }

    const row = c as { sentiment: string | null; category: string | null; customers?: { name?: string } }
    const customerName = row.customers?.name ?? null

    try {
      const { classification } = await classifyIntent(lastCustomer.content, history, customerName)
      // preenche só o que está nulo — nunca sobrescreve o que a Ana já gravou
      const patch: { sentiment?: string; category?: string } = {}
      if (row.sentiment == null) patch.sentiment = mapSentimentToDb(classification.sentiment)
      if (row.category == null) patch.category = mapIntentionToCategory(classification.intention)

      if (Object.keys(patch).length > 0) {
        await supabase.from('conversations').update(patch).eq('id', c.id)
        processed++
      } else {
        skipped++
      }
    } catch (_e) {
      // falha pontual de uma conversa não derruba a rodada
      skipped++
    }
  }

  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .or('sentiment.is.null,category.is.null')

  return jsonResponse({ ok: true, processed, skipped, remaining: count ?? 0 })
})
