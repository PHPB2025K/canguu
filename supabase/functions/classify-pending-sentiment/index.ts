// classify-pending-sentiment — Classifica o sentimento de conversas que ficaram SEM (null).
//
// Por quê: o sentimento só é gravado em alguns caminhos do process-message (e não no
// Instagram, nem quando a Ana está em handoff/escalada), então ~38% das conversas ficavam
// sem sentimento e o gráfico do Analytics saía incompleto.
//
// Esta função é DESACOPLADA do fluxo de resposta da Ana (NÃO toca process-message): pega
// conversas com sentiment NULL, reusa o mesmo classificador (Claude Haiku) sobre as
// mensagens da conversa e grava só o campo sentiment. Roda via cron (backfill + contínuo).
// Protegida por ?key=IG_VERIFY_TOKEN. Deploy --no-verify-jwt (ver config.toml).
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

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const u = new URL(req.url)
  if (!KEY || u.searchParams.get('key') !== KEY) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403)
  }

  // conversas sem sentimento, mais recentes primeiro
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, customers(name)')
    .is('sentiment', null)
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

    const customerName = (c as { customers?: { name?: string } }).customers?.name ?? null

    try {
      const { classification } = await classifyIntent(lastCustomer.content, history, customerName)
      await supabase
        .from('conversations')
        .update({ sentiment: mapSentimentToDb(classification.sentiment) })
        .eq('id', c.id)
      processed++
    } catch (_e) {
      // falha pontual de uma conversa não derruba a rodada
      skipped++
    }
  }

  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .is('sentiment', null)

  return jsonResponse({ ok: true, processed, skipped, remaining: count ?? 0 })
})
