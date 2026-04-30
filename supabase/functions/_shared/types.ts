// =================================================================
// BUDAMIX AI AGENT — Types for Supabase Edge Functions (Deno)
// Adapted from src/types/index.ts + Evolution API v2 + Claude API
// =================================================================

// Re-export marketplace types for convenience
export type {
  MarketplaceToken,
  MarketplaceProductMapping,
  MarketplaceQuestion,
  MarketplaceChat,
  MarketplaceChatMessage,
} from './ml-types.ts'

// ------ Customers ------

export interface Customer {
  id: string
  phone: string
  name: string | null
  email: string | null
  source: CustomerSource | null
  marketplace_user_id: string | null
  notes: string | null
  tags: string[] | null
  total_conversations: number
  first_contact_at: string | null
  last_contact_at: string | null
  created_at: string
  updated_at: string
}

export type CustomerSource = 'whatsapp' | 'amazon' | 'mercado_livre' | 'shopee' | 'site'

export type CustomerInsert = Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'total_conversations'> & {
  id?: string
  total_conversations?: number
}

// ------ Conversations ------

export interface Conversation {
  id: string
  customer_id: string
  channel: string
  status: ConversationStatus
  category: ConversationCategory | null
  subcategory: string | null
  sentiment: Sentiment | null
  priority: Priority
  assigned_to: string
  resolution_summary: string | null
  satisfaction_score: number | null
  started_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
  // Message buffer (debounce)
  pending_since: string | null
  pending_message_count: number
  last_customer_message_at: string | null
}

export type ConversationStatus = 'active' | 'waiting_human' | 'resolved' | 'escalated'
export type ConversationCategory = 'pre_venda' | 'pos_venda' | 'reclamacao' | 'duvida' | 'venda_direta'
export type Sentiment = 'positivo' | 'neutro' | 'negativo' | 'critico'
export type Priority = 'baixa' | 'normal' | 'alta' | 'urgente'

export type ConversationInsert = Omit<Conversation, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type ConversationUpdate = Partial<ConversationInsert>

export interface ConversationWithCustomer extends Conversation {
  customer: Customer
}

// ------ Messages ------

export interface Message {
  id: string
  conversation_id: string
  sender: MessageSender
  content: string
  message_type: MessageType
  original_audio_url: string | null
  whatsapp_message_id: string | null
  metadata: Record<string, unknown> | null
  tokens_used: number | null
  response_time_ms: number | null
  created_at: string
}

export type MessageSender = 'customer' | 'agent' | 'human_agent'
export type MessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'button_reply'

export type MessageInsert = Omit<Message, 'id' | 'created_at'> & {
  id?: string
}

// ------ Products ------

