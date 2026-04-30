// =================================================================
// SEND-WHATSAPP — Sends messages to WhatsApp via Evolution API
// =================================================================
// Called by:
//   - process-message (agent AI responses)
//   - Dashboard ChatView (human_agent messages)
//   - escalate (escalation notification to Pedro)
//
// Accepts: { phone, text, mediaUrl?, mediaType?, caption? }
// Returns: { ok, whatsappMessageId }
//
// Chunk splitting: Splits on \\ separator — each chunk becomes a
// separate WhatsApp message with typing indicator and proportional delay.
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { sendText, sendMedia, setPresence } from '../_shared/evolution-api.ts'

interface SendRequest {
  phone: string
  text?: string
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'document' | 'audio'
  mimetype?: string
  caption?: string
  fileName?: string
  showTyping?: boolean
}

const CHUNK_SEPARATOR = '\\\\'
const MAX_MESSAGES = 4

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const body = await req.json() as SendRequest

    if (!body.phone) {
      return errorResponse('Missing required field: phone')
    }

    if (!body.text && !body.mediaUrl) {
      return errorResponse('Must provide either text or mediaUrl')
    }

    // Show typing indicator before sending
    if (body.showTyping !== false) {
      try {
        await setPresence(body.phone, true, 2000)
      } catch {
        // Non-critical — continue even if presence fails
      }
    }

    let result: unknown

    if (body.mediaUrl) {
      // Send media message
      result = await sendMedia(body.phone, body.mediaUrl, {
        mediatype: body.mediaType,
        mimetype: body.mimetype,
        caption: body.caption,
        fileName: body.fileName,
      })
    } else if (body.text) {
      // Split on \\ separator — each chunk becomes a separate WhatsApp message
      result = await sendChunkedMessages(body.phone, body.text)
    }

    const waResult = result as { key?: { id?: string } } | undefined
    const whatsappMessageId = waResult?.key?.id ?? null

    console.log(`[send-whatsapp] Sent to ${body.phone}: ${(body.text ?? body.caption ?? 'media').substring(0, 50)}...`)

    return jsonResponse({
      ok: true,
      whatsappMessageId,
    })
  } catch (err) {
    console.error('[send-whatsapp] Error:', err)
    return errorResponse(`Failed to send WhatsApp message: ${(err as Error).message}`, 500)
  }
})

/**
 * Split text on \\ separator and send each chunk as a separate WhatsApp message.
 * Falls back to single message if no \\ separator found.
 * Shows composing presence + proportional delay between chunks.
 */
async function sendChunkedMessages(phone: string, text: string): Promise<unknown> {
  let chunks = text.split(CHUNK_SEPARATOR).map(c => c.trim()).filter(c => c.length > 0)

  // Fallback: if no \\ separator, try \n\n (legacy behavior)
  if (chunks.length <= 1 && text.includes('\n\n')) {
    const nnChunks = text.split(/\n\n+/).filter(c => c.trim().length > 0)
    if (nnChunks.length > 1) {
      chunks = nnChunks
    }
  }

  // Single chunk — send as-is
  if (chunks.length <= 1) {
    return sendText(phone, text.trim())
  }

  // Enforce max chunks
  if (chunks.length > MAX_MESSAGES) {
    chunks = chunks.slice(0, MAX_MESSAGES)
  }

  // Send each chunk with typing indicator + proportional delay
  let lastResult: unknown
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      // Typing indicator
      try {
        await setPresence(phone, true, 1000)
      } catch {
        // Non-critical
      }
      // Proportional delay: 50ms per char, min 800ms, max 3000ms
      const delay = Math.min(Math.max(chunks[i].length * 50, 800), 3000)
      await new Promise(resolve => setTimeout(resolve, delay))
      // Breathing space before sending
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    lastResult = await sendText(phone, chunks[i])
  }

  return lastResult
}
