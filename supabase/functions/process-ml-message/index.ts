// =================================================================
// PROCESS-ML-MESSAGE — AI response for Mercado Livre post-sale chat
// =================================================================
// Called by N8N workflow when a new ML chat message needs AI processing.
//
// Pipeline:
//   1. Receive and validate request
//   2. Match ML item to internal product
//   3. Load product data, policies, FAQs
//   4. Check escalation conditions (keywords, sentiment)
//   5. Build ML-specific prompt with post-sale rules
//   6. Generate response (Claude Sonnet)
//   7. Validate (max 500 chars, no links, no platform mentions)
//   8. Return answer for N8N to post via ML API
//
// DOES NOT send message to ML — returns JSON for N8N.
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { getConfig } from '../_shared/config.ts'
import { callAnthropic, extractText, getTokensUsed } from '../_shared/anthropic.ts'
import { matchMLItemToProduct } from '../_shared/ml-product-matcher.ts'
import { validateMLMessageResponse } from '../_shared/ml-response-validator.ts'

interface ChatHistoryEntry {
  role: string
  content: string
  created_at: string
}

interface MLMessageRequest {
  order_id: string
  pack_id: string
  message_text: string
  buyer_nickname: string
  buyer_id: number
  item_id: string
  item_title: string
  seller_id: string
  chat_history: ChatHistoryEntry[]
}

// Keywords that trigger escalation in post-sale context
const ESCALATION_KEYWORDS = [
  'defeito', 'quebrado', 'quebrou', 'danificado', 'devolver', 'devolucao',
  'devolução', 'reembolso', 'estorno', 'reclamacao', 'reclamação',
  'procon', 'advogado', 'processo', 'justica', 'justiça', 'reclameaqui',
  'reclame aqui', 'falar com', 'gerente', 'supervisor', 'responsavel',
  'responsável', 'nunca mais', 'pior compra', 'golpe', 'fraude',
]

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'process-ml-message', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'method_not_allowed' }, 405)
    }

    const body = await req.json() as MLMessageRequest

    if (!body.message_text || !body.pack_id) {
      return jsonResponse({ success: false, error: 'missing_fields: message_text, pack_id required' }, 400)
    }

    const startTime = Date.now()

    log('received', {
      order_id: body.order_id,
      pack_id: body.pack_id,
      buyer: body.buyer_nickname,
      history_count: body.chat_history?.length ?? 0,
    })

    // ─── STEP 1: LOAD CONFIG ──────────────────────────────────────
    const config = await getConfig()

    // ─── STEP 2: CHECK ESCALATION ─────────────────────────────────
    const escalation = checkMLEscalation(body.message_text, body.chat_history ?? [])

    if (escalation.shouldEscalate) {
      log('escalating', { reason: escalation.reason, urgency: escalation.urgency })

      return jsonResponse({
        success: true,
        answer_text: null,
        escalated: true,
        escalation_reason: escalation.reason,
        escalation_urgency: escalation.urgency,
        product_matched: false,
        tokens_used: 0,
        response_time_ms: Date.now() - startTime,
      })
    }

    // ─── STEP 3: MATCH PRODUCT ────────────────────────────────────
    const match = await matchMLItemToProduct(body.item_id, body.item_title)

    let productContext = ''
    const productMatched = match.products.length > 0

    if (productMatched) {
      const productIds = match.products.map(p => p.productId)
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, short_description, differentials, material')
        .in('id', productIds)

      if (products && products.length > 0) {
        if (match.isKit && products.length > 1) {
          const lines = [`Kit com ${products.length} produtos:`]
          for (const product of products) {
            lines.push(`- ${product.name} (${product.sku})${product.material ? ' — ' + product.material : ''}`)
          }
          productContext = lines.join('\n')
        } else {
          const product = products[0]
          const lines = [`Produto: ${product.name} (SKU: ${product.sku})`]
          if (product.material) lines.push(`Material: ${product.material}`)
          if (product.short_description) lines.push(`Descricao: ${product.short_description}`)
          if (product.differentials) lines.push(`Diferenciais: ${product.differentials}`)
          productContext = lines.join('\n')
        }
      }
    } else {
      productContext = `Produto do pedido: ${body.item_title}`
    }

    // ─── STEP 4: LOAD POLICIES + FAQs ────────────────────────────
    const [policiesResult, faqsResult] = await Promise.all([
      supabase
        .from('policies')
        .select('title, category, summary, content')
        .eq('is_active', true)
        .order('priority', { ascending: false }),

      supabase
        .from('faq')
        .select('question, answer, category')
        .eq('is_active', true)
        .order('usage_count', { ascending: false })
        .limit(5),
    ])

    const policies = policiesResult.data ?? []
    const faqs = faqsResult.data ?? []

    // ─── STEP 5: BUILD PROMPT ─────────────────────────────────────
    const systemPrompt = buildMLMessageSystemPrompt(config.systemPrompt)
    const userMessage = buildMLMessageUserMessage(body, productContext, policies, faqs)

    // ─── STEP 6: GENERATE RESPONSE ───────────────────────────────
    const response = await callAnthropic({
      model: config.model,
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 400,
      temperature: config.temperature,
    })

    const rawAnswer = extractText(response)
    const tokensUsed = getTokensUsed(response)

    // ─── STEP 7: VALIDATE ─────────────────────────────────────────
    const validated = validateMLMessageResponse(rawAnswer)

    if (validated.warnings.length > 0) {
      log('validation_warnings', { warnings: validated.warnings })
    }

    const responseTimeMs = Date.now() - startTime

    log('completed', {
      order_id: body.order_id,
      product_matched: productMatched,
      tokensUsed,
      responseTimeMs,
      charCount: validated.charCount,
    })

    // ─── STEP 8: RETURN ───────────────────────────────────────────
    return jsonResponse({
      success: true,
      answer_text: validated.text,
      escalated: false,
      escalation_reason: null,
      escalation_urgency: null,
      product_matched: productMatched,
      tokens_used: tokensUsed,
      response_time_ms: responseTimeMs,
      model: config.model,
      warnings: validated.warnings,
    })

  } catch (err) {
    log('error', { error: String(err), stack: (err as Error).stack })
    return jsonResponse({ success: false, error: String(err) }, 500)
  }
})

