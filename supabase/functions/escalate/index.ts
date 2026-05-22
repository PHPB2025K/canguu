// =================================================================
// ESCALATE — Complete escalation with notifications
// =================================================================
// Called by process-message (step 8) when escalation is triggered.
//
// Flow:
//   1. Validate request
//   2. Load conversation + customer data + last 5 messages
//   3. Calculate priority (urgency)
//   4. Create escalation record
//   5. Update conversation (status=escalated, assigned_to=human_agent)
//   6. Send transfer message to customer via WhatsApp
//   7. Notify Pedro (owner) via WhatsApp
//   8. Return result
//
// Triggers (from process-message checkEscalation):
//   - Classifier flags should_escalate
//   - Customer requests human (intention = human_request)
//   - Escalation keywords detected (procon, advogado, etc.)
//   - Message count exceeds max_messages_before_escalation
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { sendText } from '../_shared/evolution-api.ts'

// Fallback if notification_phone config is not set.
// IMPORTANTE: este é o WhatsApp PESSOAL do Pedro Broglio (owner).
// NÃO confundir com 5519992979490 que é o número da própria instância
// da Ana (Evolution Cloudfly) — escalations enviadas pra lá ficavam num
// loop silencioso até 22/05/2026 quando o bug foi descoberto durante
// validação E2E pós-fix do escalate. Ver DIAGNOSTICO_ANA.md.
const DEFAULT_NOTIFICATION_PHONE = '5519993040768'

// Legal keywords that trigger urgent priority
const LEGAL_KEYWORDS = ['procon', 'advogado', 'processo', 'justiça', 'reclameaqui', 'consumidor']

