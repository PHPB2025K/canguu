// =================================================================
// PROCESS-MESSAGE — AI Agent Core (the brain of Ana)
// =================================================================
// Called by N8N workflow when a message needs AI processing.
//
// Pipeline (9 steps):
//   1. Receive and validate request
//   2. Verify conversation is assigned to agent
//   3. Load agent config + fetch customer phone
//   4. Check working hours → return away message for N8N to send
//   5. Build context (parallel DB queries)
//   6. Classify intent (Claude Haiku — fast, cheap)
//   7. Check escalation conditions (4 rules)
//   8. Generate response (Claude Sonnet — main model)
//   9. Validate, save to DB, return response for N8N to send
//
// DOES NOT send WhatsApp messages directly — returns JSON for N8N.
// N8N handles: sending responses, escalation notifications, typing.
// ALWAYS returns 200. Never sends error messages to customer.
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { getConfig } from '../_shared/config.ts'
import { buildContext } from '../_shared/context-builder.ts'
import { classifyIntent } from '../_shared/intent-classifier.ts'
import { getMediaBase64 } from '../_shared/evolution-api.ts'
import { transcribeAudio } from '../_shared/groq-transcription.ts'
import { generateResponse } from '../_shared/response-generator.ts'
import { validateResponse } from '../_shared/response-validator.ts'
import { dispatchChunkedText, notifyOwnerOfEscalation, dispatchEscalation } from '../_shared/whatsapp-dispatch.ts'
import type { ProcessMessageRequest, ProcessMessageResponse, ClassificationResult } from '../_shared/types.ts'

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'process-message', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Always return 200 — this is called fire-and-forget by webhook
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'method_not_allowed' })
    }

    // ─── STEP 1: RECEIVE AND VALIDATE ───────────────────────────
    const body = await req.json() as ProcessMessageRequest

    if (!body.conversationId || !body.messageId || !body.customerId) {
      return jsonResponse({ success: false, error: 'missing_fields' })
    }

    const startTime = Date.now()
    let totalTokens = 0

    log('received', {
      conversationId: body.conversationId,
      messageId: body.messageId,
      customerId: body.customerId,
      messageType: body.messageType,
    })

    // ─── STEP 1b: TRANSCRIBE AUDIO IF NEEDED ────────────────────
    if (body.messageType === 'audio' && body.whatsappMessageId) {
      try {
        log('audio_transcription_start', { whatsappMessageId: body.whatsappMessageId })
        const media = await getMediaBase64(body.whatsappMessageId)
        if (media.base64) {
          const transcription = await transcribeAudio(media.base64, media.mimetype)
          body.messageContent = transcription
          // Update the message in DB with the transcription
          await supabase.from('messages').update({
            content: transcription,
            metadata: { transcribed: true, original_type: 'audio', audio_mimetype: media.mimetype },
          }).eq('id', body.messageId)
          log('audio_transcribed', { length: transcription.length })
        }
      } catch (err) {
        log('audio_transcription_failed', { error: String(err) })
        // Replace with a friendly request to resend audio (not "send as text")
        body.messageContent = '[Audio recebido mas não foi possível processar. Pedir para o cliente enviar o áudio novamente.]'
        await supabase.from('messages').update({
          content: body.messageContent,
          metadata: { transcription_failed: true, error: String(err).substring(0, 200) },
        }).eq('id', body.messageId)
      }
    }

    // ─── STEP 2: VERIFY CONVERSATION ASSIGNMENT ─────────────────
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, assigned_to, status, customer_id')
      .eq('id', body.conversationId)
      .single()

    if (!conversation) {
      log('error', { step: 'verify', error: 'conversation_not_found' })
      return emptyResponse(false, startTime, 'conversation_not_found')
    }

    if (conversation.assigned_to !== 'agent') {
      log('skip', { reason: 'not_assigned_to_agent', assignedTo: conversation.assigned_to })
      return emptyResponse(true, startTime)
    }

    // ─── STEP 3: LOAD CONFIG + FETCH CUSTOMER ──────────────────
    const [config, customerResult] = await Promise.all([
      getConfig(),
      supabase
        .from('customers')
        .select('phone, name')
        .eq('id', body.customerId)
        .single(),
    ])

    const customerPhone = customerResult.data?.phone
    const customerName = customerResult.data?.name

    if (!customerPhone) {
      log('error', { step: 'customer', error: 'customer_not_found' })
      return emptyResponse(false, startTime, 'customer_not_found')
    }

    // ─── STEP 4: REMOVED — Ana operates 24/7, no working hours check ─

    // ─── STEP 5: CLASSIFY INTENT (runs BEFORE context to gate product search) ─
    // Fetch lightweight history for classifier (last 5 messages)
    const { data: historyForClassifier } = await supabase
      .from('messages')
      .select('sender, content')
      .eq('conversation_id', body.conversationId)
      .order('created_at', { ascending: true })
      .limit(10)

    const classifierHistory = (historyForClassifier ?? []).map(m => ({
      role: m.sender as string,
      content: m.content as string,
    }))

    const { classification, tokensUsed: classifierTokens } = await classifyIntent(
      body.messageContent,
      classifierHistory,
      customerName,
    )

    totalTokens += classifierTokens

    // If classifier says no products but message is short AND conversation history
    // shows recent product interest, override to include products (context carry-over)
    let includeProducts = classification.needs_product_lookup
    if (!includeProducts && body.messageContent.length < 30) {
      // Check both agent AND customer recent messages for product context
      const recentMsgs = classifierHistory.slice(-6)
      const hasProductInAgent = recentMsgs
        .filter(m => m.role === 'agent')
        .some(m => /pote|caneca|jarra|kit|hermético|hermetico|vidro|suporte|R\$|tamanho|conjunto|marmita|presente/i.test(m.content))
      const hasProductInCustomer = recentMsgs
        .filter(m => m.role === 'customer')
        .some(m => /pote|caneca|jarra|kit|hermético|hermetico|vidro|suporte|comprar|preço|preco|catálogo|catalogo|jogo|conjunto/i.test(m.content))
      if (hasProductInAgent || hasProductInCustomer) {
        includeProducts = true
        log('product_context_carryover', {
          reason: hasProductInAgent ? 'agent_mentioned_products' : 'customer_mentioned_products',
          msgLength: body.messageContent.length,
        })
      }
    }

    log('classified', {
      intention: classification.intention,
      sentiment: classification.sentiment,
      shouldEscalate: classification.should_escalate,
      needsProductLookup: classification.needs_product_lookup,
      includeProductsOverride: includeProducts !== classification.needs_product_lookup,
      confidence: classification.confidence,
    })

    // ─── STEP 6: BUILD CONTEXT (products only if needed) ──────────
    const context = await buildContext(
      body.conversationId,
      body.customerId,
      body.messageContent,
      includeProducts,
    )

    // Set pending message count from debounce (default 1 for single messages)
    context.pendingMessageCount = body.pendingMessageCount ?? 1

    log('context_built', {
      historyCount: context.conversationHistory.length,
      productsCount: context.relevantProducts.length,
      includeProducts: classification.needs_product_lookup,
      policiesCount: context.relevantPolicies.length,
      faqsCount: context.relevantFAQs.length,
      messageCount: context.messageCount,
      pendingMessageCount: context.pendingMessageCount,
    })

    // ─── STEP 7b: ANTI-LOOP CHECKS (before LLM) ──────────────────
    // Rule 13: 2+ consecutive media-only placeholders from customer → escalate
    // Rule 13b: location/contact-only payload (no human text) → escalate immediately
    const emptyMsgCheck = checkConsecutiveEmptyMessages(context.conversationHistory)
    const isLocationOrContact = body.messageType === 'location' || body.messageType === 'contact'
    const onlyBracketedPayload = isAllBracketedContent(body.messageContent)
    const shouldEscalateNonText =
      emptyMsgCheck.shouldEscalate ||
      (isLocationOrContact && onlyBracketedPayload)

    if (shouldEscalateNonText) {
      const reason = emptyMsgCheck.shouldEscalate
        ? `Cliente enviou ${emptyMsgCheck.count} mensagens sem conteúdo textual consecutivas` +
          (emptyMsgCheck.lastPlaceholder ? ` (último: ${emptyMsgCheck.lastPlaceholder})` : '')
        : `Cliente compartilhou ${body.messageType === 'location' ? 'localização' : 'contato'} sem texto — provável solicitação operacional`

      log('anti_loop_non_text', {
        rule: emptyMsgCheck.shouldEscalate ? '13' : '13b',
        consecutiveEmpty: emptyMsgCheck.count,
        lastPlaceholder: emptyMsgCheck.lastPlaceholder,
        messageType: body.messageType,
      })

      const escalationUrgency = 'normal'
      await supabase.from('escalations').insert({
        conversation_id: body.conversationId,
        reason,
        urgency: escalationUrgency,
        status: 'pending',
      })
      await supabase.from('conversations').update({
        status: 'escalated',
        assigned_to: 'human_agent',
      }).eq('id', body.conversationId)

      const escalateMsg = isLocationOrContact && !emptyMsgCheck.shouldEscalate
        ? 'Recebi aqui! 😊 Vou te encaminhar para um atendente que vai cuidar disso pra você.'
        : 'Percebi que suas mensagens estão chegando em um formato que não consigo processar por aqui 😊\nVou encaminhar você para um atendente que poderá te ajudar melhor!'

      await supabase.from('messages').insert({
        conversation_id: body.conversationId,
        sender: 'agent',
        content: escalateMsg,
        message_type: 'text',
        tokens_used: 0,
        response_time_ms: Date.now() - startTime,
      })

      // If we own the dispatch path (edge-function pipeline), send the friendly
      // message to the customer and notify the owner inline. Otherwise the
      // legacy N8N caller will handle it from the JSON response below.
      if (body.dispatch) {
        try { await dispatchChunkedText(customerPhone, escalateMsg) } catch (err) {
          log('error', { step: 'dispatch_anti_loop_msg', error: String(err) })
        }
        try {
          await notifyOwnerOfEscalation({
            customerName: customerName ?? null,
            customerPhone,
            conversationId: body.conversationId,
            reason,
            urgency: escalationUrgency,
            classification,
          })
        } catch (err) {
          log('error', { step: 'notify_owner_anti_loop', error: String(err) })
        }
      }

      return jsonResponse({
        success: true,
        responseMessageId: null,
        responseText: escalateMsg,
        customerPhone,
        customerName: customerName ?? null,
        conversationId: body.conversationId,
        classification,
        escalated: true,
        escalationReason: reason,
        escalationUrgency,
        outsideWorkingHours: false,
        tokensUsed: totalTokens,
        responseTimeMs: Date.now() - startTime,
      })
    }

    // ─── STEP 8: CHECK ESCALATION ───────────────────────────────
    const escalationCheck = checkEscalation(classification, context, config)

    if (escalationCheck.shouldEscalate) {
      log('escalating', { reason: escalationCheck.reason })

      // Calculate urgency locally (same logic as escalate function)
      const escalationUrgency = calculateEscalationUrgency(
        escalationCheck.reason,
        classification,
      )

      // If we own dispatch (edge-function pipeline), invoke the full escalate
      // edge function: it creates the record, updates the conversation, sends
      // the standard transfer message to the customer and notifies Pedro.
      if (body.dispatch) {
        try {
          await dispatchEscalation({
            conversationId: body.conversationId,
            reason: escalationCheck.reason,
            classification: {
              intention: classification.intention,
              sentiment: classification.sentiment,
              confidence: classification.confidence,
            },
          })
        } catch (err) {
          log('error', { step: 'dispatch_escalation', error: String(err) })
        }
      }

      // Return escalation data for legacy callers (N8N) to handle
      return jsonResponse({
        success: true,
        responseMessageId: null,
        responseText: null,
        customerPhone,
        customerName: customerName ?? null,
        conversationId: body.conversationId,
        classification,
        escalated: true,
        escalationReason: escalationCheck.reason,
        escalationUrgency,
        outsideWorkingHours: false,
        tokensUsed: totalTokens,
        responseTimeMs: Date.now() - startTime,
      })
    }

    // ─── STEP 9: GENERATE RESPONSE ──────────────────────────────
    const { text: rawResponse, tokensUsed: generatorTokens } = await generateResponse(
      context,
      classification,
      config.model,
      config.maxTokens,
      config.temperature,
    )

    totalTokens += generatorTokens

    // ─── STEP 9: VALIDATE AND SAVE ───────────────────────────────
    const { text: validatedResponse, warnings, chunkCount, totalChars } = validateResponse(rawResponse)

    if (warnings.length > 0) {
      log('validation_warnings', { warnings })
    }

    // ─── STEP 9a: ANTI-LOOP — detect repeated responses (Rule 15) ──
    // If Ana is about to send a response very similar to her last one,
    // log it. The prompt rules should handle most cases, but this provides
    // visibility into when the anti-loop rule fails at the prompt level.
    const lastAgentMsg = context.conversationHistory
      .filter(m => m.role === 'agent')
      .slice(-1)[0]?.content ?? ''
    if (lastAgentMsg && isSimilarResponse(validatedResponse, lastAgentMsg)) {
      log('anti_loop_similar_response', {
        newResponse: validatedResponse.substring(0, 100),
        lastResponse: lastAgentMsg.substring(0, 100),
      })
      warnings.push('similar_to_previous_response')
    }

    // ─── STEP 9b: POST-RESPONSE ESCALATION CHECK ────────────────
    // If Ana's response promises to escalate, ACTUALLY escalate.
    // This catches cases where Ana says "vou encaminhar" but the 4 escalation
    // conditions weren't met. Without this, the customer thinks someone was
    // notified but nobody was.
    const postResponseEscalation = detectEscalationInResponse(validatedResponse)

    if (postResponseEscalation.detected) {
      log('post_response_escalation', {
        reason: postResponseEscalation.reason,
        matchedPhrase: postResponseEscalation.matchedPhrase,
      })

      // Create escalation record in DB
      await supabase.from('escalations').insert({
        conversation_id: body.conversationId,
        reason: postResponseEscalation.reason,
        urgency: classification.sentiment === 'negative' ? 'alta' : 'normal',
        status: 'pending',
      })

      // Update conversation to escalated
      await supabase.from('conversations').update({
        status: 'escalated',
        assigned_to: 'human_agent',
        category: mapIntentionToCategory(classification.intention),
        sentiment: mapSentimentToDb(classification.sentiment),
      }).eq('id', body.conversationId)
    }

    const responseTimeMs = Date.now() - startTime

    // Save agent message to DB
    const { data: savedResponse, error: saveError } = await supabase
      .from('messages')
      .insert({
        conversation_id: body.conversationId,
        sender: 'agent',
        content: validatedResponse,
        message_type: 'text',
        tokens_used: totalTokens,
        response_time_ms: responseTimeMs,
      })
      .select('id')
      .single()

    if (saveError) {
      log('error', { step: 'save_response', error: saveError.message })
    }

    // Update conversation metadata (only if not already escalated above)
    if (!postResponseEscalation.detected) {
      await supabase
        .from('conversations')
        .update({
          category: mapIntentionToCategory(classification.intention),
          sentiment: mapSentimentToDb(classification.sentiment),
        })
        .eq('id', body.conversationId)
    }

    log('completed', {
      responseMessageId: savedResponse?.id,
      tokensUsed: totalTokens,
      responseTimeMs,
      intention: classification.intention,
      sentiment: classification.sentiment,
      responseLength: validatedResponse.length,
      chunkCount,
      totalChars,
      postResponseEscalated: postResponseEscalation.detected,
    })

    // Edge-function pipeline owns dispatch. Send the response to the customer
    // and, if post-response escalation was detected, notify the owner inline
    // (we don't call escalate here because Ana's response already contains
    // the transfer phrase — calling escalate would send a second message).
    if (body.dispatch) {
      try {
        await dispatchChunkedText(customerPhone, validatedResponse)
      } catch (err) {
        log('error', { step: 'dispatch_response', error: String(err) })
      }
      if (postResponseEscalation.detected) {
        try {
          await notifyOwnerOfEscalation({
            customerName: customerName ?? null,
            customerPhone,
            conversationId: body.conversationId,
            reason: postResponseEscalation.reason,
            urgency: classification.sentiment === 'negative' ? 'alta' : 'normal',
            classification,
          })
        } catch (err) {
          log('error', { step: 'notify_owner_post_response', error: String(err) })
        }
      }
    }

    // Return response for legacy callers (N8N) to send via WhatsApp
    // If post-response escalation detected, flag it so N8N also knows
    return jsonResponse({
      success: true,
      responseMessageId: savedResponse?.id ?? null,
      responseText: validatedResponse,
      customerPhone,
      customerName: customerName ?? null,
      conversationId: body.conversationId,
      classification,
      escalated: postResponseEscalation.detected,
      escalationReason: postResponseEscalation.detected ? postResponseEscalation.reason : undefined,
      escalationUrgency: postResponseEscalation.detected
        ? (classification.sentiment === 'negative' ? 'alta' : 'normal')
        : undefined,
      outsideWorkingHours: false,
      tokensUsed: totalTokens,
      responseTimeMs,
      chunkCount,
      totalChars,
    })

  } catch (err) {
    log('error', { step: 'unhandled', error: String(err), stack: (err as Error).stack })

    const response: ProcessMessageResponse = {
      success: false,
      responseMessageId: null,
      classification: null,
      escalated: false,
      tokensUsed: 0,
      responseTimeMs: 0,
      error: 'internal_error',
    }
    return jsonResponse(response)
  }
})

