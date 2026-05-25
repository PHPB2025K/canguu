// =================================================================
// WEBHOOK-WHATSAPP — Entry point for all incoming WhatsApp messages
// =================================================================
// Called by Evolution API v2 webhook on every incoming message.
//
// CRITICAL: Always return 200 OK, even on errors.
// Returning 4xx/5xx causes Evolution to retry → duplicates.
//
// Flow:
//   1. Parse & validate Evolution API payload
//   2. Deduplicate (check whatsapp_message_id)
//   3. Transcribe audio if needed (Groq Whisper)
//   4. Upsert customer (by phone)
//   5. Get or create conversation (24h session window)
//   6. Save incoming message to DB
//   7. If assigned to human → skip AI processing
//   8. Message buffer (debounce): wait N seconds for more messages
//   9. If newer message arrived during wait → yield
//  10. Consolidate pending messages → fire-and-forget process-message
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { parseWebhookPayload, getMediaBase64, sendText } from '../_shared/evolution-api.ts'
import { getConfig } from '../_shared/config.ts'
import { transcribeAudio } from '../_shared/groq-transcription.ts'
import { analyzeVideo } from '../_shared/gemini-video.ts'
import { analyzeImage } from '../_shared/gemini-vision.ts'
import { uploadChatMedia } from '../_shared/storage.ts'
import type { ParsedWhatsAppMessage } from '../_shared/types.ts'

// 24-hour session window (WhatsApp business rule)
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

// Maps rowIds from the origin-poll list reply (legacy interactive button
// path — kept around in case Evolution v2 + the customer's WhatsApp client
// happens to render listMessage correctly) to customers.source.
const ORIGIN_ROW_TO_SOURCE: Record<string, string> = {
  mercado_livre: 'mercado_livre',
  shopee: 'shopee',
  amazon: 'amazon',
  site: 'site',
  outro: 'whatsapp',
}

// Free-text detector for the numbered origin poll. We accept both the
// number (1, 2…) and the channel name typed loosely. Returns the
// customers.source value or null if the text doesn't look like a reply.
//
// Hotfix 21/05/2026: patterns ampliados pra tolerar typos comuns (shoppe,
// shope, shopi, merc liv, mercadol, amazn, amzn, sit, budamix). Bug
// originalmente exposto pelo caso da cliente Edneia que digitou "Shoppe"
// e ficou presa sem source preenchido por dias.
const ORIGIN_TEXT_PATTERNS: Array<{ source: string; patterns: RegExp[] }> = [
  {
    source: 'mercado_livre',
    patterns: [
      /^\s*1[º°.)]?\s*$/i,
      /\bmerc(ad)?o?\s*l(iv|ib)?(re)?\b/i, // mercado livre, mercadolivre, merc livre, mercado lib
      /\bmeli\b/i,
      /\bml\b/i,
    ],
  },
  {
    source: 'shopee',
    patterns: [
      /^\s*2[º°.)]?\s*$/i,
      /\bsh[op]+e?e?\b/i, // shopee, shopi, shoppe, shope, shop
      /\bxopi+/i,         // xopi, xopee (variação fonética PT-BR)
    ],
  },
  {
    source: 'amazon',
    patterns: [
      /^\s*3[º°.)]?\s*$/i,
      /\bama?zo?n\b/i,    // amazon, amzon, amazn, amzn, azon
    ],
  },
  {
    source: 'site',
    patterns: [
      /^\s*4[º°.)]?\s*$/i,
      /\bsit[ei]?\b/i,    // site, sitee, sit
      /\bbudami?x\.?(com)?\b/i, // budamix.com, budamix, budami
    ],
  },
  {
    source: 'whatsapp',
    patterns: [
      /^\s*5[º°.)]?\s*$/i,
      /\boutro\b/i,
      /\bnenhum\b/i,
    ],
  },
]

function matchOriginFromText(text: string): string | null {
  if (!text) return null
  // Strip emojis like 1️⃣ → 1 to make the regex friendlier
  const cleaned = text.replace(/[\uFE0F\u20E3]/g, '').trim()
  for (const { source, patterns } of ORIGIN_TEXT_PATTERNS) {
    if (patterns.some(p => p.test(cleaned))) return source
  }
  return null
}