interface EscalateRequest {
  conversationId: string
  reason: string
  classification?: {
    intention: string
    sentiment: string
    confidence: number
  }
}

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'escalate', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    // ─── STEP 0: VALIDATE INTERNAL DISPATCH TOKEN ────────────────
    // Hotfix 22/05/2026: escalate agora roda com verify_jwt=false pra
    // contornar JWT desalinhado que rejeitava invocações do process-message
    // com 401 (causa raiz da Ana muda em conversas de escalação por 24h+).
    // Segurança equivalente via INTERNAL_DISPATCH_TOKEN — mesmo padrão
    // já adotado em process-message ontem (21/05). Ver DIAGNOSTICO_ANA.md.
    const expectedToken = Deno.env.get('INTERNAL_DISPATCH_TOKEN')
    if (!expectedToken) {
      log('config_error', { reason: 'INTERNAL_DISPATCH_TOKEN env var missing' })
      return jsonResponse({ success: false, error: 'misconfigured' }, 500)
    }
    const providedToken = req.headers.get('X-Internal-Token')
    if (providedToken !== expectedToken) {
      log('auth_failed', {
        providedTokenLength: providedToken?.length ?? 0,
        expectedTokenLength: expectedToken.length,
      })
      return jsonResponse({ success: false, error: 'unauthorized' }, 401)
    }

    // ─── STEP 1: VALIDATE REQUEST ─────────────────────────────
    const body = await req.json() as EscalateRequest

    if (!body.conversationId || !body.reason) {
      return errorResponse('Missing required fields: conversationId, reason')
    }

    log('received', {
      conversationId: body.conversationId,
      reason: body.reason,
      hasClassification: !!body.classification,
    })

    // ─── STEP 2: LOAD DATA ───────────────────────────────────
    const [conversationResult, messagesResult, notifPhoneResult] = await Promise.all([
      // Conversation with customer join
      supabase
        .from('conversations')
        .select('id, status, assigned_to, customer_id, customers(id, name, phone)')
        .eq('id', body.conversationId)
        .single(),

      // Last 5 messages for context preview
      supabase
        .from('messages')
        .select('sender, content, created_at')
        .eq('conversation_id', body.conversationId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Notification phone from config
      supabase
        .from('agent_config')
        .select('config_value')
        .eq('config_key', 'notification_phone')
        .maybeSingle(),
    ])

    const conversation = conversationResult.data
    if (!conversation) {
      log('error', { step: 'load', error: 'conversation_not_found' })
      return errorResponse('Conversation not found', 404)
    }

    // Handle joined customer data (Supabase returns as object or array)
    const customerData = conversation.customers as unknown as { id: string; name: string | null; phone: string } | null
    const customerPhone = customerData?.phone
    const customerName = customerData?.name ?? 'Desconhecido'

    if (!customerPhone) {
      log('error', { step: 'load', error: 'customer_phone_not_found' })
      return errorResponse('Customer phone not found', 404)
    }

    const notificationPhone = notifPhoneResult.data?.config_value ?? DEFAULT_NOTIFICATION_PHONE

    // ─── STEP 3: CALCULATE PRIORITY ──────────────────────────
    const urgency = calculateUrgency(body.reason, body.classification)

    // ─── STEP 4: CREATE ESCALATION RECORD ────────────────────
    const metadata = body.classification
      ? JSON.stringify({
          classification: body.classification,
          trigger_reason: body.reason,
        })
      : null

    const { data: escalation, error: escError } = await supabase
      .from('escalations')
      .insert({
        conversation_id: body.conversationId,
        reason: body.reason,
        urgency,
        status: 'pending',
        notes: metadata,
      })
      .select('id')
      .single()

    if (escError) {
      throw new Error(`Failed to create escalation: ${escError.message}`)
    }

    log('created', { escalationId: escalation.id, urgency })

    // ─── STEP 5: UPDATE CONVERSATION ─────────────────────────
    const conversationUpdate: Record<string, unknown> = {
      status: 'escalated',
      assigned_to: 'human_agent',
    }

    // Map classification to conversation metadata if available
    if (body.classification) {
      const catMap: Record<string, string> = {
        pre_sale: 'pre_venda', post_sale: 'pos_venda', complaint: 'reclamacao',
        faq: 'duvida', product_inquiry: 'pre_venda', order_status: 'pos_venda',
        human_request: 'reclamacao',
      }
      const sentMap: Record<string, string> = {
        positive: 'positivo', negative: 'negativo', neutral: 'neutro',
      }
      conversationUpdate.category = catMap[body.classification.intention] ?? null
      conversationUpdate.sentiment = sentMap[body.classification.sentiment] ?? 'neutro'
      conversationUpdate.priority = urgency
    }

    await supabase
      .from('conversations')
      .update(conversationUpdate)
      .eq('id', body.conversationId)

    // ─── STEP 6: SEND TRANSFER MESSAGE TO CUSTOMER ──────────
    const transferMsg = 'Entendo sua situação! Vou direcionar seu atendimento para que possamos resolver isso da melhor forma. Só um momento! 😊'
    let transferSent = false

    try {
      await sendText(customerPhone, transferMsg)
      transferSent = true

      // Save transfer message to DB
      await supabase.from('messages').insert({
        conversation_id: body.conversationId,
        sender: 'agent',
        content: transferMsg,
        message_type: 'text',
      })

      log('transfer_sent', { phone: customerPhone })
    } catch (err) {
      log('error', { step: 'transfer_message', error: String(err) })
    }

    // ─── STEP 7: NOTIFY PEDRO (OWNER) VIA WHATSAPP ─────────
    let notified = false

    // Build customer message preview (last 2 messages from customer)
    const customerMessages = (messagesResult.data ?? [])
      .filter(m => m.sender === 'customer')
      .slice(0, 2)
      .map(m => m.content.substring(0, 100))

    const preview = customerMessages.length > 0
      ? customerMessages.join('\n')
      : '(sem mensagens recentes)'

    const urgencyLabel = urgency === 'urgente' ? 'URGENTE'
      : urgency === 'alta' ? 'ALTA'
      : 'NORMAL'

    const sentimentLabel = body.classification?.sentiment === 'negative' ? 'Negativo'
      : body.classification?.sentiment === 'positive' ? 'Positivo'
      : 'Neutro'

    const notificationMsg = [
      `🔔 *Escalonamento #${urgencyLabel}*`,
      '',
      `Cliente: ${customerName} (${customerPhone})`,
      `Motivo: ${body.reason}`,
      `Sentimento: ${sentimentLabel}`,
      `Preview: _${preview}_`,
      '',
      '👉 Acesse o dashboard para assumir o atendimento.',
    ].join('\n')

    try {
      await sendText(notificationPhone, notificationMsg)
      notified = true
      log('notified', { phone: notificationPhone })
    } catch (err) {
      log('error', { step: 'notify_owner', error: String(err) })
    }

    // ─── STEP 8: RETURN RESULT ──────────────────────────────
    return jsonResponse({
      success: true,
      escalationId: escalation.id,
      priority: urgency,
      transferSent,
      notified,
    })

  } catch (err) {
    log('error', { step: 'unhandled', error: String(err), stack: (err as Error).stack })
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

// =================================================================
// HELPERS
// =================================================================

/**
 * Calculate escalation urgency based on reason and classification.
 *
 * 'urgente': Legal keywords OR negative sentiment
 * 'alta': Human request OR message count exceeded
 * 'normal': Everything else
 */
function calculateUrgency(
  reason: string,
  classification?: { intention: string; sentiment: string },
): string {
  const reasonLower = reason.toLowerCase()

  // Urgent: legal keywords or negative sentiment
  if (LEGAL_KEYWORDS.some(kw => reasonLower.includes(kw))) {
    return 'urgente'
  }
  if (classification?.sentiment === 'negative') {
    return 'urgente'
  }

  // High: human request or message count exceeded
  if (classification?.intention === 'human_request') {
    return 'alta'
  }
  if (reasonLower.includes('mensagens sem resolução') || reasonLower.includes('messages')) {
    return 'alta'
  }

  return 'normal'
}
