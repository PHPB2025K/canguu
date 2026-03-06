

# Sprint 9B — Tab Chats de Marketplace (Split-View)

## Visão Geral

Substituir o placeholder "Em construção" da Tab Chats por um layout split-view completo: lista de conversas à esquerda + chat à direita, seguindo o padrão da página de Conversas WhatsApp existente.

---

## 1. Hooks — Adicionar ao `src/hooks/useMarketplaces.ts`

Novas funções:
- `useMarketplaceChats(platform?, status?)` — lista chats com filtros, ordenados por unread primeiro + `updated_at` DESC
- `useMarketplaceChatMessages(chatId)` — mensagens de um chat ordenadas por `created_at` ASC
- `useSendChatMessage()` — mutation: insere mensagem com `role: "seller"`, atualiza `last_message_preview` e `updated_at` no chat
- `useResolveChatMutation()` — mutation: atualiza `status` para `"resolved"`
- `useApproveSuggestion()` — mutation: atualiza `ai_suggested` para `false` na mensagem
- `useDiscardSuggestion()` — mutation: deleta a mensagem sugerida

Todas invalidam as queries relevantes (`marketplace-chats`, `marketplace-chat-messages`, `marketplace-total-unread`, `sidebar-marketplace-count`).

---

## 2. Componentes Novos

### `src/components/marketplaces/MarketplaceChatList.tsx`
- Painel esquerdo (w-96, border-right)
- Filtros no topo: toggle plataforma (Todas/Shopee/Amazon/ML) + select status (Todos/Ativos/Resolvidos/Aguardando)
- ScrollArea com lista de conversas, cada item mostra: PlatformBadge + buyer_nickname + timestamp relativo, preview truncado, product_name/order_id com ícone, unread badge (bolinha accent)
- Item selecionado: `bg-primary/10 border-l-2 border-primary`
- Loading skeleton, empty state

### `src/components/marketplaces/MarketplaceChatView.tsx`
- Painel direito (flex-1)
- Empty state quando nenhum chat selecionado
- Header: PlatformBadge + buyer_nickname + product_name/order_id + StatusBadge + botão "Resolver"
- Área de mensagens com bolhas por role:
  - **buyer**: esquerda, bg muted, ícone User
  - **seller**: direita, bg primary/12%, ícone UserCheck
  - **ai_agent + ai_suggested=true**: direita, bg porcelain, borda tracejada primary, header "Sugestão da Giovana" + 3 botões (Enviar/Editar/Descartar)
  - **ai_agent + ai_suggested=false**: direita, bg porcelain, label "Giovana (IA)"
- Auto-scroll via useRef + useEffect
- ChatInput reutilizando o componente existente `src/components/conversations/ChatInput.tsx`

### `src/components/marketplaces/MarketplaceChatBubble.tsx`
- Componente de bolha específico para marketplace chats
- Renderiza buyer/seller/ai_agent com estilos distintos
- Botões de ação inline para sugestões IA

---

## 3. Atualizar `src/components/marketplaces/ChatsTab.tsx`

Substituir placeholder por split-view:
- Desktop (≥1024px): lista + chat lado a lado
- Mobile/Tablet (<1024px): lista ou chat com botão voltar, controlado por estado local

---

## Arquivos

**Criados:**
- `src/components/marketplaces/MarketplaceChatList.tsx`
- `src/components/marketplaces/MarketplaceChatView.tsx`
- `src/components/marketplaces/MarketplaceChatBubble.tsx`

**Modificados:**
- `src/components/marketplaces/ChatsTab.tsx` — substituir placeholder pelo split-view
- `src/hooks/useMarketplaces.ts` — adicionar hooks de chats/mensagens/mutations

**Não modificados:** Nenhuma outra página, sidebar, CSS ou tabela Supabase.

