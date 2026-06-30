// classify-pending-sentiment — SATISFAÇÃO FINAL (Opção B) + categoria + Top Produtos
// =============================================================================
// Enriquece metadados de conversas para o Analytics, DESACOPLADO do atendimento
// da Ana (NÃO toca process-message). Roda via cron horário. Protegida por ?key=.
//
//   • SATISFAÇÃO FINAL (sentiment + satisfaction_score 1-5): só em conversa
//     ENCERRADA (status 'resolved' OU 24h sem mensagem do cliente), avaliando a
//     conversa INTEIRA e o DESFECHO — não a última mensagem. 4 níveis:
//     positivo/neutro/negativo/critico (régua dedicada, Claude Haiku).
//     Conversa ainda ativa fica SEM sentimento ("Em andamento").
//   • categoria: classificador de intenção (Haiku); preenche se faltar (ativa ou fechada).
//   • products_asked: busca semântica em produtos-base (OpenAI embedding + RPC), Top 2.
//
// Idempotente: satisfaction_score é o marcador do sentimento (gravado 1x, quando a
// conversa encerra; nunca reclassifica). category/products usam 'outro'/[] como
// fallback (nunca null) pra não re-selecionar em loop.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { classifyIntent } from '../_shared/intent-classifier.ts'
import { callAnthropic, extractText } from '../_shared/anthropic.ts'
import { searchProductsEnriched } from '../_shared/embeddings.ts'

const KEY = Deno.env.get('IG_VERIFY_TOKEN')
const BATCH = 12 // por rodada (cada conversa faz até 2 chamadas de API; cabe no limite do edge)
const PRODUCT_SIM_THRESHOLD = 0.35 // busca em produtos-base (família, sem variante de cor)
const DAY_MS = 24 * 60 * 60 * 1000
const SAT_MODEL = 'claude-haiku-4-5-20251001'

// ─── RÉGUA DE SATISFAÇÃO FINAL (Opção B — o coração) ─────────────────────────
const RUBRIC = `Você avalia a SATISFAÇÃO FINAL do cliente numa conversa de atendimento JÁ ENCERRADA da Budamix (marca brasileira de utilidades domésticas — potes, canecas, jarras, kits de vidro/porcelana). A atendente virtual se chama Ana.

Leia a conversa INTEIRA e julgue o DESFECHO — como ela TERMINOU para o cliente. Não classifique pela última mensagem isolada.

Retorne SOMENTE um JSON:
{
  "satisfacao": "positivo|neutro|negativo|critico",
  "categoria": "pre_venda|pos_venda|reclamacao|duvida|outro",
  "motivo": "uma frase curta em português explicando o desfecho"
}

═══ COMO CLASSIFICAR A SATISFAÇÃO ═══
• "positivo": o cliente terminou SATISFEITO. Problema resolvido, dúvida bem esclarecida e o cliente reagiu bem, comprou, fechou pedido, ou agradeceu de verdade / demonstrou contentamento.
• "neutro": encerrou MORNO, sem carga emocional clara. Dúvida respondida de forma objetiva, ou o cliente sumiu depois de uma resposta adequada — sem reclamar e sem comemorar.
• "negativo": o cliente terminou INSATISFEITO. O problema NÃO foi resolvido, a resposta não ajudou, ele demonstrou frustração/irritação, ou desistiu da compra por algo que a Budamix poderia ter resolvido.
• "critico": caso GRAVE que precisa de atenção imediata da gestão. Use SE: produto quebrado/com defeito/errado/faltando sem solução; pedido que não chegou e não foi resolvido; reembolso/estorno exigido e não atendido; cliente furioso ou ofensivo; OU qualquer menção a Procon, advogado, processo, "vou processar", Reclame Aqui ou direitos do consumidor.

═══ REGRAS DE JULGAMENTO ═══
1. Um problema SÉRIO que apareceu e NÃO foi resolvido até o fim = negativo ou critico — mesmo que o cliente tenha mandado um "obrigado" final por educação. Não deixe a cortesia mascarar problema sem solução.
2. Cliente que sumiu no meio sem desfecho claro = neutro (a não ser que já tivesse demonstrado insatisfação clara antes de sumir → negativo).
3. "critico" é só pra caso grave / risco / ação legal. Irritação leve ou dúvida não atendida = negativo, NÃO critico.
4. Na dúvida entre dois níveis, escolha o PIOR (mais conservador). É melhor sinalizar a mais para a gestão olhar.
5. "categoria": o assunto PRINCIPAL da conversa. pre_venda = antes de comprar; pos_venda = depois da compra (entrega, rastreio, uso); reclamacao = problema/insatisfação; duvida = dúvida geral; outro = não se encaixa.

Responda SOMENTE com o JSON, sem markdown, sem explicação fora dele.`