// =================================================================
// HELPERS
// =================================================================

/** Build an empty ProcessMessageResponse for early returns */
function emptyResponse(success: boolean, startTime: number, error?: string): Response {
  const response: ProcessMessageResponse = {
    success,
    responseMessageId: null,
    classification: null,
    escalated: false,
    tokensUsed: 0,
    responseTimeMs: Date.now() - startTime,
    error,
  }
  return jsonResponse(response)
}

/**
 * Check 4 escalation conditions:
 * 1. Classifier says should_escalate
 * 2. Intention is human_request
 * 3. Escalation keywords in message
 * 4. Message count >= max before escalation
 */
function checkEscalation(
  classification: ClassificationResult,
  context: { currentMessage: string; messageCount: number },
  config: { escalationKeywords: string[]; maxMessagesBeforeEscalation: number },
): { shouldEscalate: boolean; reason: string } {
  // Condition 1: Classifier explicitly flagged escalation
  if (classification.should_escalate) {
    return {
      shouldEscalate: true,
      reason: classification.escalation_reason ?? 'Classificador detectou necessidade de escalonamento',
    }
  }

  // Condition 2: Customer explicitly asked for human
  if (classification.intention === 'human_request') {
    return {
      shouldEscalate: true,
      reason: 'Cliente solicitou atendimento humano',
    }
  }

  // Condition 3: Escalation keywords detected in message
  const messageLower = context.currentMessage.toLowerCase()
  const matchedKeyword = config.escalationKeywords.find(kw =>
    messageLower.includes(kw.toLowerCase())
  )
  if (matchedKeyword) {
    return {
      shouldEscalate: true,
      reason: `Palavra-chave de escalonamento detectada: "${matchedKeyword}"`,
    }
  }

  // Condition 4: Too many messages without resolution
  if (context.messageCount >= config.maxMessagesBeforeEscalation) {
    return {
      shouldEscalate: true,
      reason: `Conversa atingiu ${context.messageCount} mensagens sem resolução`,
    }
  }

  return { shouldEscalate: false, reason: '' }
}

