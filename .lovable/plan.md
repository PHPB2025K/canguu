

# Budamix AI Agent Dashboard — Plano de Implementacao

Dashboard completo de gestao para agente de IA de atendimento ao cliente via WhatsApp, com interface em portugues brasileiro, tema escuro, e 9 paginas + login.

## Nota sobre Stack

O projeto usa React 18 e Tailwind v3 (restricao da plataforma Lovable). Zustand sera instalado para state management. Todas as demais dependencias (shadcn/ui, Recharts, Lucide, React Router, Supabase) ja estao disponiveis.

## Mapeamento do Schema Existente

O banco Supabase ja existe com pequenas diferencas de nomenclatura em relacao ao prompt. Nenhuma migracao de schema necessaria — o codigo se adapta aos nomes existentes:

| Prompt pede | Coluna real no banco |
|---|---|
| `agent_config.key` / `value` | `config_key` / `config_value` (text, nao jsonb) |
| `conversations.managed_by` | `assigned_to` ("agent" / "human") |
| `messages.role` | `sender` |
| `products.stock` | `stock_quantity` |
| `products.line` | `product_line` |
| `products.description` | `short_description` |
| `products.active` | `is_active` |
| `products.images` | `images` (jsonb, nao text[]) |
| `analytics_daily.total_cost_usd` | `estimated_cost` |
| `analytics_daily.top_products` | `top_products_asked` |

## Fase 1 — Fundacao (Tema, Auth, Layout, Sidebar)

- Atualizar `index.css` com tema escuro como padrao, cor primaria azul #3B82F6, accents verde/vermelho/amarelo
- Instalar `zustand` como dependencia
- Criar store Zustand para auth state (`useAuthStore`)
- Criar pagina `/login` com Supabase Auth (email + senha), card centralizado com titulo "Budamix AI Agent", loading state, toast de erro
- Criar `AuthProvider` com `onAuthStateChange` + `getSession`
- Criar componente `ProtectedRoute` que redireciona para `/login`
- Criar `AppSidebar` escura (w-64) com 8 itens de navegacao usando icones Lucide, badge de escalonamentos pendentes, email do usuario + botao Sair
- Criar `AppLayout` com SidebarProvider + main content area
- Configurar todas as rotas no `App.tsx`

## Fase 2 — Dashboard (/dashboard)

- Banner de alertas de escalonamentos pendentes (query `escalations` where status=pending)
- 6 KPI Cards em grid 3x2 com dados de `analytics_daily` (data de hoje vs ontem para trends)
- Grafico AreaChart de conversas por hora (ultimas 24h, query `conversations` agrupadas por hora)
- Grafico PieChart de sentimento (positivo/negativo/neutro do dia)
- Lista de 10 conversas recentes com join em `customers` e ultima `message`, timestamp relativo, badges, click navega para conversa

## Fase 3 — Conversas (/conversations)

- Layout split-view: painel esquerdo (w-96) + painel direito (flex-1)
- Painel esquerdo: SearchBar, filtros (Status, Categoria, Sentimento), lista de conversas com ScrollArea
- Painel direito: header com info do cliente, area de chat com bolhas coloridas por sender (customer=cinza, agent=azul, human=verde), auto-scroll, input de mensagem
- Botao Assumir/Devolver com AlertDialog de confirmacao, atualiza `assigned_to`
- Input desabilitado quando `assigned_to = 'agent'`
- Rota `/conversations/:id` com view full-width
- Supabase Realtime subscription para `messages` e `conversations`

## Fase 4 — Produtos (/products)

- Toolbar com busca, filtros (Linha, Ativo), toggle tabela/cards, botao adicionar
- Tabela com SKU, Nome, Linha, Material, Preco, Estoque (badge colorido), Ativo (switch), Acoes
- View cards alternativa
- Dialog de criacao/edicao com formulario completo em grid 2 colunas
- AlertDialog para confirmacao de exclusao