export interface Product {
  id: string
  sku: string
  product_line: string | null
  name: string
  short_description: string | null
  full_description: string | null
  material: string | null
  dimensions: Record<string, string> | null
  variations: ProductVariation[] | null
  price_site: number | null
  price_marketplace: Record<string, number> | null
  stock_quantity: number
  stock_status: StockStatus
  images: string[] | null
  marketplace_links: Record<string, string> | null
  site_link: string | null
  usage_suggestions: string | null
  differentials: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductVariation {
  cor?: string
  tamanho?: string
  sku: string
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

// ------ Policies ------

export interface Policy {
  id: string
  category: PolicyCategory
  marketplace: string | null
  title: string
  content: string
  summary: string | null
  is_active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export type PolicyCategory = 'troca_devolucao' | 'frete' | 'prazo_envio' | 'garantia' | 'pagamento'

// ------ FAQ ------

export interface FAQ {
  id: string
  question: string
  answer: string
  category: string | null
  keywords: string[] | null
  usage_count: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ------ Escalations ------

export interface Escalation {
  id: string
  conversation_id: string
  reason: string
  urgency: Priority
  status: EscalationStatus
  notes: string | null
  escalated_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export type EscalationStatus = 'pending' | 'in_progress' | 'resolved'

// ------ Agent Config ------

export interface AgentConfig {
  id: string
  config_key: string
  config_value: string
  description: string | null
  updated_at: string
}

export type AgentConfigKey =
  | 'system_prompt'
  | 'agent_name'
  | 'working_hours'
  | 'max_messages_before_escalation'
  | 'escalation_keywords'
  | 'greeting_message'
  | 'away_message'
  | 'model'
  | 'max_tokens'
  | 'temperature'
  | 'message_buffer_seconds'
  | 'max_chunks_per_response'
  | 'max_chars_per_chunk'
  | 'max_total_chars'

export interface WorkingHours {
  start: string
  end: string
  timezone: string
}

// ------ Analytics ------

export interface AnalyticsDaily {
  id: string
  date: string
  total_conversations: number
  total_messages: number
  avg_response_time_ms: number | null
  avg_messages_per_conversation: number | null
  resolution_rate: number | null
  escalation_rate: number | null
  sentiment_positive: number
  sentiment_neutral: number
  sentiment_negative: number
  top_categories: Array<{ category: string; count: number }> | null
  top_products_asked: Array<{ sku: string; count: number }> | null
  total_tokens_used: number
  estimated_cost: number | null
  created_at: string
}

// =================================================================
// PHASE 4 SPECIFIC TYPES
// =================================================================

// ------ Anthropic API ------

export interface AnthropicMessageResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{ type: 'text'; text: string }>
  model: string
  stop_reason: string | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

// ------ Intent Classification (Claude Haiku output) ------

export type ClassifierIntention =
  | 'pre_sale'
  | 'post_sale'
  | 'complaint'
  | 'faq'
  | 'greeting'
  | 'farewell'
  | 'product_inquiry'
  | 'order_status'
  | 'human_request'
  | 'other'

export type ClassifierSentiment = 'positive' | 'negative' | 'neutral'

export interface ClassificationResult {
  intention: ClassifierIntention
  subcategory: string
  needs_product_lookup: boolean
  needs_order_lookup: boolean
  sentiment: ClassifierSentiment
  should_escalate: boolean
  escalation_reason: string | null
  confidence: number // 0-1
}

// ------ Evolution API v2 — Webhook Payload ------

export interface EvolutionWebhookPayload {
  event: string                    // "messages.upsert"
  instance: string                 // Instance name
  data: EvolutionMessageData
  sender: string                   // "5511999999999@s.whatsapp.net"
  date_time?: string               // ISO 8601
  server_url?: string
  apikey?: string
}

export interface EvolutionMessageData {
  key: {
    remoteJid: string              // "5511999999999@s.whatsapp.net"
    fromMe: boolean
    id: string                     // WhatsApp message ID
  }
  pushName?: string                // Contact display name
  message?: EvolutionMessageContent
  messageType?: string             // "conversation" | "extendedTextMessage" | "audioMessage" | etc.
  messageTimestamp?: number
  status?: string
  instanceId?: string
  source?: string
}

export interface EvolutionMessageContent {
  conversation?: string
  extendedTextMessage?: {
    text: string
    contextInfo?: Record<string, unknown>
  }
  audioMessage?: {
    url: string
    mimetype: string
    seconds: number
    ptt: boolean
    mediaKey?: string
    directPath?: string
  }
  imageMessage?: {
    url: string
    mimetype: string
    caption?: string
    height?: number
    width?: number
    jpegThumbnail?: string
    mediaKey?: string
    directPath?: string
  }
  documentMessage?: {
    url: string
    mimetype: string
    fileName?: string
    caption?: string
    pageCount?: number
    mediaKey?: string
    directPath?: string
  }
  videoMessage?: {
    url: string
    mimetype: string
    caption?: string
    seconds?: number
    mediaKey?: string
    directPath?: string
  }
  reactionMessage?: {
    key: { id: string }
    text: string
  }
  stickerMessage?: {
    url?: string
    mimetype?: string
    fileSha256?: string
    isAnimated?: boolean
  }
  locationMessage?: {
    degreesLatitude: number
    degreesLongitude: number
    name?: string
    address?: string
  }
  liveLocationMessage?: {
    degreesLatitude: number
    degreesLongitude: number
    caption?: string
  }
  contactMessage?: {
    displayName: string
    vcard?: string
  }
  contactsArrayMessage?: {
    contacts: Array<{ displayName: string; vcard?: string }>
  }
  buttonsResponseMessage?: {
    selectedButtonId?: string
    selectedDisplayText: string
  }
  templateButtonReplyMessage?: {
    selectedId?: string
    selectedDisplayText: string
  }
  listResponseMessage?: {
    title: string
    description?: string
    singleSelectReply?: { selectedRowId: string }
  }
  // Wrappers — content is nested inside .message
  ephemeralMessage?: { message: EvolutionMessageContent }
  viewOnceMessage?: { message: EvolutionMessageContent }
  viewOnceMessageV2?: { message: EvolutionMessageContent }
  // Protocol messages (deletes, edits, etc.) — should be discarded
  protocolMessage?: Record<string, unknown>
  editedMessage?: Record<string, unknown>
  messageContextInfo?: Record<string, unknown>
}

// ------ Evolution API v2 — Outgoing Messages ------

export interface WhatsAppSendTextRequest {
  number: string                   // "5511999999999"
  text: string
  delay?: number                   // ms delay before sending
  linkPreview?: boolean
}

export interface WhatsAppSendMediaRequest {
  number: string
  mediatype: 'image' | 'video' | 'document' | 'audio'
  mimetype: string
  caption?: string
  media: string                    // URL or base64
  fileName?: string
  delay?: number
}

export interface WhatsAppPresenceRequest {
  number: string
  delay: number                    // ms to show typing indicator
  presence: 'composing' | 'recording'
}

// ------ Parsed Message (internal, normalized from Evolution payload) ------

export interface ParsedWhatsAppMessage {
  phone: string                    // "5511999999999" (no @s.whatsapp.net)
  name: string | null              // pushName
  messageType: MessageType         // normalized: 'text' | 'audio' | 'image' | 'document'
  content: string                  // text content or caption, empty for pure media
  whatsappMessageId: string        // Evolution message ID
  timestamp: number                // Unix seconds
  mediaUrl: string | null          // Encrypted WA CDN URL (needs getBase64 to retrieve)
  isFromMe: boolean
  /** Row ID the customer picked in a sendList reply, when applicable. */
  selectedRowId?: string | null
}

// ------ Process Message (IA pipeline) ------

export interface ProcessMessageRequest {
  conversationId: string
  messageId: string
  customerId: string
  messageContent: string
  messageType: MessageType
  pendingMessageCount?: number
  whatsappMessageId?: string
  // When true, process-message owns the dispatch path: it calls send-whatsapp
  // for normal responses and escalate for escalations. When false/undefined,
  // it returns the response payload and the caller is responsible for sending
  // the WhatsApp message (legacy N8N flow).
  dispatch?: boolean
}

export interface ProcessMessageResponse {
  success: boolean
  responseMessageId: string | null
  classification: ClassificationResult | null
  escalated: boolean
  tokensUsed: number
  responseTimeMs: number
  error?: string
}

// ------ Context Bundle (assembled context for Claude) ------

export interface ContextBundle {
  systemPrompt: string
  agentName: string
  customer: {
    id: string
    name: string | null
    phone: string
    tags: string[] | null
    source: string | null
    totalConversations: number
    notes: string | null
  }
  conversationHistory: Array<{
    role: 'customer' | 'agent' | 'human_agent'
    content: string
    timestamp: string
  }>
  relevantProducts: Array<{
    sku: string
    name: string
    priceSite: number | null
    priceMarketplace: Record<string, number> | null
    stockStatus: StockStatus
    stockQuantity: number
    shortDescription: string | null
    fullDescription: string | null
    differentials: string | null
    usageSuggestions: string | null
    material: string | null
    siteLink: string | null
    marketplaceLinks: Record<string, string> | null
  }>
  relevantPolicies: Array<{
    title: string
    category: string
    marketplace: string | null
    summary: string | null
    content: string
  }>
  relevantFAQs: Array<{
    question: string
    answer: string
    category: string | null
  }>
  currentMessage: string
  messageCount: number
  pendingMessageCount: number
  isWithinWorkingHours: boolean
  productSource: 'semantic' | 'catalog' | 'none'
  platformListings?: ProductListingContext[]
  enrichedProductContext?: string
  relevantCorrections?: Array<{
    originalQuestion: string
    recommendedResponse: string
    similarity: number
  }>
}

export interface ProductListingContext {
  platform: string
  platformItemId: string | null
  listingTitle: string
  listingUrl: string | null
  listingType: string
  productSku: string
}