// nível → nota 1-5 (determinístico; satisfaction_score tem CHECK 1..5)
function scoreFor(s: string): number {
  if (s === 'positivo') return 5
  if (s === 'neutro') return 3
  if (s === 'negativo') return 2
  return 1 // critico
}

const VALID_SENT = ['positivo', 'neutro', 'negativo', 'critico']
const VALID_CAT = ['pre_venda', 'pos_venda', 'reclamacao', 'duvida', 'outro']

function parseSat(text: string): { satisfacao: string; categoria: string } {
  let raw: Record<string, unknown> = {}
  try { raw = JSON.parse(text) } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { raw = JSON.parse(m[0]) } catch { /* noop */ } }
  }
  return {
    satisfacao: VALID_SENT.includes(raw.satisfacao as string) ? (raw.satisfacao as string) : 'neutro',
    categoria: VALID_CAT.includes(raw.categoria as string) ? (raw.categoria as string) : 'outro',
  }
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

// conversa "encerrada": resolvida OU 24h sem mensagem do cliente
function isClosed(status: string | null, lastMsgAt: string | null, createdAt: string, now: number): boolean {
  if (status === 'resolved') return true
  const ref = lastMsgAt ?? createdAt
  return ref ? (now - new Date(ref).getTime()) > DAY_MS : false
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const u = new URL(req.url)
  if (!KEY || u.searchParams.get('key') !== KEY) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403)
  }

  // conversas que ainda faltam: sem nota de satisfação (marcador da Opção B), sem
  // categoria, OU sem products_asked. Mais recentes primeiro.
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, status, sentiment, category, satisfaction_score, products_asked, last_customer_message_at, created_at, customers(name)')
    .or('satisfaction_score.is.null,category.is.null,products_asked.is.null')
    .order('created_at', { ascending: false })
    .limit(BATCH)

  if (error) return jsonResponse({ ok: false, error: error.message }, 500)
  if (!convs || convs.length === 0) {
    return jsonResponse({ ok: true, processed: 0, skipped: 0, remaining: 0 })
  }

  const now = Date.now()
  let processed = 0
  let skipped = 0

  for (const c of convs) {
    const row = c as {
      id: string
      status: string | null
      sentiment: string | null
      category: string | null
      satisfaction_score: number | null
      products_asked: string[] | null
      last_customer_message_at: string | null
      created_at: string
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

    const closed = isClosed(row.status, row.last_customer_message_at, row.created_at, now)
    const needsSentiment = closed && row.satisfaction_score == null
    let needsCategory = row.category == null
    const needsProducts = row.products_asked == null

    const patch: { sentiment?: string; satisfaction_score?: number; category?: string; products_asked?: string[] } = {}

    // SATISFAÇÃO FINAL (Opção B): só conversa ENCERRADA, lendo a conversa inteira.
    if (needsSentiment) {
      try {
        const transcript = history
          .map((m) => `[${m.role === 'customer' ? 'CLIENTE' : 'ANA'}]: ${m.content}`)
          .join('\n')
        const resp = await callAnthropic({
          model: SAT_MODEL,
          systemPrompt: RUBRIC,
          messages: [{ role: 'user', content: `Cliente: ${row.customers?.name ?? 'Desconhecido'}\n\nConversa encerrada (avalie o desfecho):\n${transcript}` }],
          maxTokens: 200,
          temperature: 0.1,
        })
        const { satisfacao, categoria } = parseSat(extractText(resp))
        patch.sentiment = satisfacao
        patch.satisfaction_score = scoreFor(satisfacao)
        if (needsCategory) { patch.category = categoria; needsCategory = false } // reusa a categoria da régua
      } catch (_e) {
        // falha pontual não derruba a conversa; ainda tenta categoria/produtos
      }
    }

    // categoria (conversa ainda ATIVA, sem categoria): classificador de intenção
    if (needsCategory) {
      try {
        const { classification } = await classifyIntent(
          customerMsgs[customerMsgs.length - 1].content,
          history,
          row.customers?.name ?? null,
        )
        patch.category = mapIntentionToCategory(classification.intention)
      } catch (_e) {
        // segue mesmo assim
      }
    }

    // produtos consultados: busca semântica em PRODUTOS-BASE (família). Top 2.
    if (needsProducts) {
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
      const { error: upErr } = await supabase.from('conversations').update(patch).eq('id', row.id)
      if (upErr) { skipped++ } else { processed++ }
    } else {
      skipped++
    }
  }

  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .or('satisfaction_score.is.null,category.is.null,products_asked.is.null')

  return jsonResponse({ ok: true, processed, skipped, remaining: count ?? 0 })
})
