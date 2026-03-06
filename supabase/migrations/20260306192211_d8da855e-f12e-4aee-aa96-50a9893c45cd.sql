
-- marketplace_questions
CREATE TABLE public.marketplace_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  platform_question_id text NOT NULL,
  platform_item_id text NOT NULL,
  product_name text NOT NULL,
  product_image_url text,
  question_text text NOT NULL,
  answer_text text,
  buyer_nickname text NOT NULL,
  status text NOT NULL DEFAULT 'unanswered',
  ai_suggested_answer text,
  answered_by text,
  answered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- marketplace_chats
CREATE TABLE public.marketplace_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  platform_conversation_id text NOT NULL,
  buyer_nickname text NOT NULL,
  buyer_avatar_url text,
  order_id text,
  product_name text,
  status text NOT NULL DEFAULT 'active',
  last_message_preview text NOT NULL,
  unread_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- marketplace_chat_messages
CREATE TABLE public.marketplace_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.marketplace_chats(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  message_type text DEFAULT 'text',
  ai_suggested boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.marketplace_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_marketplace_questions_all" ON public.marketplace_questions FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_marketplace_chats_all" ON public.marketplace_chats FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_marketplace_chat_messages_all" ON public.marketplace_chat_messages FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
