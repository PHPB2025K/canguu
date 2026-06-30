// classify-pending-sentiment — Enriquece metadados de conversas: sentimento, categoria e produtos consultados.
//
// Por quê: sentimento, categoria e "produto consultado" só eram gravados (ou nem isso) em alguns caminhos
// do process-message — o Analytics saía com Sentimento, Top Categorias e Top Produtos incompletos/vazios.
//
// DESACOPLADA do fluxo de resposta da Ana (NÃO toca process-message): pega conversas com sentiment,
// category OU products_asked nulos e preenche só o que falta (nunca sobrescreve o que a Ana já gravou):
//   - sentiment / category : classificador Claude Haiku (mesmo do process-message)
//   - products_asked        : busca semântica em PRODUTOS-BASE/família (mesmo motor do buildContext:
//                             OpenAI embedding + RPC search_products_semantic), threshold p/ precisão.
// Roda via cron (backfill + contínuo). Protegida por ?key=IG_VERIFY_TOKEN. Deploy --no-verify-jwt.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { classifyIntent } from '../_shared/intent-classifier.ts'
import { searchProductsEnriched } from '../_shared/embeddings.ts'

const KEY = Deno.env.get('IG_VERIFY_TOKEN')
const BATCH = 12 // por rodada (cada conversa pode fazer até 2 chamadas de API; cabe no limite do edge)
const PRODUCT_SIM_THRESHOLD = 0.35 // busca em produtos-base (família, sem variante de cor)

// classificador retorna positive|negative|neutral; DB usa positivo|neutro|negativo
function mapSentimentToDb(s: string): string {
  if (s === 'positive') return 'positivo'
  if (s === 'negative') return 'negativo'
  return 'neutro'
}

// intenção (EN) -> categoria (PT). 'other'/desconhecido -> 'outro' (nunca null, p/ não re-selecionar em loop)
function mapIntentionToCategory(intention: string): string {
  const map: Record<string, string> = {
    pre_sale: 'pre_venda', post_sale: 'pos_venda', complaint: 'reclamacao',
    faq: 'duvida', product_inquiry: 'pre_venda', order_status: 'pos_venda',
    greeting: 'duvida', farewell: 'duvida', human_request: 'reclamacao',
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

  // conversas com sentiment, category OU products_asked nulos, mais recentes primeiro
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, sentiment, category, products_asked, customers(name)')
    .or('sentiment.is.null,category.is.null,products_asked.is.null')
    .order('created_at', { ascending: false })
    .limit(BATCH)

  if (error) return jsonResponse({ ok: false, error: error.message }, 500)
  if (!convs || convs.length === 0) {
    return jsonResponse({ ok: true, processed: 0, skipped: 0, remaining: 0 })
  }

  let processed = 0
  let skipped = 0

  for (const c of convs) {
    const row = c as {
      id: string
      sentiment: string | null
      category: string | null
      products_asked: string[] | null
      customers?: { name?: string }
    }

    const { data: msgs } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('conversation_id', row.id)
      .order('created_at', { ascending: true })
      .limit(40)

    const history = (msgs ?? [])
      .filter((m) => ((m.content as string | null) ?? '').trim().length > 0)
      .map((m) => ({ role: m.sender === 'customer' ? 'customer' : 'agent', content: m.content as string }))

    const customerMsgs = history.filter((m) => m.role === 'customer')
    if (customerMsgs.length === 0) {
      skipped++ // sem texto do cliente -> não dá pra classificar nem detectar produto
      continue
    }

    const patch: { sentiment?: string; category?: string; products_asked?: string[] } = {}

    // sentimento + categoria: só chama o LLM se algum dos dois ainda falta
    if (row.sentiment == null || row.category == null) {
      try {
        const { classification } = await classifyIntent(
          customerMsgs[customerMsgs.length - 1].content,
          history,
          row.customers?.name ?? null,
        )
        if (row.sentiment == null) patch.sentiment = mapSentimentToDb(classification.sentiment)
        if (row.category == null) patch.category = mapIntentionToCategory(classification.intention)
      } catch (_e) {
        // segue mesmo assim; ainda tenta detectar produtos
      }
    }

    // produtos consultados: busca semântica em PRODUTOS-BASE (família, sem variante de cor)
    // sobre o texto do cliente. Top 2 famílias por conversa.
    if (row.products_asked == null) {
      const query = customerMsgs.map((m) => m.content).join('  ').slice(0, 2000)
      let names: string[] = []
      try {
        const matches = await searchProductsEnriched(query, 2, PRODUCT_SIM_THRESHOLD)
        names = [...new Set(
          matches.map((m) => m.name).filter((n): n is string => !!n && n.trim().length > 0),
        )]
      } catch (_e) {
        names = []
      }
      patch.products_asked = names // [] se nada casou -> não fica null -> não re-processa
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from('conversations').update(patch).eq('id', row.id)
      processed++
    } else {
      skipped++
    }
  }

  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .or('sentiment.is.null,category.is.null,products_asked.is.null')

  return jsonResponse({ ok: true, processed, skipped, remaining: count ?? 0 })
})