// =================================================================
// ESCALATION
// =================================================================

function checkMLEscalation(
  messageText: string,
  chatHistory: ChatHistoryEntry[],
): { shouldEscalate: boolean; reason: string; urgency: string } {
  const msgLower = messageText.toLowerCase()

  // Check escalation keywords in current message
  const matchedKeyword = ESCALATION_KEYWORDS.find(kw => msgLower.includes(kw))
  if (matchedKeyword) {
    const isLegal = ['procon', 'advogado', 'processo', 'justica', 'justiça', 'reclameaqui', 'reclame aqui'].includes(matchedKeyword)
    return {
      shouldEscalate: true,
      reason: `Palavra-chave detectada: "${matchedKeyword}"`,
      urgency: isLegal ? 'urgente' : 'alta',
    }
  }

  // Check for human request
  const humanPatterns = ['falar com', 'gerente', 'supervisor', 'responsavel', 'responsável', 'atendente', 'pessoa']
  const wantsHuman = humanPatterns.some(p => msgLower.includes(p))
  if (wantsHuman) {
    return {
      shouldEscalate: true,
      reason: 'Comprador solicitou atendimento humano',
      urgency: 'alta',
    }
  }

  // Check for 3+ consecutive negative buyer messages
  const recentBuyerMsgs = chatHistory
    .filter(m => m.role === 'buyer')
    .slice(-3)

  if (recentBuyerMsgs.length >= 3) {
    const negativePatterns = ['nao', 'não', 'problema', 'errado', 'ruim', 'pessimo', 'péssimo', 'horrivel', 'horrível', 'insatisf']
    const allNegative = recentBuyerMsgs.every(m => {
      const lower = m.content.toLowerCase()
      return negativePatterns.some(p => lower.includes(p))
    })

    if (allNegative) {
      return {
        shouldEscalate: true,
        reason: '3+ mensagens consecutivas negativas do comprador',
        urgency: 'alta',
      }
    }
  }

  return { shouldEscalate: false, reason: '', urgency: 'normal' }
}

// =================================================================
// PROMPT BUILDERS
// =================================================================

function buildMLMessageSystemPrompt(basePrompt: string): string {
  return `${basePrompt}

## REGRAS PARA MENSAGENS POS-VENDA NO MERCADO LIVRE

Voce esta respondendo uma mensagem PRIVADA de pos-venda no Mercado Livre.
So o comprador e o vendedor veem.

1. MAXIMO 500 caracteres.
2. Permitido: 1-2 emojis se adequado ao tom.
3. PROIBIDO: links externos, telefones, emails, WhatsApp.
4. PROIBIDO: mencionar outras plataformas (Shopee, Amazon, site proprio).
5. PROIBIDO: inventar informacoes sobre o pedido (rastreamento, prazo exato).
6. Foco em RESOLVER o problema do comprador.
7. Se nao pode resolver (devolucao, reembolso, defeito): diga que vai encaminhar para resolucao e use tom empatico.
8. NAO use o separador \\\\ — resposta e texto unico.
9. Consulte as POLITICAS no contexto para informar sobre troca/devolucao.
10. NAO use formatacao WhatsApp (*negrito*, _italico_) — resposta e texto puro.
11. Se o comprador perguntar sobre rastreamento/entrega: oriente a verificar pelo app do Mercado Livre, secao "Minhas Compras".`
}

function buildMLMessageUserMessage(
  body: MLMessageRequest,
  productContext: string,
  policies: Array<{ title: string; category: string; summary: string | null; content: string }>,
  faqs: Array<{ question: string; answer: string; category: string | null }>,
): string {
  const sections: string[] = []

  sections.push(`## Produto do Pedido\n${productContext}`)
  sections.push(`## Informacoes do Pedido\n- ID do Pedido: ${body.order_id}\n- Comprador: ${body.buyer_nickname}`)

  if (policies.length > 0) {
    const policyLines = policies.map(p => `- ${p.title} [${p.category}]: ${p.summary ?? p.content}`).join('\n')
    sections.push(`## Politicas da Budamix\n${policyLines}`)
  }

  if (faqs.length > 0) {
    const faqLines = faqs.map(f => `- P: ${f.question}\n  R: ${f.answer}`).join('\n\n')
    sections.push(`## Perguntas Frequentes\n${faqLines}`)
  }

  // Chat history (last 10 messages)
  const history = (body.chat_history ?? []).slice(-10)
  if (history.length > 0) {
    const historyLines = history.map(m => {
      const label = m.role === 'buyer' ? '[COMPRADOR]' : '[VENDEDOR]'
      return `${label}: ${m.content}`
    })
    sections.push(`## Historico do Chat\n${historyLines.join('\n')}`)
  }

  sections.push(`## Mensagem Atual do Comprador\n${body.message_text}`)

  sections.push(`Responda a mensagem acima como Ana, seguindo TODAS as regras para pos-venda no Mercado Livre. Maximo 500 caracteres. Texto puro.`)

  return sections.join('\n\n')
}
