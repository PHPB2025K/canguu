

# Sprint 9A — Módulo Marketplaces

## Visão Geral

Criar o módulo de Integrações com Marketplaces: 3 tabelas no Supabase com seed data, novo item na sidebar, página `/marketplaces` com 3 tabs (Perguntas, Chats placeholder, Configurações).

---

## 1. Banco de Dados — 3 tabelas + RLS + seed data

### Migration 1: Criar tabelas

```sql
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
```

### Insert: Seed data (20 perguntas + 10 chats + ~40 mensagens)

All 20 questions and 10 chats with their messages exactly as specified, using realistic platform IDs and distributed `created_at` values.

---

## 2. TypeScript Types

Add to `src/types/database.ts`:
- `MarketplaceQuestion` interface
- `MarketplaceChat` interface  
- `MarketplaceChatMessage` interface

---

## 3. Sidebar — Adicionar "Marketplaces"

### `src/components/layout/AppSidebar.tsx`
- Add `Store` icon import from lucide-react
- Insert new nav item at index 2 (between Conversas and Produtos): `{ icon: Store, label: 'Marketplaces', path: '/marketplaces', badgeKey: 'marketplacePending' }`

### `src/hooks/useSidebarCounts.ts`
- Add query for marketplace pending count: `unanswered` questions count + sum of `unread_count` from chats
- Add realtime subscription for `marketplace_questions` and `marketplace_chats` tables
- Return `marketplacePending` in the counts object

### `src/components/layout/AppLayout.tsx`
- Add `'/marketplaces': 'Marketplaces'` to `pageTitles`

### `src/App.tsx`
- Import `Marketplaces` page, add `<Route path="/marketplaces" element={<Marketplaces />} />`

---

## 4. Hook — `src/hooks/useMarketplaces.ts`

- `useMarketplaceQuestions(platform?, status?, search?)` — fetches questions with filters, ordered by status priority (unanswered first) then `created_at` DESC
- `useMarketplaceQuestionCounts()` — counts by status
- `useAnswerQuestion()` — mutation to update answer_text, status, answered_by, answered_at
- `useRejectSuggestion()` — mutation to clear ai_suggested_answer, set status to unanswered
- `useMarketplaceChatCounts()` — total unread count for KPI
- `useMarketplaceActiveChatCount()` — count of active chats for KPI

---

## 5. Página — `src/pages/Marketplaces.tsx`

Main page with:
- `PageHeader` with title "Integrações Marketplaces" and description
- 3 KPI cards (Perguntas Pendentes, Chats Ativos, Tempo Médio Resposta)
- `Tabs` component with 3 tabs, each rendering its respective component

---

## 6. Componentes

### `src/components/marketplaces/MarketplaceKPICards.tsx`
- 3 cards using existing `KPICard` pattern (HelpCircle, MessageCircle, Clock icons)
- Data from hooks; "12min" static for average response time

### `src/components/marketplaces/QuestionsTab.tsx`
- Filter bar: platform toggle buttons (with colored badges ML/Shopee/Amazon), status select, search bar
- Question cards list in `ScrollArea`
- Loading skeleton (5 cards), empty state, error state

### `src/components/marketplaces/QuestionCard.tsx`
- Collapsible card with platform badge, timestamp, status badge, product name, question text, buyer nickname
- Expanded state shows:
  - AI suggestion box (if `ai_suggested`) with Approve/Edit/Reject buttons
  - Manual response textarea + send button
  - Answered display (if already answered)

### `src/components/marketplaces/ChatsTab.tsx`
- Placeholder empty state with MessageCircle + Wrench icons

### `src/components/marketplaces/ConfigTab.tsx`
- 3 platform cards (ML connected, Shopee waiting, Amazon coming soon) with disabled inputs
- AI config card with toggles, select, inputs, textarea, save button (local state only)

### `src/components/marketplaces/PlatformBadge.tsx`
- Reusable badge with platform-specific colors (ML yellow, Shopee orange, Amazon orange-dark)

---

## Arquivos Criados/Modificados

**Modificados (mínimo):**
- `src/App.tsx` — add route
- `src/components/layout/AppSidebar.tsx` — add nav item
- `src/components/layout/AppLayout.tsx` — add page title
- `src/hooks/useSidebarCounts.ts` — add marketplace counts
- `src/types/database.ts` — add interfaces

**Criados:**
- `src/pages/Marketplaces.tsx`
- `src/hooks/useMarketplaces.ts`
- `src/components/marketplaces/MarketplaceKPICards.tsx`
- `src/components/marketplaces/QuestionsTab.tsx`
- `src/components/marketplaces/QuestionCard.tsx`
- `src/components/marketplaces/ChatsTab.tsx`
- `src/components/marketplaces/ConfigTab.tsx`
- `src/components/marketplaces/PlatformBadge.tsx`

**Supabase:**
- 1 migration (create 3 tables + RLS)
- 1 insert operation (seed data)

**Guardrails respeitados:** Nenhuma página existente modificada. Nenhuma tabela existente alterada. Nenhuma variável CSS alterada. Tudo em português brasileiro.

