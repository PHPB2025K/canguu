

# Sprint 2 — Tipos, Componentes Reutilizaveis e Utilitarios

Criar a camada de tipos TypeScript mapeados ao schema real do Supabase, componentes UI reutilizaveis para estados comuns, e funcoes utilitarias de formatacao.

## 1. Tipos TypeScript

Criar `src/types/database.ts` com interfaces para todas as 9 tabelas. Os nomes dos campos seguem o schema REAL do banco (nao o prompt original):

- `Customer` — campos: `id`, `name`, `phone`, `email`, `source`, `tags`, `notes`, `marketplace_user_id`, `total_conversations`, `first_contact_at`, `last_contact_at`, `created_at`, `updated_at`
- `Conversation` — usa `assigned_to` (nao `managed_by`), `channel`, `subcategory`, `pending_since`, `pending_message_count`, `last_customer_message_at`, `started_at`, `resolved_at`, `resolution_summary`, `satisfaction_score`
- `ConversationWithCustomer` — extends Conversation com `customers: Customer`
- `Message` — usa `sender` (nao `role`), `original_audio_url`; nao tem `cost_usd`
- `Product` — usa `product_line`, `short_description`, `stock_quantity`, `is_active`, `usage_suggestions`, `site_link`, `marketplace_links` (jsonb), `price_marketplace` (jsonb), `images` (jsonb), `stock_status`, `dimensions` (jsonb)
- `Policy` — usa `is_active` (nao `active`)
- `FAQ` — usa `is_active` (nao `active`)
- `Escalation` — usa `notes` (nao `resolution_notes`), `escalated_at`, `resolved_by`
- `EscalationWithDetails` — extends com conversations join
- `AgentConfig` — usa `config_key`/`config_value` (text), `description`
- `AnalyticsDaily` — usa `estimated_cost`, `top_products_asked`, `avg_messages_per_conversation`, `total_tokens_used`

## 2. Funcoes Utilitarias

Criar `src/lib/formatters.ts`:
- `formatCurrency(value)` — "R$ 1.234,56" (locale pt-BR)
- `formatPhone(phone)` — "(11) 99999-9999" a partir de "5511999999999"
- `formatPercent(value)` — "85,3%"
- `truncateText(text, maxLength)` — trunca com "..."
- `getRelativeTime(isoDate)` — "agora", "ha 5 min", "ha 2h", "ontem", "ha 3 dias"

## 3. Componentes Reutilizaveis

Criar na pasta `src/components/common/`:

**Badges (StatusBadge, SentimentBadge, PriorityBadge, UrgencyBadge)**
- Cada um com mapeamento de cores e labels em portugues
- Baseados no componente Badge do shadcn com classes Tailwind customizadas
- UrgencyBadge "critical" e PriorityBadge "urgent" com animacao pulse

**KPICard**
- Props: title, value, icon, trend (opcional), format
- Card bg-card com icone no canto, valor grande, seta de trend colorida

**RelativeTime**
- Usa `getRelativeTime()` do formatters
- Auto-atualiza a cada 60s via setInterval

**LoadingState**
- Props: type ("card" | "table" | "list" | "chat")
- Usa Skeleton do shadcn para cada variante

**ErrorState**
- Card com icone AlertCircle + mensagem + botao "Tentar Novamente"

**EmptyState**
- Icone grande opacity-20 + titulo + descricao + botao de acao opcional

**SearchBar**
- Input com icone Search, debounce 300ms via useEffect/setTimeout

**ConfirmDialog**
- Wrapper do AlertDialog shadcn com props simplificadas

**PageHeader**
- Flex row com titulo/descricao a esquerda e children (acoes) a direita

## Arquivos a Criar

```text
src/types/database.ts          — interfaces para 9 tabelas + joins
src/lib/formatters.ts          — formatCurrency, formatPhone, formatPercent, truncateText, getRelativeTime
src/components/common/StatusBadge.tsx
src/components/common/SentimentBadge.tsx
src/components/common/PriorityBadge.tsx
src/components/common/UrgencyBadge.tsx
src/components/common/KPICard.tsx
src/components/common/RelativeTime.tsx
src/components/common/LoadingState.tsx
src/components/common/ErrorState.tsx
src/components/common/EmptyState.tsx
src/components/common/SearchBar.tsx
src/components/common/ConfirmDialog.tsx
src/components/common/PageHeader.tsx
```

## Arquivos Modificados

Nenhum arquivo existente sera modificado. Todos os arquivos sao novos. Sprint 1 permanece intacto.

## Ordem de Implementacao

1. `src/types/database.ts`
2. `src/lib/formatters.ts`
3. Todos os 10 componentes em `src/components/common/` (podem ser criados em paralelo)