// Numbered text shown to the customer. Universal — works in every WhatsApp
// client, no Business / Cloud API dependency.
const ORIGIN_POLL_TEXT = `Bem-vindo à Budamix! 👋

Antes de te ajudar, me conta de qual canal você está vindo?
Responda apenas com o número:

1️⃣ Mercado Livre
2️⃣ Shopee
3️⃣ Amazon
4️⃣ Site Budamix (budamix.com.br)
5️⃣ Outro`

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'webhook-whatsapp', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Always return 200 to prevent Evolution retries
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: true, skipped: true, reason: 'not_post' })
    }

    const body = await req.json()
    const parsed = parseWebhookPayload(body)

    // Not a valid incoming message (status update, group msg, sent by us, reaction, etc.)
    if (!parsed) {
      return jsonResponse({ ok: true, skipped: true, reason: 'invalid_payload' })
    }

    log('received', {
      phone: parsed.phone,
      messageType: parsed.messageType,
      whatsappMessageId: parsed.whatsappMessageId,
      contentPreview: parsed.content.substring(0, 80),
    })

    // ─── STEP 1: DEDUPLICATION ───────────────────────────────────
    // Evolution API can send the same message multiple times
    const { data: existingMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_message_id', parsed.whatsappMessageId)
      .limit(1)
      .maybeSingle()

    if (existingMsg) {
      log('dedup', { whatsappMessageId: parsed.whatsappMessageId, action: 'skipped' })
      return jsonResponse({ ok: true, skipped: true, reason: 'duplicate' })
    }

    // ─── STEP 2: LIGHTWEIGHT CONTENT EXTRACTION ──────────────────
    // Content that comes in the payload (text, sticker, location, contact,
    // button replies) is finalized here. Heavy media types (audio, image,
    // video) require download + analysis + storage upload and are handled
    // after the conversation row exists, so we can scope storage paths by
    // conversationId.
    let messageContent = parsed.content
    let messageMetadata: Record<string, unknown> = {}
    let originalAudioUrl: string | null = null

    if (parsed.messageType === 'document' && !parsed.content) {
      messageContent = '[Documento recebido]'
      messageMetadata = { original_type: 'document' }
    } else if (parsed.messageType === 'sticker') {
      messageContent = '[Sticker recebido]'
      messageMetadata = { original_type: 'sticker' }
    } else if (parsed.messageType === 'location' && parsed.content) {
      messageMetadata = { original_type: 'location' }
    } else if (parsed.messageType === 'contact' && parsed.content) {
      messageMetadata = { original_type: 'contact' }
    } else if (parsed.messageType === 'button_reply' && parsed.content) {
      messageMetadata = { original_type: 'button_reply' }
    }

    // ─── STEP 3: UPSERT CUSTOMER ────────────────────────────────
    const customer = await upsertCustomer(parsed.phone, parsed.name)

    log('customer', { customerId: customer.id, name: customer.name, isNew: customer._isNew })

    // ─── STEP 4: GET OR CREATE CONVERSATION ─────────────────────
    const { conversation, isNew: isNewConversation } = await getOrCreateConversation(customer.id)

    log('conversation', {
      conversationId: conversation.id,
      isNew: isNewConversation,
      assignedTo: conversation.assigned_to,
      status: conversation.status,
    })

    // ─── STEP 4a: ORIGIN POLL ────────────────────────────────────
    // First contact for this customer? Send a numbered text picker (works in
    // every WhatsApp client — listMessage failed silently in our tests).
    //
    // Reply detection (in priority order):
    //   1. button_reply with selectedRowId — only if some client did render
    //      the legacy listMessage and the customer actually clicked.
    //   2. Free text (1-5, "Mercado Livre", "Shopee", …) when there's a
    //      pending poll (last agent message has metadata.origin_poll=true)
    //      and the customer's source is still null. We only treat the text
    //      as a reply when the match is unambiguous.
    let skipAiPipeline = false

    if (parsed.messageType === 'button_reply' && parsed.selectedRowId) {
      const sourceFromRow = ORIGIN_ROW_TO_SOURCE[parsed.selectedRowId]
      if (sourceFromRow) {
        await supabase
          .from('customers')
          .update({ source: sourceFromRow })
          .eq('id', customer.id)
        log('origin_poll', { action: 'source_updated_from_button', source: sourceFromRow, rowId: parsed.selectedRowId })
      }
    } else if (!customer._isNew && customer.source == null && parsed.messageType === 'text' && parsed.content) {
      // Procura QUALQUER mensagem do poll na conversa — não só a última agent
      // msg. Bug histórico (caso Grace Kelly 25/05): cliente cumprimentou
      // ("Boa noite", "Td bem?") antes de responder com "5". O debounce de 20s
      // não esperou o "5" chegar (demorou 36s), a Ana respondeu à saudação,
      // e quando o "5" chegou, lastAgent já era a resposta da Ana — não o
      // poll. Detector falhava silenciosamente, source ficava null e a Ana
      // gerava SEGUNDA saudação respondendo o "5" como mensagem genérica.
      //
      // Fix: enquanto source=null, procurar poll em qualquer ponto da
      // conversa. Se match, atualizar source E silenciar AI desse turno —
      // a próxima mensagem real do cliente dispara resposta com source ok.
      const { data: pollMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .in('sender', ['agent', 'human_agent'])
        .filter('metadata->>origin_poll', 'eq', 'true')
        .limit(1)
        .maybeSingle()

      if (pollMsg) {
        const matched = matchOriginFromText(parsed.content)
        if (matched) {
          await supabase
            .from('customers')
            .update({ source: matched })
            .eq('id', customer.id)
          // Silencia AI nesse turno — o cliente acabou de identificar canal,
          // não tem pergunta real ainda. Próxima msg dele vai disparar Ana
          // normalmente, agora com source preenchido pro contexto.
          skipAiPipeline = true
          log('origin_poll', {
            action: 'source_updated_from_text_anytime',
            source: matched,
            content: parsed.content.slice(0, 40),
            ai_skipped: true,
          })
        } else {
          log('origin_poll', { action: 'text_did_not_match', content: parsed.content.slice(0, 40) })
        }
      }
    } else if ((customer._isNew || customer.source == null) && isNewConversation && conversation.assigned_to === 'agent') {
      // Envia o origin poll quando:
      //   (a) cliente é novo (primeiro contato absoluto) — caso óbvio, OU
      //   (b) cliente já existia mas source ainda é NULL — caso de import
      //       histórico ou criação por outro fluxo (ex: webhook ML/Shopee)
      //       que não passou pelo poll. Cobre defensivamente o gap em que
      //       customers existentes sem source nunca recebiam a pergunta.
      // Loop está protegido: assim que source for preenchido (qualquer valor,
      // incluindo 'whatsapp' = "outro"), a condição falha e o poll não repete.
      try {
        await sendText(parsed.phone, ORIGIN_POLL_TEXT)
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          sender: 'agent',
          content: ORIGIN_POLL_TEXT,
          message_type: 'text',
          metadata: { origin_poll: true },
        })
        skipAiPipeline = true
        log('origin_poll', {
          action: 'sent_text',
          conversationId: conversation.id,
          reason: customer._isNew ? 'new_customer' : 'existing_customer_null_source',
        })
      } catch (err) {
        // If the poll fails to send, fall through to Ana's normal pipeline so
        // the customer still gets a response.
        log('error', { step: 'origin_poll_send', error: String(err) })
      }
    }

    // ─── STEP 4b: HEAVY MEDIA HANDLERS (need conversationId) ─────
    // Audio: transcribed via Whisper, transcription becomes the visible content.
    // Image: uploaded to Storage (admin renders inline) + Gemini Vision
    //        description goes to metadata.ai_description (Ana reads via
    //        context-builder, but Yasmin sees only '[Imagem recebida]'/caption).
    // Video: same pattern as image — file uploaded, description backgrounded.
    if (parsed.messageType === 'audio') {
      messageContent = await handleAudioTranscription(parsed, messageMetadata, conversation.id)
      originalAudioUrl = parsed.mediaUrl
    } else if (parsed.messageType === 'image') {
      messageContent = await handleImageAnalysis(parsed, messageMetadata, conversation.id)
    } else if (parsed.messageType === 'video') {
      messageContent = await handleVideoAnalysis(parsed, messageMetadata, conversation.id)
    }

    // Ensure content is never empty (DB constraint: NOT NULL)
    // Sprint 1 instrumentation: capture raw payload signal so we can diagnose
    // which Evolution message types are slipping past the parser. Query later:
    //   SELECT metadata->>'raw_message_type', count(*)
    //   FROM messages WHERE content = '[Mensagem sem texto]' GROUP BY 1;
    if (!messageContent || messageContent.trim().length === 0) {
      messageContent = '[Mensagem sem texto]'
      const rawData = (body as { data?: { messageType?: string; message?: Record<string, unknown> } }).data
      messageMetadata = {
        ...messageMetadata,
        fallback_reason: 'empty_after_extraction',
        raw_message_type: rawData?.messageType ?? null,
        raw_message_keys: rawData?.message ? Object.keys(rawData.message) : [],
      }
      log('empty_fallback', {
        whatsappMessageId: parsed.whatsappMessageId,
        rawMessageType: rawData?.messageType ?? null,
        rawMessageKeys: rawData?.message ? Object.keys(rawData.message) : [],
      })
    }

    // ─── STEP 5: SAVE MESSAGE ───────────────────────────────────
    const { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender: 'customer',
        content: messageContent,
        message_type: parsed.messageType,
        original_audio_url: originalAudioUrl,
        whatsapp_message_id: parsed.whatsappMessageId,
        metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : null,
      })
      .select('id')
      .single()

    if (msgError) {
      log('error', { step: 'save_message', error: msgError.message })
      return jsonResponse({ ok: true, error: 'save_message_failed' })
    }

    log('message_saved', { messageId: savedMessage.id, conversationId: conversation.id })

    // Update customer last_contact_at
    await supabase
      .from('customers')
      .update({ last_contact_at: new Date().toISOString() })
      .eq('id', customer.id)

    // ─── STEP 6: CHECK IF AI SHOULD RESPOND ─────────────────────
    // The origin poll has already been sent in STEP 4a — Ana skips this turn
    // so the customer can pick a channel. Their text was still saved above
    // and will be consolidated by the debounce on the next inbound webhook.
    if (skipAiPipeline) {
      log('skip_ai', { reason: 'origin_poll_sent', conversationId: conversation.id })
      return jsonResponse({ ok: true, processed: true, originPollSent: true })
    }

    if (conversation.assigned_to !== 'agent') {
      log('skip_ai', {
        reason: 'human_assigned',
        assignedTo: conversation.assigned_to,
        conversationId: conversation.id,
      })
      return jsonResponse({ ok: true, processed: true, aiSkipped: true })
    }

    // ─── STEP 7: MESSAGE BUFFER (DEBOUNCE) ──────────────────────
    // When customers send multiple messages rapidly, wait for a quiet
    // period before processing. Only the LAST webhook invocation
    // within the buffer window will trigger AI processing.
    const config = await getConfig()
    const bufferMs = config.messageBufferSeconds * 1000
    const messageTimestamp = new Date().toISOString()
    const messageTimeMs = new Date(messageTimestamp).getTime()

    // Mark this message's arrival time on the conversation
    await supabase
      .from('conversations')
      .update({ last_customer_message_at: messageTimestamp })
      .eq('id', conversation.id)

    // Set pending_since only if no buffer is active yet (first message in burst)
    await supabase
      .from('conversations')
      .update({ pending_since: messageTimestamp })
      .eq('id', conversation.id)
      .is('pending_since', null)

    log('buffer_started', {
      conversationId: conversation.id,
      messageTimestamp,
      bufferMs,
    })

    // Wait for the buffer period to allow more messages to arrive
    if (bufferMs > 0) {
      await new Promise(resolve => setTimeout(resolve, bufferMs))
    }

    // ─── STEP 8: CHECK IF WE ARE THE LAST WEBHOOK ───────────────
    // Re-read conversation to see if a newer message arrived during our wait
    const { data: postBufferConv } = await supabase
      .from('conversations')
      .select('last_customer_message_at, pending_since')
      .eq('id', conversation.id)
      .single()

    if (!postBufferConv) {
      log('error', { step: 'buffer_check', error: 'conversation_gone' })
      return jsonResponse({ ok: true, error: 'conversation_not_found_after_buffer' })
    }

    // Compare timestamps numerically (DB returns different format than JS toISOString)
    const storedTimeMs = new Date(postBufferConv.last_customer_message_at!).getTime()

    // If a newer message arrived during our sleep, that webhook will handle dispatch
    if (storedTimeMs !== messageTimeMs) {
      log('buffer_yield', {
        conversationId: conversation.id,
        ourTimeMs: messageTimeMs,
        storedTimeMs,
      })
      return jsonResponse({ ok: true, buffered: true, reason: 'newer_message_arrived' })
    }

    // ─── STEP 9: CONSOLIDATE AND DISPATCH ───────────────────────
    // We are the last webhook — gather all customer messages since last agent reply
    // (Using last agent reply as anchor is more robust than pending_since timing)
    const { data: lastAgentMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conversation.id)
      .in('sender', ['agent', 'human_agent'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sinceTime = lastAgentMsg?.created_at ?? '1970-01-01T00:00:00Z'

    const { data: pendingMessages } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('conversation_id', conversation.id)
      .eq('sender', 'customer')
      .gt('created_at', sinceTime)
      .order('created_at', { ascending: true })

    const pendingCount = pendingMessages?.length ?? 1

    // Build consolidated message content
    let consolidatedContent: string
    if (pendingMessages && pendingMessages.length > 1) {
      consolidatedContent = pendingMessages.map(m => m.content).join('\n')
    } else {
      consolidatedContent = messageContent
    }

    // Reset buffer fields
    await supabase
      .from('conversations')
      .update({
        pending_since: null,
        pending_message_count: pendingCount,
      })
      .eq('id', conversation.id)

    log('buffer_dispatch', {
      conversationId: conversation.id,
      pendingCount,
      consolidatedLength: consolidatedContent.length,
    })

    // Fire-and-forget to process-message
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const processRequest = {
      conversationId: conversation.id,
      messageId: savedMessage.id,
      customerId: customer.id,
      messageContent: consolidatedContent,
      messageType: parsed.messageType,
      pendingMessageCount: pendingCount,
      whatsappMessageId: parsed.whatsappMessageId,
      // Edge-function pipeline owns dispatch end-to-end. Legacy N8N callers
      // omit this flag and continue to send the WhatsApp message themselves.
      dispatch: true,
    }

    // EdgeRuntime.waitUntil keeps this function alive until the fetch
    // completes — without it, the runtime suspends as soon as the response
    // below is returned and the invoke to process-message is cancelled.
    // Bug history: from 2026-05-08 to 2026-05-17, Ana stopped responding
    // entirely because of this exact race (see decisoes/2026-05).
    //
    // Hotfix 21/05/2026: logs estratégicos antes/dentro/depois do invoke
    // pra dar visibilidade quando o dispatch falhar silenciosamente. Bug
    // de 13 dias (08-21/05) só foi detectado porque Pedro abriu um caso
    // específico no painel — sem esses logs, o silêncio engole tudo.
    const dispatchStartedAt = Date.now()
    // Hotfix 21/05/2026: process-message agora roda com verify_jwt=false e
    // valida X-Internal-Token. Bypass do JWT stale/desalinhado que rejeitou
    // invocações por 13 dias (08-21/05). Secret em INTERNAL_DISPATCH_TOKEN.
    const internalDispatchToken = Deno.env.get('INTERNAL_DISPATCH_TOKEN') ?? ''
    log('dispatch_start', {
      conversationId: conversation.id,
      messageId: savedMessage.id,
      pendingCount,
      consolidatedLength: consolidatedContent.length,
      messageType: parsed.messageType,
      processUrl: `${supabaseUrl}/functions/v1/process-message`,
      hasServiceRoleKey: !!serviceRoleKey,
      hasInternalDispatchToken: !!internalDispatchToken,
    })

    const invokeProcessMessage = fetch(`${supabaseUrl}/functions/v1/process-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'X-Internal-Token': internalDispatchToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(processRequest),
    })
      .then(async r => {
        const bodyText = await r.text().catch(() => '<unreadable>')
        log('invoke_process_message_response', {
          conversationId: conversation.id,
          status: r.status,
          ok: r.ok,
          elapsedMs: Date.now() - dispatchStartedAt,
          bodyPreview: bodyText.slice(0, 400),
        })
      })
      .catch(err => log('invoke_process_message_error', {
        conversationId: conversation.id,
        error: String(err),
        stack: (err as Error)?.stack?.slice(0, 500) ?? null,
        elapsedMs: Date.now() - dispatchStartedAt,
      }))
    // @ts-ignore — EdgeRuntime is provided by Supabase's Deno Deploy runtime
    EdgeRuntime.waitUntil(invokeProcessMessage)

    log('dispatched', {
      conversationId: conversation.id,
      messageId: savedMessage.id,
      target: 'process-message',
      consolidatedMessages: pendingCount,
    })

    return jsonResponse({
      ok: true,
      processed: true,
      conversationId: conversation.id,
      messageId: savedMessage.id,
      consolidatedMessages: pendingCount,
    })

  } catch (err) {
    // ALWAYS return 200, even on unexpected errors
    log('error', { step: 'unhandled', error: String(err), stack: (err as Error).stack })
    return jsonResponse({ ok: true, error: 'internal_error' })
  }
})


// =================================================================
// HELPER: Audio Transcription + Storage upload
// =================================================================
// Visible content stays as the Whisper transcription (Yasmin can read what
// the customer said). Storage upload is parallel: metadata.audio_url points
// to the original .ogg/.m4a so the admin can also play the recording.
async function handleAudioTranscription(
  parsed: ParsedWhatsAppMessage,
  metadata: Record<string, unknown>,
  conversationId: string,
): Promise<string> {
  metadata.original_type = 'audio'

  try {
    // Retrieve audio as base64 from Evolution API
    const media = await getMediaBase64(parsed.whatsappMessageId)

    if (!media.base64) {
      log('audio', { action: 'no_base64', whatsappMessageId: parsed.whatsappMessageId })
      metadata.transcribed = false
      return '[Áudio recebido — transcrição indisponível. Por favor, envie sua mensagem em texto.]'
    }

    metadata.audio_mimetype = media.mimetype
    metadata.audio_size_bytes = Math.floor(media.base64.length * 0.75)

    // Upload original audio to Storage (non-fatal on failure — transcription
    // is the primary signal; the player is a nice-to-have for the admin).
    try {
      const upload = await uploadChatMedia({
        kind: 'audio',
        conversationId,
        whatsappMessageId: parsed.whatsappMessageId,
        base64: media.base64,
        mimeType: media.mimetype,
        fileName: media.fileName,
      })
      metadata.audio_url = upload.publicUrl
      metadata.audio_storage_path = upload.path
      log('audio', { action: 'uploaded_storage', path: upload.path, sizeBytes: upload.sizeBytes })
    } catch (err) {
      log('audio', { action: 'storage_upload_failed', error: String(err) })
      metadata.audio_storage_error = String(err)
    }

    // Transcribe via Groq Whisper
    const transcription = await transcribeAudio(media.base64, media.mimetype)

    log('audio', {
      action: 'transcribed',
      length: transcription.length,
      mimetype: media.mimetype,
    })

    metadata.transcribed = true
    metadata.transcription_length = transcription.length
    return transcription

  } catch (err) {
    log('audio', { action: 'transcription_failed', error: String(err) })
    metadata.transcribed = false
    metadata.transcription_error = String(err)
    return '[Áudio recebido — transcrição indisponível. Por favor, envie sua mensagem em texto.]'
  }
}


// =================================================================
// HELPER: Video Analysis (Storage upload + Gemini description in background)
// =================================================================
// Visible content for the admin: '[Vídeo recebido]' or the customer's caption.
// Storage upload: metadata.video_url so the admin can play the file inline.
// Gemini description: metadata.ai_description so context-builder can feed it
// to Ana without surfacing it in the conversation UI.
// Fallback chain: Gemini retry+model fallback → Whisper audio transcription
// (kept in metadata.audio_transcription so Ana still has signal) → just the
// stored URL. Nothing in the cascade pollutes the visible content.
async function handleVideoAnalysis(
  parsed: ParsedWhatsAppMessage,
  metadata: Record<string, unknown>,
  conversationId: string,
): Promise<string> {
  metadata.original_type = 'video'
  const caption = parsed.content?.trim() ?? ''
  const visibleContent = caption ? `[Vídeo recebido] ${caption}` : '[Vídeo recebido]'

  // Step 1: download the video bytes
  let media: { base64: string; mimetype: string; fileName: string } | null = null
  try {
    media = await getMediaBase64(parsed.whatsappMessageId)
  } catch (err) {
    log('video', { action: 'download_failed', error: String(err) })
    metadata.video_error = `download_failed: ${String(err)}`
    return visibleContent
  }

  if (!media?.base64) {
    log('video', { action: 'no_base64', whatsappMessageId: parsed.whatsappMessageId })
    metadata.video_error = 'no_base64'
    return visibleContent
  }

  metadata.video_mimetype = media.mimetype
  metadata.video_size_bytes = Math.floor(media.base64.length * 0.75)

  // Step 2: upload to Storage so the admin can play the file inline.
  // Failures here are non-fatal — analysis can proceed without storage.
  try {
    const upload = await uploadChatMedia({
      kind: 'video',
      conversationId,
      whatsappMessageId: parsed.whatsappMessageId,
      base64: media.base64,
      mimeType: media.mimetype,
      fileName: media.fileName,
    })
    metadata.video_url = upload.publicUrl
    metadata.video_storage_path = upload.path
    log('video', { action: 'uploaded_storage', path: upload.path, sizeBytes: upload.sizeBytes })
  } catch (err) {
    log('video', { action: 'storage_upload_failed', error: String(err) })
    metadata.video_storage_error = String(err)
  }

  // Step 3: Gemini for visual + audio understanding (with retry + fallback)
  try {
    const analysis = await analyzeVideo(media.base64, media.mimetype)
    log('video', {
      action: 'analyzed_gemini',
      model: analysis.model,
      attempts: analysis.attempts,
      length: analysis.description.length,
      tokensUsed: analysis.tokensUsed,
    })
    metadata.video_analyzed = true
    metadata.video_provider = analysis.model
    metadata.video_attempts = analysis.attempts
    metadata.video_tokens_used = analysis.tokensUsed
    metadata.ai_description = caption
      ? `Legenda do cliente: "${caption}". ${analysis.description}`
      : analysis.description
    return visibleContent
  } catch (err) {
    log('video', { action: 'gemini_failed', error: String(err) })
    metadata.video_analyzed = false
    metadata.video_error = String(err)
  }

  // Step 4: fallback to Whisper audio transcription so Ana still has signal
  try {
    const transcription = await transcribeAudio(media.base64, media.mimetype)
    log('video', { action: 'fallback_whisper_ok', length: transcription.length })
    metadata.video_provider = 'whisper-fallback'
    metadata.video_audio_transcribed = true
    metadata.ai_description = caption
      ? `Vídeo sem análise visual. Legenda do cliente: "${caption}". Áudio do vídeo: ${transcription}`
      : `Vídeo sem análise visual. Áudio do vídeo: ${transcription}`
  } catch (err) {
    log('video', { action: 'fallback_whisper_failed', error: String(err) })
    metadata.video_audio_transcribed = false
    metadata.video_audio_error = String(err)
    metadata.ai_description = caption
      ? `Cliente enviou um vídeo sem áudio interpretável. Legenda: "${caption}".`
      : 'Cliente enviou um vídeo sem áudio interpretável e não foi possível analisar visualmente.'
  }

  return visibleContent
}


// =================================================================
// HELPER: Image Analysis (Storage upload + Gemini Vision description)
// =================================================================
// Same pattern as handleVideoAnalysis. Visible content stays clean
// ('[Imagem recebida]' or caption). Description goes to metadata.ai_description.
async function handleImageAnalysis(
  parsed: ParsedWhatsAppMessage,
  metadata: Record<string, unknown>,
  conversationId: string,
): Promise<string> {
  metadata.original_type = 'image'
  const caption = parsed.content?.trim() ?? ''
  const visibleContent = caption ? `[Imagem recebida] ${caption}` : '[Imagem recebida]'

  let media: { base64: string; mimetype: string; fileName: string } | null = null
  try {
    media = await getMediaBase64(parsed.whatsappMessageId)
  } catch (err) {
    log('image', { action: 'download_failed', error: String(err) })
    metadata.image_error = `download_failed: ${String(err)}`
    return visibleContent
  }

  if (!media?.base64) {
    log('image', { action: 'no_base64', whatsappMessageId: parsed.whatsappMessageId })
    metadata.image_error = 'no_base64'
    return visibleContent
  }

  metadata.image_mimetype = media.mimetype
  metadata.image_size_bytes = Math.floor(media.base64.length * 0.75)

  // Storage upload for the admin
  try {
    const upload = await uploadChatMedia({
      kind: 'image',
      conversationId,
      whatsappMessageId: parsed.whatsappMessageId,
      base64: media.base64,
      mimeType: media.mimetype,
      fileName: media.fileName,
    })
    metadata.image_url = upload.publicUrl
    metadata.image_storage_path = upload.path
    log('image', { action: 'uploaded_storage', path: upload.path, sizeBytes: upload.sizeBytes })
  } catch (err) {
    log('image', { action: 'storage_upload_failed', error: String(err) })
    metadata.image_storage_error = String(err)
  }

  // Gemini Vision description for Ana
  try {
    const analysis = await analyzeImage(media.base64, media.mimetype)
    log('image', {
      action: 'analyzed_gemini',
      model: analysis.model,
      attempts: analysis.attempts,
      length: analysis.description.length,
      tokensUsed: analysis.tokensUsed,
    })
    metadata.image_analyzed = true
    metadata.image_provider = analysis.model
    metadata.image_attempts = analysis.attempts
    metadata.image_tokens_used = analysis.tokensUsed
    metadata.ai_description = caption
      ? `Legenda do cliente: "${caption}". ${analysis.description}`
      : analysis.description
  } catch (err) {
    log('image', { action: 'gemini_failed', error: String(err) })
    metadata.image_analyzed = false
    metadata.image_error = String(err)
    metadata.ai_description = caption
      ? `Cliente enviou uma imagem com a legenda "${caption}", mas a análise visual não está disponível agora.`
      : 'Cliente enviou uma imagem, mas a análise visual não está disponível agora.'
  }

  return visibleContent
}


// =================================================================
// HELPER: Upsert Customer
// =================================================================
async function upsertCustomer(
  phone: string,
  pushName: string | null,
): Promise<{ id: string; name: string | null; source: string | null; _isNew: boolean }> {
  // Try to find existing customer
  const { data: existing } = await supabase
    .from('customers')
    .select('id, name, source')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Update name if we got a new pushName and current name is empty
    if (pushName && !existing.name) {
      await supabase
        .from('customers')
        .update({ name: pushName })
        .eq('id', existing.id)
    }
    return {
      id: existing.id,
      name: existing.name ?? pushName,
      source: (existing as { source?: string | null }).source ?? null,
      _isNew: false,
    }
  }

  // Create new customer.
  // source stays NULL until the origin poll is answered — that way the
  // admin only shows a platform badge (Mercado Livre / Shopee / …) for
  // customers we actually identified, not for everyone who happens to
  // come in via WhatsApp by default.
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      phone,
      name: pushName,
      source: null,
      first_contact_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    })
    .select('id, name')
    .single()

  if (error) {
    // Race condition: another request might have created the customer
    // Try to fetch again
    const { data: retry } = await supabase
      .from('customers')
      .select('id, name, source')
      .eq('phone', phone)
      .limit(1)
      .single()

    if (retry) {
      return {
        id: retry.id,
        name: retry.name,
        source: (retry as { source?: string | null }).source ?? null,
        _isNew: false,
      }
    }

    throw new Error(`Failed to create customer: ${error.message}`)
  }

  return { id: newCustomer.id, name: newCustomer.name, source: null, _isNew: true }
}


// =================================================================
// HELPER: Get or Create Conversation
// =================================================================
async function getOrCreateConversation(
  customerId: string,
): Promise<{ conversation: { id: string; assigned_to: string; status: string }; isNew: boolean }> {
  // Find active (non-resolved) conversation for this customer
  const { data: active } = await supabase
    .from('conversations')
    .select('id, assigned_to, status, created_at')
    .eq('customer_id', customerId)
    .neq('status', 'resolved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (active) {
    // Check if session has expired (24h since last message)
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', active.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastActivityTime = lastMessage
      ? new Date(lastMessage.created_at).getTime()
      : new Date(active.created_at).getTime()

    const timeSinceLastActivity = Date.now() - lastActivityTime

    if (timeSinceLastActivity > SESSION_WINDOW_MS) {
      // Session expired — resolve old conversation and create new one
      log('session_expired', {
        oldConversationId: active.id,
        hoursSinceLastActivity: Math.round(timeSinceLastActivity / 3600000),
      })

      await supabase
        .from('conversations')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_summary: 'Sessão expirada (>24h sem atividade)',
        })
        .eq('id', active.id)

      return { conversation: await createConversation(customerId), isNew: true }
    }

    // Active conversation within 24h window
    return {
      conversation: { id: active.id, assigned_to: active.assigned_to, status: active.status },
      isNew: false,
    }
  }

  // No active conversation — create new
  return { conversation: await createConversation(customerId), isNew: true }
}

async function createConversation(
  customerId: string,
): Promise<{ id: string; assigned_to: string; status: string }> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      customer_id: customerId,
      channel: 'whatsapp',
      status: 'active',
      assigned_to: 'agent',
      priority: 'normal',
      started_at: new Date().toISOString(),
    })
    .select('id, assigned_to, status')
    .single()

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`)
  }

  return data
}
