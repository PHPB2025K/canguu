// =================================================================
// SEND-HUMAN-MESSAGE — Bridge: Dashboard → WhatsApp
// =================================================================
// Called by the frontend when a human_agent sends a message from
// the dashboard ChatView. Saves to DB AND sends via WhatsApp.
//
// Flow:
//   1. Validate request
//   2. Load conversation + customer phone
//   3. Verify conversation is assigned to human (not agent)
//   4. Save message to DB (sender: human_agent)
//   5. Send via WhatsApp (typing indicator + sendText)
//   6. Return { success, messageId, sent }
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { sendText, setPresence } from '../_shared/evolution-api.ts'

interface SendHumanMessageRequest {
  conversationId: string
  content: string
  senderId?: string
}

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'send-human-message', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    // ─── STEP 1: VALIDATE ───────────────────────────────────
    const body = await req.json() as SendHumanMessageRequest

    if (!body.conversationId || !body.content) {
      return errorResponse('Missing required fields: conversationId, content')
    }

    log('received', {
      conversationId: body.conversationId,
      contentLength: body.content.length,
    })

    // ─── STEP 2: LOAD CONVERSATION + CUSTOMER ───────────────
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, assigned_to, status, customer_id, customers(phone, name)')
      .eq('id', body.conversationId)
      .single()

    if (convError || !conversation) {
      return errorResponse('Conversation not found', 404)
    }

    const customerData = conversation.customers as unknown as { phone: string; name: string | null } | null
    const customerPhone = customerData?.phone

    if (!customerPhone) {
      return errorResponse('Customer phone not found', 404)
    }

    // ─── STEP 3: VERIFY HUMAN ASSIGNMENT ────────────────────
    if (conversation.assigned_to === 'agent') {
      return errorResponse('Conversation is assigned to AI agent. Take over first.', 403)
    }

    // ─── STEP 4: SAVE MESSAGE TO DB ─────────────────────────
    const { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: body.conversationId,
        sender: 'human_agent',
        content: body.content,
        message_type: 'text',
      })
      .select('id')
      .single()

    if (msgError) {
      throw new Error(`Failed to save message: ${msgError.message}`)
    }

    log('saved', { messageId: savedMessage.id })

    // ─── STEP 5: SEND VIA WHATSAPP ──────────────────────────
    let sent = false

    try {
      // Typing indicator
      await setPresence(customerPhone, true, 2000).catch(() => {})

      // Send text
      await sendText(customerPhone, body.content)
      sent = true

      log('sent', { phone: customerPhone })
    } catch (err) {
      // Message is saved even if WhatsApp send fails
      log('error', { step: 'send_whatsapp', error: String(err) })
    }

    // ─── STEP 6: UPDATE CONVERSATION ────────────────────────
    await supabase
      .from('customers')
      .update({ last_contact_at: new Date().toISOString() })
      .eq('id', conversation.customer_id)

    return jsonResponse({
      success: true,
      messageId: savedMessage.id,
      sent,
    })

  } catch (err) {
    log('error', { step: 'unhandled', error: String(err), stack: (err as Error).stack })
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
