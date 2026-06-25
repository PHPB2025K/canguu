// =================================================================
// PROCESS-ML-QUESTION — AI response for Mercado Livre pre-sale questions
// =================================================================
// Called by N8N workflow when a new ML question needs AI processing.
//
// Pipeline:
//   1. Receive and validate request
//   2. Check if ML item is active (skip if inactive)
//   3. Match ML item to internal product (mapping + semantic fallback)
//   4. Load product data, policies, FAQs
//   5. Build ML-specific prompt with question rules
//   6. Generate response (Claude Sonnet)
//   7. Validate (no emojis, no links, max 350 chars)
//   8. Return answer for N8N to post via ML API
//
// DOES NOT post answer to ML — returns JSON for N8N.
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { getConfig } from '../_shared/config.ts'
import { callAnthropic, extractText, getTokensUsed } from '../_shared/anthropic.ts'
import { matchMLItemToProduct } from '../_shared/ml-product-matcher.ts'
import { getItem } from '../_shared/ml-api-client.ts'
import { searchProducts, generateEmbedding } from '../_shared/embeddings.ts'
import { validateMLQuestionResponse } from '../_shared/ml-response-validator.ts'

interface MLQuestionRequest {
  question_id: number
  item_id: string
  question_text: string
  buyer_nickname: string
  item_title: string
  seller_id: string
}

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'process-ml-question', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'method_not_allowed' }, 405)
    }

    const body = await req.json() as MLQuestionRequest

    if (!body.question_text || !body.item_id) {
      return jsonResponse({ success: false, error: 'missing_fields: question_text, item_id required' }, 400)
    }

    const startTime = Date.now()

    log('received', {
      question_id: body.question_id,
      item_id: body.item_id,
      buyer: body.buyer_nickname,
    })

    // ─── STEP 1: CHECK ITEM STATUS ────────────────────────────────
    // If the ML item is not active, skip processing to avoid 400 on POST /answers
    try {
      const mlItem = await getItem(body.item_id)
      if (mlItem.status !== 'active') {
        log('item_inactive', { item_id: body.item_id, item_status: mlItem.status })

        // Mark question as skipped in DB
        if (body.question_id) {
          await supabase
            .from('marketplace_questions')
            .update({
              status: 'skipped',
              error_message: `Anúncio inativo no Mercado Livre (status: ${mlItem.status})`,
            })
            .eq('platform_question_id', String(body.question_id))
        }

        return jsonResponse({
          success: false,
          skipped: true,
          reason: 'item_inactive',
          item_status: mlItem.status,
          question_id: body.question_id,
        })
      }
    } catch (itemErr) {
      // If we can't fetch item info, log but continue — don't block the pipeline
      log('item_check_warning', { item_id: body.item_id, error: String(itemErr) })
    }

    // ─── STEP 2: LOAD CONFIG ──────────────────────────────────────
    const config = await getConfig()

    // ─── STEP 3: MATCH PRODUCT ────────────────────────────────────
    const match = await matchMLItemToProduct(body.item_id, body.item_title)

    let productContext = ''
    let crossSellContext = ''
    let productId: string | null = null

    if (match.products.length > 0) {
      productId = match.products[0].productId

      // Load full product data for all matched products
      const productIds = [...new Set(match.products.map(p => p.productId))]
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, price_site, price_marketplace, stock_status, stock_quantity, short_description, full_description, differentials, usage_suggestions, material')
        .in('id', productIds)

      if (products && products.length > 0) {
        if (match.isKit && products.length > 1) {
          // Kit: show all component products
          const kitLines = [`Este anuncio e um KIT contendo ${products.length} produtos:`]
          for (const product of products) {
            const mp = match.products.find(m => m.productId === product.id)
            const qty = mp?.listing.kitQuantity ?? 1
            const lines = [`\n### ${product.name} (SKU: ${product.sku}) — ${qty}x no kit`]
            if (product.material) lines.push(`Material: ${product.material}`)
            if (product.short_description) lines.push(`Descricao: ${product.short_description}`)
            if (product.differentials) lines.push(`Diferenciais: ${product.differentials}`)
            if (product.usage_suggestions) lines.push(`Sugestoes de uso: ${product.usage_suggestions}`)
            kitLines.push(lines.join('\n'))
          }
          kitLines.push(`\nAo responder, mencione que o anuncio inclui todos os itens acima como kit.`)
          productContext = kitLines.join('\n')
        } else {
          // Single product
          const product = products[0]
          const lines = [`Produto: ${product.name} (SKU: ${product.sku})`]
          if (product.price_site) lines.push(`Preco site: R$ ${product.price_site}`)
          if (product.price_marketplace) {
            const mlPrice = (product.price_marketplace as Record<string, number>).mercado_livre
            if (mlPrice) lines.push(`Preco Mercado Livre: R$ ${mlPrice}`)
          }
          lines.push(`Estoque: ${product.stock_status} (${product.stock_quantity} un.)`)
          if (product.material) lines.push(`Material: ${product.material}`)
          if (product.short_description) lines.push(`Descricao: ${product.short_description}`)
          if (product.full_description) lines.push(product.full_description)
          if (product.differentials) lines.push(`Diferenciais: ${product.differentials}`)
          if (product.usage_suggestions) lines.push(`Sugestoes de uso: ${product.usage_suggestions}`)
          productContext = lines.join('\n')
        }
      }

      // Build cross-sell context from related listings on same platform
      if (match.relatedListings.length > 0) {
        const crossLines = match.relatedListings
          .filter(l => l.platformItemId)
          .map(l => `- "${l.listingTitle}" → mercadolivre.com.br/${l.platformItemId}`)
        if (crossLines.length > 0) {
          crossSellContext = crossLines.join('\n')
        }
      }

      log('product_matched', { productId, source: match.source, isKit: match.isKit, productCount: match.products.length, relatedListings: match.relatedListings.length })
    } else {
      // No match — use item title as generic reference
      productContext = `Produto no anuncio: ${body.item_title}\n(Produto nao encontrado no catalogo interno — responda com base no titulo do anuncio)`
      log('product_not_matched', { item_id: body.item_id, item_title: body.item_title })
    }

    // ─── STEP 4: LOAD POLICIES + FAQs ────────────────────────────
    const [policiesResult, faqsResult] = await Promise.all([
      supabase
        .from('policies')
        .select('title, category, summary, content')
        .eq('is_active', true)
        .order('priority', { ascending: false }),

      // Semantic search for relevant FAQs
      searchProducts(body.question_text, 3, 0.3).then(() => {
        // Use FAQ keyword search instead
        const words = body.question_text.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 10)
        if (words.length === 0) return supabase.from('faq').select('question, answer, category').eq('is_active', true).limit(5)
        return supabase.from('faq').select('question, answer, category').eq('is_active', true).overlaps('keywords', words).limit(5)
      }),
    ])

    const policies = policiesResult.data ?? []
    const faqs = faqsResult.data ?? []

    // ─── STEP 5a: SEARCH CORRECTIONS (learned from feedback) ──────
    // Threshold lowered to 0.65 — questions on Mercado Livre vary a lot in
    // surface form ("podem ir ao forno?" vs "uso em forno e microondas?")
    // even when semantically identical. 0.85 was rejecting real matches and
    // letting the LLM fall back to evasive boilerplate ("entre em contato
    // conosco"), which violates ML rules and frustrates buyers.
    let correctionContext = ''
    try {
      const questionEmbedding = await generateEmbedding(body.question_text)
      const { data: corrections } = await supabase.rpc('search_corrections', {
        query_embedding: JSON.stringify(questionEmbedding),
        match_threshold: 0.65,
        match_count: 3,
        p_channel: 'mercado_livre',
      })
      if (corrections && corrections.length > 0) {
        const lines = corrections.map((c: { original_question: string; recommended_response: string; similarity: number }, i: number) =>
          `${i + 1}. Pergunta similar: "${c.original_question}"\n   RESPOSTA APROVADA: "${c.recommended_response}"\n   (similaridade ${(c.similarity * 100).toFixed(0)}%)`
        )
        correctionContext = `\n\n## RESPOSTAS APROVADAS PARA PERGUNTAS SIMILARES (USE OBRIGATORIAMENTE)\n\nUm operador humano JÁ corrigiu como esta pergunta deve ser respondida. Você DEVE usar a resposta aprovada abaixo como base para a sua resposta — adapte só se necessário, mas mantenha o mesmo conteúdo informacional. NUNCA responda com "entre em contato conosco" se há uma resposta aprovada disponível.\n\n${lines.join('\n\n')}`
        log('corrections_found', { count: corrections.length, scores: corrections.map((c: { similarity: number }) => c.similarity) })
      } else {
        log('corrections_none_above_threshold', { threshold: 0.65 })
      }
    } catch (err) {
      log('corrections_search_failed', { error: String(err) })
      // Non-blocking — continue without corrections
    }

    // ─── STEP 5b: BUILD PROMPT ────────────────────────────────────
    const systemPrompt = buildMLQuestionSystemPrompt(config.systemPrompt)
    const userMessage = buildMLQuestionUserMessage(body, productContext, crossSellContext, policies, faqs) + correctionContext

    // ─── STEP 6: GENERATE RESPONSE ───────────────────────────────
    const response = await callAnthropic({
      model: config.model,
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 300,
      temperature: config.temperature,
    })

    const rawAnswer = extractText(response)
    const tokensUsed = getTokensUsed(response)

    // ─── STEP 7: VALIDATE ─────────────────────────────────────────
    let validated = validateMLQuestionResponse(rawAnswer)

    if (validated.warnings.length > 0) {
      log('validation_warnings', { warnings: validated.warnings })
    }

    // HARD GUARD — if the LLM still asked the buyer to reach out
    // off-platform ("entre em contato conosco" etc.), substitute the
    // response. Priority order:
    //   1. Use the top-similarity correction if available.
    //   2. Fall back to a neutral technical phrase that NEVER asks for
    //      external contact.
    // Either way, the original LLM output is logged for audit.
    if (validated.forbiddenContactDetected) {
      log('forbidden_contact_blocked', {
        reasons: validated.forbiddenContactReasons,
        original: rawAnswer.slice(0, 300),
        question_id: body.question_id,
      })

      let substitute = ''
      try {
        const questionEmbedding = await generateEmbedding(body.question_text)
        const { data: corrections } = await supabase.rpc('search_corrections', {
          query_embedding: JSON.stringify(questionEmbedding),
          match_threshold: 0.55, // even more permissive on this fallback
          match_count: 1,
          p_channel: 'mercado_livre',
        })
        if (corrections && corrections.length > 0) {
          substitute = corrections[0].recommended_response as string
          log('forbidden_contact_substituted_by_correction', { similarity: corrections[0].similarity })
        }
      } catch (err) {
        log('forbidden_contact_correction_lookup_failed', { error: String(err) })
      }

      if (!substitute || substitute.trim().length === 0) {
        substitute = 'Boa pergunta! Os detalhes completos desse produto estão nas fotos e na ficha técnica do anúncio — vale dar uma olhada por lá. Posso ajudar em mais alguma coisa?'
        log('forbidden_contact_substituted_by_fallback', {})
      }

      // Re-run the validator on the substitute so it still gets cleaned
      // (length cap, emoji strip, etc.) — and so we don't accidentally
      // ship a substitute that itself contains a forbidden phrase.
      validated = validateMLQuestionResponse(substitute)
      if (validated.forbiddenContactDetected) {
        // Last-resort safety: hardcoded answer that cannot violate.
        validated = {
          text: 'Boa pergunta! Recomendo conferir as fotos e a ficha técnica do anúncio, que trazem os detalhes do produto.',
          warnings: ['hardcoded_safe_fallback'],
          charCount: 108,
        }
      }
    }

    const responseTimeMs = Date.now() - startTime

    log('completed', {
      question_id: body.question_id,
      product_matched: match.products.length > 0,
      product_id: productId,
      is_kit: match.isKit,
      tokensUsed,
      responseTimeMs,
      charCount: validated.charCount,
      warnings: validated.warnings,
    })

    // ─── STEP 8: RETURN ───────────────────────────────────────────
    return jsonResponse({
      success: true,
      answer_text: validated.text,
      product_matched: match.products.length > 0,
      product_id: productId,
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
// PROMPT BUILDERS
// =================================================================

function buildMLQuestionSystemPrompt(basePrompt: string): string {
  return `${basePrompt}

## REGRAS PARA RESPOSTAS NO MERCADO LIVRE (OBRIGATORIAS)

Voce esta respondendo uma PERGUNTA PUBLICA em um anuncio do Mercado Livre.
A resposta fica visivel para TODOS os compradores. Regras inviolaveis:

1. MAXIMO 350 caracteres. Seja direto e conciso.
2. PROIBIDO: links externos (site proprio, WhatsApp, Shopee, Amazon, redes sociais, telefone, email).
   PERMITIDO: links para OUTROS anuncios da MESMA LOJA no Mercado Livre (cross-selling).
   Formato permitido: mercadolivre.com.br/MLBXXXXXXXXX
   Use cross-selling SOMENTE quando o cliente perguntar sobre variacoes, kits ou tamanhos.
3. PROIBIDO: mencionar outras plataformas (Shopee, Amazon, site proprio).
3a. PROIBIDO ABSOLUTO: NUNCA compartilhe WhatsApp, telefone, email ou qualquer contato externo ao ML.
   Se o comprador perguntar "Tem WhatsApp?", "Qual o contato?", "Da loja oficial?" → responda:
   "Toda a comunicacao e atendimento sao feitos por aqui mesmo, pelo chat do Mercado Livre, garantindo a seguranca da sua compra. Pode perguntar o que precisar!"
   NUNCA diga que a loja "possui" WhatsApp. NUNCA sugira contato fora do ML. Infracao = banimento da conta.
4. PROIBIDO: emojis.
4. PROIBIDO: comparar precos entre canais ou sugerir comprar em outro lugar.
5. PROIBIDO: prometer prazos de entrega especificos (varia por localidade).
6. PROIBIDO: inventar informacoes que nao estao no contexto de produtos acima.
7. Comece com "Ola!" (saudacao breve, sem nome do comprador).
8. Responda a pergunta de forma direta e objetiva.
9. Encerre de forma natural quando fizer sentido (ex: "Espero ter ajudado!", "Boa compra!"). NAO use frases prontas tipo "estamos a disposicao", "fale conosco", "entre em contato" — sao PROIBIDAS pelo ML.
10. Se NAO tiver certeza de uma especificacao: e PROIBIDO dizer "vou verificar/conferir e retorno", "nao consta/confirmado no cadastro" ou "vamos atualizar o anuncio". Em vez disso: (a) de a informacao que existe no contexto do produto acima; (b) se faltar precisao, diga o aproximado com ressalva honesta ("por ser importado pode ter pequena variacao") e indique que os detalhes estao nas fotos e na ficha tecnica do anuncio; (c) foque no que o produto FAZ BEM e trate limitacoes como consequencia tecnica (ex: o pote de vidro nao vai ao forno por causa da vedacao de silicone e do choque termico), nunca como falha de cadastro. Se o comprador quer uma variacao (cor/tamanho) que nao e a do anuncio, ofereca a alternativa Budamix mais proxima pelo NOME.
11. NAO use o separador \\\\ — resposta do ML e texto unico, nao chunks.
12. Linguagem natural e simples, como uma pessoa real conversando — cordial sem ser formal de telemarketing. Evite girias regionais e palavroes; o resto e livre.
13. NAO use formatacao WhatsApp (*negrito*, _italico_) — resposta e texto puro.`
}

function buildMLQuestionUserMessage(
  body: MLQuestionRequest,
  productContext: string,
  crossSellContext: string,
  policies: Array<{ title: string; category: string; summary: string | null; content: string }>,
  faqs: Array<{ question: string; answer: string; category: string | null }>,
): string {
  const sections: string[] = []

  sections.push(`## Produto do Anuncio\n${productContext}`)

  if (crossSellContext) {
    sections.push(`## Outros anuncios relacionados no Mercado Livre\n${crossSellContext}\n\nSe o cliente perguntar sobre outras variacoes, kits ou tamanhos, voce pode sugerir os anuncios acima E incluir o link no formato: mercadolivre.com.br/MLBXXXXXXXXX`)
  }

  if (policies.length > 0) {
    const policyLines = policies.map(p => `- ${p.title} [${p.category}]: ${p.summary ?? p.content}`).join('\n')
    sections.push(`## Politicas da Budamix\n${policyLines}`)
  }

  if (faqs.length > 0) {
    const faqLines = faqs.map(f => `- P: ${f.question}\n  R: ${f.answer}`).join('\n\n')
    sections.push(`## Perguntas Frequentes\n${faqLines}`)
  }

  sections.push(`## Pergunta do Comprador\nComprador: ${body.buyer_nickname}\nPergunta: ${body.question_text}`)

  sections.push(`Responda a pergunta acima como Ana, seguindo TODAS as regras para Mercado Livre. Maximo 350 caracteres. Texto puro, sem formatacao.`)

  return sections.join('\n\n')
}