/** Map English classifier intention to Portuguese DB category */
function mapIntentionToCategory(intention: string): string | null {
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
  return map[intention] ?? null
}

/** Map English classifier sentiment to Portuguese DB sentiment */
function mapSentimentToDb(sentiment: string): string {
  const map: Record<string, string> = {
    positive: 'positivo',
    negative: 'negativo',
    neutral: 'neutro',
  }
  return map[sentiment] ?? 'neutro'
}

/**
 * Media-only placeholders Ana cannot reason about.
 * Location/Contact are intentionally excluded — they carry actionable
 * information (address, phone) the LLM can use.
 */
const MEDIA_ONLY_PLACEHOLDERS = [
  '[Mensagem sem texto]',
  '[Sticker recebido]',
  '[Imagem recebida]',
  '[Vídeo recebido]',
  '[Documento recebido]',
  '[Áudio recebido — transcrição indisponível. Por favor, envie sua mensagem em texto.]',
] as const

function isMediaOnlyPlaceholder(content: string): boolean {
  const trimmed = content.trim()
  return (MEDIA_ONLY_PLACEHOLDERS as readonly string[]).includes(trimmed)
}

/** True when EVERY non-empty line of the consolidated message is a `[...]` placeholder. */
function isAllBracketedContent(content: string): boolean {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return false
  return lines.every(l => /^\[.+\]$/.test(l))
}

