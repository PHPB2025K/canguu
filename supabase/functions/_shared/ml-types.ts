// =================================================================
// Mercado Livre API — Types
// =================================================================

// ------ OAuth ------

export interface MLTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  user_id: number
  refresh_token: string
}

// ------ Questions (pre-sale) ------

export interface MLQuestion {
  id: number
  item_id: string
  seller_id: number
  text: string
  status: 'UNANSWERED' | 'ANSWERED' | 'CLOSED_UNANSWERED' | 'UNDER_REVIEW'
  date_created: string
  answer: MLAnswer | null
  from: {
    id: number
    nickname: string
  }
}

export interface MLAnswer {
  text: string
  status: string
  date_created: string
}

export interface MLQuestionsResponse {
  total: number
  limit: number
  questions: MLQuestion[]
}

// ------ Items (products) ------

export interface MLItem {
  id: string
  title: string
  price: number
  currency_id: string
  category_id: string
  permalink: string
  thumbnail: string
  pictures: Array<{
    id: string
    url: string
    secure_url: string
  }>
  attributes: Array<{
    id: string
    name: string
    value_name: string | null
  }>
  status: 'active' | 'paused' | 'closed' | 'under_review' | 'inactive'
  available_quantity: number
  sold_quantity: number
}

export interface MLItemDescription {
  text: string
  plain_text: string
}

// ------ Messages (post-sale) ------

export interface MLMessage {
  id: string
  text: string
  date_created: string
  date_read: string | null
  from: {
    user_id: number
  }
  to: {
    user_id: number
  }
  message_attachments: Array<{
    filename: string
    type: string
  }> | null
}

export interface MLMessagesResponse {
  paging: {
    total: number
    offset: number
    limit: number
  }
  results: MLMessage[]
}

// ------ Orders ------

export interface MLOrder {
  id: number
  status: 'confirmed' | 'payment_required' | 'payment_in_process' | 'partially_paid' | 'paid' | 'partially_refunded' | 'pending_cancel' | 'cancelled'
  order_items: Array<{
    item: {
      id: string
      title: string
    }
    quantity: number
    unit_price: number
  }>
  buyer: {
    id: number
    nickname: string
    first_name: string
    last_name: string
  }
  shipping: {
    id: number | null
    status: string | null
  } | null
  date_created: string
  total_amount: number
}

// ------ User ------

export interface MLUser {
  id: number
  nickname: string
  email: string
  first_name: string
  last_name: string
  country_id: string
}

// ------ DB row types ------
// NOTE: marketplace_questions, marketplace_chats, marketplace_chat_messages
// were originally created by Lovable with different column names.
// We added our columns via ALTER TABLE. Both column sets coexist.

export interface MarketplaceToken {
  id: string
  platform: string
  seller_id: string
  app_id: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  seller_nickname: string | null
  status: 'pending' | 'active' | 'expired' | 'revoked'
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface MarketplaceProductMapping {
  id: string
  platform: string
  external_item_id: string
  product_id: string | null
  external_title: string | null
  external_price: number | null
  external_url: string | null
  is_active: boolean
  is_kit: boolean
  kit_quantity: number
  needs_manual_review: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface MarketplaceQuestion {
  id: string
  platform: string
  // Lovable original columns
  platform_question_id: string      // ML question ID
  platform_item_id: string          // ML item ID (MLB...)
  product_name: string              // Title from ML
  product_image_url: string | null
  buyer_nickname: string
  question_text: string
  answer_text: string | null
  status: string                    // 'unanswered', 'answered', 'skipped', etc.
  ai_suggested_answer: string | null
  answered_by: string | null        // 'ai' | 'human' | null
  answered_at: string | null
  created_at: string
  // Our added columns (AI pipeline)
  product_id: string | null         // FK → products(id)
  seller_id: string | null
  ai_classification: Record<string, unknown> | null
  ai_response_time_ms: number | null
  tokens_used: number | null
  error_message: string | null
  external_created_at: string | null
  updated_at: string | null
}

export interface MarketplaceChat {
  id: string
  platform: string
  // Lovable original columns
  platform_conversation_id: string  // ML pack/resource ID
  buyer_nickname: string
  buyer_avatar_url: string | null
  order_id: string | null           // ML order ID
  product_name: string | null
  status: string                    // 'active', 'resolved', 'escalated'
  last_message_preview: string
  unread_count: number
  created_at: string
  updated_at: string
  // Our added columns (AI pipeline)
  seller_id: string | null
  buyer_id: string | null           // ML buyer user_id
  customer_id: string | null        // FK → customers(id)
  conversation_id: string | null    // FK → conversations(id)
  last_message_at: string | null
  metadata: Record<string, unknown> | null
}

export interface MarketplaceChatMessage {
  id: string
  chat_id: string                   // FK → marketplace_chats(id)
  // Lovable original columns
  role: string                      // 'buyer', 'seller', 'agent'
  content: string
  message_type: string
  ai_suggested: boolean
  created_at: string
  // Our added columns
  external_message_id: string | null
  tokens_used: number | null
}
