// =================================================================
// WHATSAPP-DISPATCH — chunked message delivery with typing indicator
// =================================================================
// Pulled out of send-whatsapp/index.ts so the same chunking + delay rules
// are applied whether we go through the dedicated function (HTTP) or
// invoke it inline from process-message after generating a response.
// =================================================================

import { sendText, setPresence } from './evolution-api.ts'
import { supabase } from './supabase-client.ts'

const CHUNK_SEPARATOR = '\\\\'
const MAX_MESSAGES = 4
const MIN_DELAY_MS = 800
const MAX_DELAY_MS = 3000
const PER_CHAR_DELAY_MS = 50
const BREATHING_SPACE_MS = 300

function splitChunks(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Primary: explicit `\\` separator coming from the response generator.
  let chunks = trimmed.split(CHUNK_SEPARATOR).map(c => c.trim()).filter(Boolean)

  // Fallback: legacy double-newline separator for older prompts.
  if (chunks.length <= 1 && trimmed.includes('\n\n')) {
    const nn = trimmed.split(/\n\n+/).map(c => c.trim()).filter(Boolean)
    if (nn.length > 1) chunks = nn
  }

  if (chunks.length === 0) return [trimmed]
  if (chunks.length > MAX_MESSAGES) chunks = chunks.slice(0, MAX_MESSAGES)
  return chunks
}

/**
 * Send `text` to `phone` via Evolution, splitting into up to 4 chunks with a
 * typing indicator and proportional delay between them. Errors propagate so
 * the caller can record `dispatch_error` on the message.
 */
export async function dispatchChunkedText(phone: string, text: string): Promise<{ chunks: number }> {
  const chunks = splitChunks(text)
  if (chunks.length === 0) return { chunks: 0 }

  if (chunks.length === 1) {
    try { await setPresence(phone, true, 1500) } catch { /* non-critical */ }
    await sendText(phone, chunks[0])
    return { chunks: 1 }
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      try { await setPresence(phone, true, 1000) } catch { /* non-critical */ }
      const delay = Math.min(Math.max(chunks[i].length * PER_CHAR_DELAY_MS, MIN_DELAY_MS), MAX_DELAY_MS)
      await new Promise(resolve => setTimeout(resolve, delay))
      await new Promise(resolve => setTimeout(resolve, BREATHING_SPACE_MS))
    } else {
      try { await setPresence(phone, true, 1000) } catch { /* non-critical */ }
    }
    await sendText(phone, chunks[i])
  }

  return { chunks: chunks.length }
}

// Default fallback if agent_config row is missing
const DEFAULT_NOTIFICATION_PHONE = '5519992979490'

/**
 * Notify the business owner that a conversation was escalated. Mirrors the
 * notification block of the `escalate` edge function but stays inline so we
 * can call it from process-message without sending a duplicate transfer
 * message to the customer (process-message owns that part).
 */
export async function notifyOwnerOfEscalation(args: {
  customerName: string | null
  customerPhone: string
  conversationId: string
  reason: string
  urgency: 'baixa' | 'normal' | 'alta' | 'urgente'
  classification?: {
    intention: string
    sentiment: string
  }
  recentMessages?: Array<{ sender: string; content: string }>
}): Promise<void> {
  // 1. Look up the notification phone from agent_config
  let notificationPhone = DEFAULT_NOTIFICATION_PHONE
  try {
    const { data } = await supabase
      .from('agent_config')
      .select('config_value')
      .eq('config_key', 'notification_phone')
      .maybeSingle()
    if (data?.config_value) notificationPhone = data.config_value
  } catch { /* fall back to default */ }

  // 2. Build the notification payload
  const urgencyLabel = args.urgency === 'urgente' ? 'URGENTE'
    : args.urgency === 'alta' ? 'ALTA'
    : 'NORMAL'

  let sentimentLabel = 'Neutro'
  if (args.classification?.sentiment === 'negative') sentimentLabel = 'Negativo'
  if (args.classification?.sentiment === 'positive') sentimentLabel = 'Positivo'

  const customerLabel = args.customerName?.trim()
    ? `${args.customerName} (${args.customerPhone})`
    : args.customerPhone

  const tail = args.recentMessages?.length
    ? '\n\nÚltimas mensagens:\n' + args.recentMessages.slice(-3)
        .map(m => `${m.sender === 'customer' ? '👤' : '🤖'} ${m.content.slice(0, 120)}`)
        .join('\n')
    : ''

  const message = [
    `🚨 Escalonamento (${urgencyLabel})`,
    `Cliente: ${customerLabel}`,
    `Motivo: ${args.reason}`,
    `Sentimento: ${sentimentLabel}`,
    `Conversa: ${args.conversationId}`,
  ].join('\n') + tail

  // 3. Send via Evolution. Don't throw — owner-notification failure should
  // not block the customer flow.
  try {
    await sendText(notificationPhone, message)
  } catch (err) {
    console.log(JSON.stringify({
      fn: 'whatsapp-dispatch',
      step: 'notify_owner_failed',
      error: String(err),
    }))
  }
}

/**
 * Invoke the standalone `escalate` edge function for cases where we want the
 * full flow (record + update + customer transfer message + owner notify).
 * Kept as an HTTP call so it is independently observable in logs.
 */
export async function dispatchEscalation(args: {
  conversationId: string
  reason: string
  classification?: {
    intention: string
    sentiment: string
    confidence: number
  }
}): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured')
  }

  // Hotfix 22/05/2026: enviar X-Internal-Token pra match com escalate
  // que agora valida shared secret high-entropy (verify_jwt=false bypass).
  // Mesmo padrão já adotado por webhook-whatsapp → process-message.
  // Ver DIAGNOSTICO_ANA.md.
  const internalDispatchToken = Deno.env.get('INTERNAL_DISPATCH_TOKEN') ?? ''

  const response = await fetch(`${supabaseUrl}/functions/v1/escalate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'X-Internal-Token': internalDispatchToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`escalate function returned ${response.status}: ${errorText}`)
  }
}