/**
 * Rule 13: Check for consecutive media-only placeholders from customer.
 * After 2 consecutive (sticker, image without caption, video, etc.),
 * auto-escalate to human.
 */
function checkConsecutiveEmptyMessages(
  history: Array<{ role: string; content: string }>,
): { shouldEscalate: boolean; count: number; lastPlaceholder: string | null } {
  let count = 0
  let lastPlaceholder: string | null = null
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    if (msg.role === 'customer') {
      if (isMediaOnlyPlaceholder(msg.content)) {
        if (!lastPlaceholder) lastPlaceholder = msg.content.trim()
        count++
      } else {
        break // Actionable customer message found
      }
    } else if (msg.role === 'agent') {
      // Agent message between placeholders doesn't break the chain
      continue
    }
  }
  return { shouldEscalate: count >= 2, count, lastPlaceholder }
}

/**
 * Rule 15: Detect if new response is essentially the same as the last one.
 * Uses substring overlap to catch rephrased versions of the same question.
 */
function isSimilarResponse(newResponse: string, lastResponse: string): boolean {
  // Normalize: lowercase, remove emojis, strip punctuation
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^\w\sáàâãéèêíìîóòôõúùûç]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  const a = normalize(newResponse)
  const b = normalize(lastResponse)

  if (a.length < 20 || b.length < 20) return false

  // Extract first 5 words of each — if identical, likely the same question
  const wordsA = a.split(' ').slice(0, 8).join(' ')
  const wordsB = b.split(' ').slice(0, 8).join(' ')
  if (wordsA.length > 15 && wordsA === wordsB) return true

  // Check if one contains a substantial substring of the other
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  // If >60% of the shorter text appears in the longer, it's similar
  const overlapThreshold = shorter.length * 0.6
  let matchCount = 0
  const words = shorter.split(' ')
  for (const word of words) {
    if (word.length > 3 && longer.includes(word)) matchCount += word.length
  }
  return matchCount > overlapThreshold
}

