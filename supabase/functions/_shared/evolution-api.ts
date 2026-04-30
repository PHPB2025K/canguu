// Evolution API v2 client for WhatsApp
// Handles sending messages, media, and parsing incoming webhooks

import type {
  EvolutionWebhookPayload,
  EvolutionMessageData,
  ParsedWhatsAppMessage,
  MessageType,
  WhatsAppSendTextRequest,
  WhatsAppSendMediaRequest,
  WhatsAppPresenceRequest,
} from './types.ts'

// Env vars — set in Supabase Edge Function secrets
const API_URL = () => Deno.env.get('WHATSAPP_API_URL') ?? ''
const API_KEY = () => Deno.env.get('WHATSAPP_API_KEY') ?? ''
const INSTANCE = () => Deno.env.get('WHATSAPP_INSTANCE_NAME') ?? ''

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'apikey': API_KEY(),
  }
}

async function post(path: string, body: unknown): Promise<unknown> {
  const url = `${API_URL()}${path}/${encodeURIComponent(INSTANCE())}`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution API error ${res.status}: ${text}`)
  }

  return res.json()
}

// =================================================================
// SEND MESSAGES
// =================================================================

/** Send a text message via WhatsApp */
export async function sendText(to: string, text: string): Promise<unknown> {
  const body: WhatsAppSendTextRequest = {
    number: to,
    text,
    delay: 1000,
    linkPreview: true,
  }
  return post('/message/sendText', body)
}

/** Send a media message (image, video, document) via WhatsApp */
export async function sendMedia(
  to: string,
  mediaUrl: string,
  options?: {
    mediatype?: 'image' | 'video' | 'document' | 'audio'
    mimetype?: string
    caption?: string
    fileName?: string
  }
): Promise<unknown> {
  const body: WhatsAppSendMediaRequest = {
    number: to,
    mediatype: options?.mediatype ?? 'image',
    mimetype: options?.mimetype ?? 'image/jpeg',
    media: mediaUrl,
    caption: options?.caption,
    fileName: options?.fileName,
    delay: 1000,
  }
  return post('/message/sendMedia', body)
}

/** Set typing indicator (composing/recording) */
export async function setPresence(
  to: string,
  composing: boolean,
  durationMs = 3000
): Promise<unknown> {
  const body: WhatsAppPresenceRequest = {
    number: to,
    delay: durationMs,
    presence: composing ? 'composing' : 'recording',
  }
  return post('/chat/sendPresence', body)
}

/** Get media content as base64 from an incoming message */
export async function getMediaBase64(messageId: string): Promise<{
  base64: string
  mimetype: string
  fileName: string
}> {
  const result = await post('/chat/getBase64FromMediaMessage', {
    message: { key: { id: messageId } },
    convertToMp4: false,
  }) as { base64: string; mimetype: string; fileName: string }

  return result
}

/**
 * Send a WhatsApp list-message (interactive selector). Single section is
 * enough for short pickers (e.g. "what platform did you come from?").
 *
 * `rowId` is the value the customer's reply will carry — keep it stable
 * (`mercado_livre`, `shopee`, …) so callers can match on it.
 */
export async function sendList(args: {
  to: string
  title: string
  text: string
  buttonText: string
  footerText?: string
  rows: Array<{ rowId: string; title: string; description?: string }>
  sectionTitle?: string
}): Promise<unknown> {
  const body = {
    number: args.to,
    title: args.title,
    description: args.text,
    buttonText: args.buttonText,
    footerText: args.footerText ?? '',
    sections: [
      {
        title: args.sectionTitle ?? args.title,
        rows: args.rows.map(r => ({
          title: r.title,
          rowId: r.rowId,
          description: r.description ?? '',
        })),
      },
    ],
    delay: 800,
  }
  return post('/message/sendList', body)
}

// =================================================================
// PARSE INCOMING WEBHOOK
// =================================================================

/** Extract phone number from JID (remove @s.whatsapp.net, @g.us, @lid) */
function phoneFromJid(jid: string): string {
  if (!jid) return ''
  return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '')
}

/** Determine normalized message type from Evolution's messageType string */
function normalizeMessageType(evolutionType: string | undefined): MessageType {
  switch (evolutionType) {
    case 'conversation':
    case 'extendedTextMessage':
      return 'text'
    case 'audioMessage':
      return 'audio'
    case 'imageMessage':
      return 'image'
    case 'videoMessage':
      return 'video'
    case 'documentMessage':
      return 'document'
    case 'stickerMessage':
      return 'sticker'
    case 'locationMessage':
    case 'liveLocationMessage':
      return 'location'
    case 'contactMessage':
    case 'contactsArrayMessage':
      return 'contact'
    case 'buttonsResponseMessage':
    case 'templateButtonReplyMessage':
    case 'listResponseMessage':
      return 'button_reply'
    default:
      return 'text'
  }
}

/** Infer the messageType discriminator from the content keys (used after unwrap) */
function inferMessageTypeFromContent(msg: EvolutionMessageContent): string {
  if (msg.conversation) return 'conversation'
  if (msg.extendedTextMessage) return 'extendedTextMessage'
  if (msg.audioMessage) return 'audioMessage'
  if (msg.imageMessage) return 'imageMessage'
  if (msg.videoMessage) return 'videoMessage'
  if (msg.documentMessage) return 'documentMessage'
  if (msg.stickerMessage) return 'stickerMessage'
  if (msg.locationMessage) return 'locationMessage'
  if (msg.liveLocationMessage) return 'liveLocationMessage'
  if (msg.contactMessage) return 'contactMessage'
  if (msg.contactsArrayMessage) return 'contactsArrayMessage'
  if (msg.buttonsResponseMessage) return 'buttonsResponseMessage'
  if (msg.templateButtonReplyMessage) return 'templateButtonReplyMessage'
  if (msg.listResponseMessage) return 'listResponseMessage'
  return 'unknown'
}

/**
 * WhatsApp wraps "view once" and "ephemeral" messages around the actual content.
 * We unwrap up to 3 levels deep and rewrite messageType so the rest of the pipeline
 * sees the inner payload.
 */
function unwrapNestedMessage(data: EvolutionMessageData): EvolutionMessageData {
  if (!data.message) return data
  let message = data.message
  let messageType = data.messageType

  for (let i = 0; i < 3; i++) {
    const inner =
      message.ephemeralMessage?.message ??
      message.viewOnceMessage?.message ??
      message.viewOnceMessageV2?.message
    if (!inner) break
    message = inner
    messageType = inferMessageTypeFromContent(inner)
  }

  if (message === data.message) return data
  return { ...data, message, messageType }
}

/** Extract text content from any message type */
function extractTextContent(data: EvolutionMessageData): string {
  const msg = data.message
  if (!msg) return ''

  if (msg.conversation) return msg.conversation
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text
  if (msg.imageMessage?.caption) return msg.imageMessage.caption
  if (msg.videoMessage?.caption) return msg.videoMessage.caption
  if (msg.documentMessage?.caption) return msg.documentMessage.caption

  // Button / list replies — selectedDisplayText IS the customer's reply
  if (msg.buttonsResponseMessage?.selectedDisplayText) return msg.buttonsResponseMessage.selectedDisplayText
  if (msg.templateButtonReplyMessage?.selectedDisplayText) return msg.templateButtonReplyMessage.selectedDisplayText
  if (msg.listResponseMessage?.title) return msg.listResponseMessage.title

  // Location — return formatted descriptor so the LLM can reason about it
  const loc = msg.locationMessage ?? msg.liveLocationMessage
  if (loc && typeof loc.degreesLatitude === 'number' && typeof loc.degreesLongitude === 'number') {
    const label = msg.locationMessage?.name || msg.locationMessage?.address
    return label
      ? `[Localização compartilhada: ${label} (${loc.degreesLatitude}, ${loc.degreesLongitude})]`
      : `[Localização compartilhada: ${loc.degreesLatitude}, ${loc.degreesLongitude}]`
  }

  // Contact card(s)
  if (msg.contactMessage?.displayName) {
    return `[Contato compartilhado: ${msg.contactMessage.displayName}]`
  }
  if (msg.contactsArrayMessage?.contacts && msg.contactsArrayMessage.contacts.length > 0) {
    const names = msg.contactsArrayMessage.contacts
      .map(c => c.displayName)
      .filter((n): n is string => Boolean(n))
    if (names.length > 0) return `[Contatos compartilhados: ${names.join(', ')}]`
  }

  return ''
}

/** Extract the rowId/buttonId the customer selected, when present. */
function extractSelectedRowId(data: EvolutionMessageData): string | null {
  const msg = data.message
  if (!msg) return null
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId
  }
  if (msg.buttonsResponseMessage?.selectedButtonId) {
    return msg.buttonsResponseMessage.selectedButtonId
  }
  if (msg.templateButtonReplyMessage?.selectedId) {
    return msg.templateButtonReplyMessage.selectedId
  }
  return null
}

/** Extract media URL from message (encrypted WA CDN — needs getBase64 to retrieve) */
function extractMediaUrl(data: EvolutionMessageData): string | null {
  const msg = data.message
  if (!msg) return null

  if (msg.audioMessage?.url) return msg.audioMessage.url
  if (msg.imageMessage?.url) return msg.imageMessage.url
  if (msg.documentMessage?.url) return msg.documentMessage.url
  if (msg.videoMessage?.url) return msg.videoMessage.url
  if (msg.stickerMessage?.url) return msg.stickerMessage.url

  return null
}

/**
 * Parse raw Evolution API webhook payload into a normalized ParsedWhatsAppMessage.
 * Returns null if the payload is not a valid incoming message (e.g., status update,
 * group message, or message sent by the connected account).
 */
export function parseWebhookPayload(body: unknown): ParsedWhatsAppMessage | null {
  const payload = body as EvolutionWebhookPayload

  // Only process messages.upsert events (accept both lowercase and UPPERCASE formats)
  const event = (payload.event ?? '').toLowerCase().replace(/_/g, '.')
  if (event !== 'messages.upsert') return null

  let data = payload.data
  if (!data?.key) return null

  // Skip messages sent by us (fromMe = true)
  if (data.key.fromMe) return null

  // Skip group messages (only handle individual chats)
  if (data.key.remoteJid?.endsWith('@g.us')) return null

  // Skip non-actionable signaling messages
  if (data.messageType === 'reactionMessage') return null
  if (data.messageType === 'protocolMessage') return null
  if (data.message?.protocolMessage) return null
  if (data.message?.editedMessage) return null

  // Unwrap ephemeral / view-once wrappers BEFORE extracting content
  data = unwrapNestedMessage(data)

  const phone = phoneFromJid(data.key.remoteJid)
  if (!phone) return null

  return {
    phone,
    name: data.pushName ?? null,
    messageType: normalizeMessageType(data.messageType),
    content: extractTextContent(data),
    whatsappMessageId: data.key.id,
    timestamp: data.messageTimestamp ?? Math.floor(Date.now() / 1000),
    mediaUrl: extractMediaUrl(data),
    isFromMe: false,
    selectedRowId: extractSelectedRowId(data),
  }
}