## Fase 5 — Politicas e FAQ (/policies)

- Tabs: "Politicas" | "FAQ"
- Tab Politicas: filtro por categoria, tabela, dialog criar/editar
- Tab FAQ: filtro por categoria, tabela com keywords e usage_count, dialog com chip input para keywords

## Fase 6 — Clientes (/customers)

- Tabela com busca, nome, telefone, origem (badge), total conversas, ultimo contato, tags
- Pagina detalhe `/customers/:id`: card info, tags editaveis, notas, stats, timeline de conversas

## Fase 7 — Escalonamentos (/escalations)

- Tabs: Pendentes | Em Andamento | Resolvidos | Todos (com badges de contagem)
- Cards com borda colorida por urgencia, info do cliente (join conversations -> customers), motivo, preview
- Acoes: Ver Conversa, Assumir, Resolver (dialog com textarea)

## Fase 8 — Analytics (/analytics)

- DateRangePicker com presets 7d/30d/90d
- 4 summary cards
- 8 graficos Recharts em grid responsivo (dados de `analytics_daily`)
- Botao exportar CSV

## Fase 9 — Configuracoes (/settings)

- Cards separados: Agente, Modelo IA, System Prompt, Escalonamento, Status Integracoes
- Leitura/escrita na tabela `agent_config` (config_key/config_value)
- Botao salvar fixo com toast

## Fase 10 — Dados de Demonstracao

Inserir via SQL (insert tool) dados ficticios realistas em portugues:
- 10 produtos Budamix
- 8 politicas
- 15 FAQs
- 5 clientes brasileiros
- 10 conversas com status variados
- 40 mensagens
- 3 escalonamentos
- 30 dias de analytics_daily
- 10 keys de agent_config

## Fase 11 — Polimento

- Loading states com Skeleton em todas as paginas
- Error states com botao "Tentar novamente"
- Empty states com icone + texto
- Responsividade: sidebar colapsa em mobile
- Toasts para todas operacoes CRUD

---

### Detalhes Tecnicos

**Estrutura de arquivos principal:**

```text
src/
  stores/
    useAuthStore.ts
  hooks/
    useConversations.ts, useProducts.ts, useCustomers.ts, etc.
  components/
    layout/
      AppSidebar.tsx, AppLayout.tsx, ProtectedRoute.tsx
    dashboard/
      KPICard.tsx, AlertBanner.tsx, ConversationsChart.tsx, SentimentChart.tsx, RecentConversations.tsx
    conversations/
      ConversationList.tsx, ChatView.tsx, MessageBubble.tsx, ConversationFilters.tsx
    products/
      ProductTable.tsx, ProductCards.tsx, ProductDialog.tsx
    policies/
      PoliciesTab.tsx, FAQTab.tsx, PolicyDialog.tsx, FAQDialog.tsx
    customers/
      CustomerTable.tsx, CustomerDetail.tsx
    escalations/
      EscalationCard.tsx, ResolveDialog.tsx
    analytics/
      DateRangePicker.tsx, AnalyticsChart.tsx
    settings/
      AgentCard.tsx, ModelCard.tsx, PromptCard.tsx, EscalationCard.tsx, IntegrationsCard.tsx
  pages/
    Login.tsx, Dashboard.tsx, Conversations.tsx, ConversationDetail.tsx
    Products.tsx, ProductDetail.tsx, Policies.tsx
    Customers.tsx, CustomerDetail.tsx
    Escalations.tsx, Analytics.tsx, Settings.tsx
  lib/
    utils.ts, formatters.ts (timestamps relativos, moeda BR)
```

**Queries Supabase chave:**
- Dashboard KPIs: `analytics_daily` filtrado por data de hoje + ontem
- Conversas recentes: `conversations` com join `customers` + subquery ultima `messages`
- Chat: `messages` filtrado por `conversation_id`, ordenado por `created_at`
- Realtime: `supabase.channel('messages').on('postgres_changes', ...)` para mensagens e conversas