/**
 * Detect if Ana's response text promises to escalate/forward the conversation.
 * If she says "vou encaminhar" but the system didn't flag escalation,
 * we need to create an escalation record so someone is actually notified.
 */
function detectEscalationInResponse(responseText: string): {
  detected: boolean
  reason: string
  matchedPhrase: string
} {
  const lower = responseText.toLowerCase()

  // Phrases that indicate Ana is promising to escalate
  const escalationPhrases = [
    { pattern: /vou encaminhar/i, reason: 'Ana prometeu encaminhar caso' },
    { pattern: /vou direcionar/i, reason: 'Ana prometeu direcionar atendimento' },
    { pattern: /vou passar para (?:a |o )?equipe/i, reason: 'Ana prometeu passar para equipe' },
    { pattern: /vou acionar/i, reason: 'Ana prometeu acionar processo' },
    { pattern: /(?:equipe|especialista|atendente).{0,30}(?:entr\w+ em contato|vai resolver)/i, reason: 'Ana prometeu contato da equipe' },
    { pattern: /transferi(?:r|ndo) (?:voc[eê]|seu caso|seu atendimento)/i, reason: 'Ana prometeu transferir atendimento' },
  ]

  for (const { pattern, reason } of escalationPhrases) {
    const match = responseText.match(pattern)
    if (match) {
      return { detected: true, reason, matchedPhrase: match[0] }
    }
  }

  return { detected: false, reason: '', matchedPhrase: '' }
}

// Legal keywords that trigger urgent priority
const LEGAL_KEYWORDS = ['procon', 'advogado', 'processo', 'justiça', 'reclameaqui', 'consumidor']

/**
 * Calculate escalation urgency (same logic as escalate/index.ts).
 * 'urgente': Legal keywords OR negative sentiment
 * 'alta': Human request OR message count exceeded
 * 'normal': Everything else
 */
function calculateEscalationUrgency(
  reason: string,
  classification: ClassificationResult,
): string {
  const reasonLower = reason.toLowerCase()

  if (LEGAL_KEYWORDS.some(kw => reasonLower.includes(kw))) return 'urgente'
  if (classification.sentiment === 'negative') return 'urgente'
  if (classification.intention === 'human_request') return 'alta'
  if (reasonLower.includes('mensagens sem resolução')) return 'alta'

  return 'normal'
}
