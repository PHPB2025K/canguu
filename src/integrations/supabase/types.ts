export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_config: {
        Row: {
          config_key: string
          config_value: string
          description: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value: string
          description?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          description?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      analytics_daily: {
        Row: {
          avg_messages_per_conversation: number | null
          avg_response_time_ms: number | null
          created_at: string | null
          date: string
          escalation_rate: number | null
          estimated_cost: number | null
          id: string
          resolution_rate: number | null
          sentiment_negative: number | null
          sentiment_neutral: number | null
          sentiment_positive: number | null
          top_categories: Json | null
          top_products_asked: Json | null
          total_conversations: number | null
          total_messages: number | null
          total_tokens_used: number | null
        }
        Insert: {
          avg_messages_per_conversation?: number | null
          avg_response_time_ms?: number | null
          created_at?: string | null
          date: string
          escalation_rate?: number | null
          estimated_cost?: number | null
          id?: string
          resolution_rate?: number | null
          sentiment_negative?: number | null
          sentiment_neutral?: number | null
          sentiment_positive?: number | null
          top_categories?: Json | null
          top_products_asked?: Json | null
          total_conversations?: number | null
          total_messages?: number | null
          total_tokens_used?: number | null
        }
        Update: {
          avg_messages_per_conversation?: number | null
          avg_response_time_ms?: number | null
          created_at?: string | null
          date?: string
          escalation_rate?: number | null
          estimated_cost?: number | null
          id?: string
          resolution_rate?: number | null
          sentiment_negative?: number | null
          sentiment_neutral?: number | null
          sentiment_positive?: number | null
          top_categories?: Json | null
          top_products_asked?: Json | null
          total_conversations?: number | null
          total_messages?: number | null
          total_tokens_used?: number | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          category: string | null
          channel: string | null
          created_at: string | null
          customer_id: string
          id: string
          last_customer_message_at: string | null
          pending_message_count: number | null
          pending_since: string | null
          priority: string | null
          resolution_summary: string | null
          resolved_at: string | null
          satisfaction_score: number | null
          sentiment: string | null
          started_at: string | null
          status: string | null
          subcategory: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          channel?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          last_customer_message_at?: string | null
          pending_message_count?: number | null
          pending_since?: string | null
          priority?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          satisfaction_score?: number | null
          sentiment?: string | null
          started_at?: string | null
          status?: string | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          channel?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          last_customer_message_at?: string | null
          pending_message_count?: number | null
          pending_since?: string | null
          priority?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          satisfaction_score?: number | null
          sentiment?: string | null
          started_at?: string | null
          status?: string | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          first_contact_at: string | null
          id: string
          last_contact_at: string | null
          marketplace_user_id: string | null
          name: string | null
          notes: string | null
          phone: string
          source: string | null
          tags: string[] | null
          total_conversations: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_contact_at?: string | null
          id?: string
          last_contact_at?: string | null
          marketplace_user_id?: string | null
          name?: string | null
          notes?: string | null
          phone: string
          source?: string | null
          tags?: string[] | null
          total_conversations?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_contact_at?: string | null
          id?: string
          last_contact_at?: string | null
          marketplace_user_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string
          source?: string | null
          tags?: string[] | null
          total_conversations?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      escalations: {
        Row: {
          conversation_id: string
          escalated_at: string | null
          id: string
          notes: string | null
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          urgency: string | null
        }
        Insert: {
          conversation_id: string
          escalated_at?: string | null
          id?: string
          notes?: string | null
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          urgency?: string | null
        }
        Update: {
          conversation_id?: string
          escalated_at?: string | null
          id?: string
          notes?: string | null
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      faq: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          question: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          question: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          question?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      marketplace_chat_messages: {
        Row: {
          ai_suggested: boolean | null
          chat_id: string
          content: string
          created_at: string | null
          external_message_id: string | null
          id: string
          message_type: string | null
          role: string
          tokens_used: number | null
        }
        Insert: {
          ai_suggested?: boolean | null
          chat_id: string
          content: string
          created_at?: string | null
          external_message_id?: string | null
          id?: string
          message_type?: string | null
          role: string
          tokens_used?: number | null
        }
        Update: {
          ai_suggested?: boolean | null
          chat_id?: string
          content?: string
          created_at?: string | null
          external_message_id?: string | null
          id?: string
          message_type?: string | null
          role?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "marketplace_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_chats: {
        Row: {
          buyer_avatar_url: string | null
          buyer_id: string | null
          buyer_nickname: string
          conversation_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string
          metadata: Json | null
          order_id: string | null
          platform: string
          platform_conversation_id: string
          product_name: string | null
          seller_id: string | null
          status: string
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          buyer_avatar_url?: string | null
          buyer_id?: string | null
          buyer_nickname: string
          conversation_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview: string
          metadata?: Json | null
          order_id?: string | null
          platform: string
          platform_conversation_id: string
          product_name?: string | null
          seller_id?: string | null
          status?: string
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          buyer_avatar_url?: string | null
          buyer_id?: string | null
          buyer_nickname?: string
          conversation_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string
          metadata?: Json | null
          order_id?: string | null
          platform?: string
          platform_conversation_id?: string
          product_name?: string | null
          seller_id?: string | null
          status?: string
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_chats_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_chats_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_product_mapping: {
        Row: {
          created_at: string | null
          external_item_id: string
          external_price: number | null
          external_title: string | null
          external_url: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          platform: string
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          external_item_id: string
          external_price?: number | null
          external_title?: string | null
          external_url?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          platform: string
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          external_item_id?: string
          external_price?: number | null
          external_title?: string | null
          external_url?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          platform?: string
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_product_mapping_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_questions: {
        Row: {
          ai_classification: Json | null
          ai_response_time_ms: number | null
          ai_suggested_answer: string | null
          answer_text: string | null
          answered_at: string | null
          answered_by: string | null
          buyer_nickname: string
          created_at: string | null
          error_message: string | null
          external_created_at: string | null
          id: string
          platform: string
          platform_item_id: string
          platform_question_id: string
          product_id: string | null
          product_image_url: string | null
          product_name: string
          question_text: string
          seller_id: string | null
          status: string
          tokens_used: number | null
          updated_at: string | null
        }
        Insert: {
          ai_classification?: Json | null
          ai_response_time_ms?: number | null
          ai_suggested_answer?: string | null
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          buyer_nickname: string
          created_at?: string | null
          error_message?: string | null
          external_created_at?: string | null
          id?: string
          platform: string
          platform_item_id: string
          platform_question_id: string
          product_id?: string | null
          product_image_url?: string | null
          product_name: string
          question_text: string
          seller_id?: string | null
          status?: string
          tokens_used?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_classification?: Json | null
          ai_response_time_ms?: number | null
          ai_suggested_answer?: string | null
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          buyer_nickname?: string
          created_at?: string | null
          error_message?: string | null
          external_created_at?: string | null
          id?: string
          platform?: string
          platform_item_id?: string
          platform_question_id?: string
          product_id?: string | null
          product_image_url?: string | null
          product_name?: string
          question_text?: string
          seller_id?: string | null
          status?: string
          tokens_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_questions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_tokens: {
        Row: {
          access_token: string | null
          app_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          platform: string
          refresh_token: string | null
          seller_id: string | null
          seller_nickname: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          platform: string
          refresh_token?: string | null
          seller_id?: string | null
          seller_nickname?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          platform?: string
          refresh_token?: string | null
          seller_id?: string | null
          seller_nickname?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          original_audio_url: string | null
          response_time_ms: number | null
          sender: string
          tokens_used: number | null
          whatsapp_message_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          original_audio_url?: string | null
          response_time_ms?: number | null
          sender: string
          tokens_used?: number | null
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          original_audio_url?: string | null
          response_time_ms?: number | null
          sender?: string
          tokens_used?: number | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          marketplace: string | null
          priority: number | null
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          marketplace?: string | null
          priority?: number | null
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          marketplace?: string | null
          priority?: number | null
          summary?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string | null
          differentials: string | null
          dimensions: Json | null
          embedding: string | null
          full_description: string | null
          id: string
          images: Json | null
          is_active: boolean | null
          marketplace_links: Json | null
          material: string | null
          name: string
          price_marketplace: Json | null
          price_site: number | null
          product_line: string | null
          search_text: string | null
          short_description: string | null
          site_link: string | null
          sku: string
          stock_quantity: number | null
          stock_status: string | null
          updated_at: string | null
          usage_suggestions: string | null
          variations: Json | null
        }
        Insert: {
          created_at?: string | null
          differentials?: string | null
          dimensions?: Json | null
          embedding?: string | null
          full_description?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          marketplace_links?: Json | null
          material?: string | null
          name: string
          price_marketplace?: Json | null
          price_site?: number | null
          product_line?: string | null
          search_text?: string | null
          short_description?: string | null
          site_link?: string | null
          sku: string
          stock_quantity?: number | null
          stock_status?: string | null
          updated_at?: string | null
          usage_suggestions?: string | null
          variations?: Json | null
        }
        Update: {
          created_at?: string | null
          differentials?: string | null
          dimensions?: Json | null
          embedding?: string | null
          full_description?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          marketplace_links?: Json | null
          material?: string | null
          name?: string
          price_marketplace?: Json | null
          price_site?: number | null
          product_line?: string | null
          search_text?: string | null
          short_description?: string | null
          site_link?: string | null
          sku?: string
          stock_quantity?: number | null
          stock_status?: string | null
          updated_at?: string | null
          usage_suggestions?: string | null
          variations?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      marketplace_token_status: {
        Row: {
          app_id: string | null
          connection_status: string | null
          created_at: string | null
          id: string | null
          platform: string | null
          seller_id: string | null
          seller_nickname: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          app_id?: string | null
          connection_status?: never
          created_at?: string | null
          id?: string | null
          platform?: string | null
          seller_id?: string | null
          seller_nickname?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          app_id?: string | null
          connection_status?: never
          created_at?: string | null
          id?: string | null
          platform?: string | null
          seller_id?: string | null
          seller_nickname?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      match_products: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          differentials: string
          dimensions: Json
          full_description: string
          id: string
          is_active: boolean
          marketplace_links: Json
          material: string
          name: string
          price_marketplace: Json
          price_site: number
          product_line: string
          short_description: string
          similarity: number
          site_link: string
          sku: string
          stock_quantity: number
          stock_status: string
          usage_suggestions: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
