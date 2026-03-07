import type { Json } from "@/integrations/supabase/types";

export interface Customer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  source: string | null;
  tags: string[] | null;
  notes: string | null;
  marketplace_user_id: string | null;
  total_conversations: number | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Conversation {
  id: string;
  customer_id: string;
  status: string | null;
  channel: string | null;
  category: string | null;
  subcategory: string | null;
  sentiment: string | null;
  priority: string | null;
  assigned_to: string | null;
  pending_since: string | null;
  pending_message_count: number | null;
  last_customer_message_at: string | null;
  started_at: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  satisfaction_score: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ConversationWithCustomer extends Conversation {
  customers: Customer;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: string;
  content: string;
  message_type: string | null;
  original_audio_url: string | null;
  whatsapp_message_id: string | null;
  response_time_ms: number | null;
  tokens_used: number | null;
  metadata: Json | null;
  created_at: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  product_line: string | null;
  material: string | null;
  short_description: string | null;
  full_description: string | null;
  dimensions: Json | null;
  price_site: number | null;
  price_marketplace: Json | null;
  stock_quantity: number | null;
  stock_status: string | null;
  images: Json | null;
  usage_suggestions: string | null;
  differentials: string | null;
  site_link: string | null;
  marketplace_links: Json | null;
  variations: Json | null;
  is_active: boolean | null;
  search_text: string | null;
  embedding: string | null;
  created_at: string | null;
  updated_at: string | null;
  listings?: ProductListing[];
}

export interface ProductListing {
  id: string;
  product_id: string;
  platform: string;
  platform_item_id: string | null;
  listing_title: string;
  listing_url: string | null;
  listing_type: string | null;
  kit_quantity: number | null;
  listing_price: number | null;
  is_active: boolean | null;
  metadata: Json | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Policy {
  id: string;
  title: string;
  category: string;
  marketplace: string | null;
  content: string;
  summary: string | null;
  priority: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  keywords: string[] | null;
  usage_count: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Escalation {
  id: string;
  conversation_id: string;
  reason: string;
  urgency: string | null;
  status: string | null;
  notes: string | null;
  resolved_by: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
}

export interface EscalationWithDetails extends Escalation {
  conversations: ConversationWithCustomer;
}

export interface AgentConfig {
  id: string;
  config_key: string;
  config_value: string;
  description: string | null;
  updated_at: string | null;
}

export interface AnalyticsDaily {
  id: string;
  date: string;
  total_conversations: number | null;
  total_messages: number | null;
  avg_response_time_ms: number | null;
  resolution_rate: number | null;
  escalation_rate: number | null;
  sentiment_positive: number | null;
  sentiment_negative: number | null;
  sentiment_neutral: number | null;
  top_categories: Json | null;
  top_products_asked: Json | null;
  estimated_cost: number | null;
  avg_messages_per_conversation: number | null;
  total_tokens_used: number | null;
  created_at: string | null;
}

export interface MarketplaceQuestion {
  id: string;
  platform: string;
  platform_question_id: string;
  platform_item_id: string;
  product_name: string;
  product_image_url: string | null;
  question_text: string;
  answer_text: string | null;
  buyer_nickname: string;
  status: string;
  ai_suggested_answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string | null;
  product_id: string | null;
  seller_id: string | null;
  ai_classification: Json | null;
  ai_response_time_ms: number | null;
  tokens_used: number | null;
  error_message: string | null;
  external_created_at: string | null;
  updated_at: string | null;
}

export interface MarketplaceChat {
  id: string;
  platform: string;
  platform_conversation_id: string;
  buyer_nickname: string;
  buyer_avatar_url: string | null;
  order_id: string | null;
  product_name: string | null;
  status: string;
  last_message_preview: string;
  unread_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  seller_id: string | null;
  buyer_id: string | null;
  customer_id: string | null;
  conversation_id: string | null;
  last_message_at: string | null;
  metadata: Json | null;
}

export interface MarketplaceChatMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  message_type: string | null;
  ai_suggested: boolean | null;
  created_at: string | null;
  external_message_id: string | null;
  tokens_used: number | null;
}

export interface MarketplaceTokenStatus {
  id: string;
  platform: string;
  seller_id: string | null;
  seller_nickname: string | null;
  app_id: string | null;
  status: string | null;
  token_expires_at: string | null;
  connection_status: 'connected' | 'expired' | 'disconnected';
  created_at: string | null;
  updated_at: string | null;
}
