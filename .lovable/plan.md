
# Sprint 7 — Escalonamentos + Analytics

Implementar `/escalations` com cards por status e acoes de assumir/resolver, e `/analytics` com graficos Recharts, summary cards e exportacao CSV.

## Schema Real Confirmado

**escalations**: id, conversation_id, reason, urgency, status, notes, resolved_by, escalated_at, resolved_at

**analytics_daily**: id, date, total_conversations, total_messages, avg_response_time_ms, resolution_rate, escalation_rate, sentiment_positive, sentiment_negative, sentiment_neutral, top_categories (jsonb), top_products_asked (jsonb), estimated_cost (numeric), avg_messages_per_conversation, total_tokens_used

Tipos TypeScript ja existem em `src/types/database.ts` (Escalation, EscalationWithDetails, AnalyticsDaily).

## Arquivos a Criar

### 1. `src/hooks/useEscalations.ts`
- **`useEscalationList(statusFilter?)`** — query escalations JOIN conversations(*, customers(*)), filtro por status, ORDER BY escalated_at DESC. Tambem busca 2 ultimas mensagens de cada conversation_id para preview.
- **`useEscalationCounts()`** — 3 queries count (pending, in_progress, resolved) para badges das tabs.
- **`useAssignEscalation()`** — mutation UPDATE status='in_progress', resolved_by=email do user.
- **`useResolveEscalation()`** — mutation UPDATE status='resolved', notes=texto, resolved_at=now().
- Realtime subscription na tabela escalations para invalidar queries.

### 2. `src/hooks/useAnalytics.ts`
- **`useAnalyticsSummary(startDate, endDate)`** — query analytics_daily no periodo, calcula SUM/AVG dos campos para os 4 KPI cards.
- **`useAnalyticsDaily(startDate, endDate)`** — query analytics_daily no periodo, retorna array ordenado por date ASC para graficos.

### 3. `src/components/escalations/EscalationCard.tsx`
Card individual de escalonamento:
- Borda lateral esquerda por urgencia (critical=red, high=orange, medium=blue, low=gray)
- Header: UrgencyBadge + "#XXXX" + RelativeTime
- Body: nome/telefone cliente, razao, preview 2 ultimas mensagens com icones por sender
- Se resolved_by preenchido: "Atribuido a: {email}"
- Se resolved_at: data formatada + notas
- Footer: botoes "Ver Conversa", "Assumir" (se nao resolved), "Resolver" (se nao resolved)

### 4. `src/components/escalations/ResolveDialog.tsx`
Dialog para resolver escalonamento:
- Textarea "Notas de resolucao" (4 rows, obrigatorio)
- Botoes Cancelar + Resolver (bg-green-600)

### 5. `src/components/analytics/DateRangePicker.tsx`
Controle de periodo:
- ToggleGroup: "7d" | "30d" | "90d" (default "30d")
- 2 date inputs (De / Ate) usando shadcn Popover + Calendar
- Ao mudar: callback com startDate e endDate

### 6. `src/components/analytics/AnalyticsCharts.tsx`
Componente com os 8 graficos Recharts em grid 2 colunas:
1. Conversas por Dia (BarChart)
2. Tempo Medio de Resposta (LineChart, ms->s)
3. Resolucao vs Escalonamento (AreaChart stacked)
4. Distribuicao de Sentimento (PieChart)
5. Top Categorias (BarChart horizontal, agregar jsonb)
6. Top Produtos Consultados (BarChart horizontal, agregar jsonb top_products_asked)
7. Mensagens por Dia (AreaChart)
8. Custo Acumulado (AreaChart, running sum de estimated_cost * 5.0)

Cada grafico em card bg-gray-900 com titulo e ResponsiveContainer height=280.

### 7. Paginas

**`src/pages/Escalations.tsx`** (reescrever):
- PageHeader "Escalonamentos"
- Tabs: Pendentes(N) | Em Andamento(N) | Resolvidos(N) | Todos
- Badge pendentes em vermelho se > 0
- Grid de EscalationCards filtrados pela tab
- Empty states customizados por tab
- Estado para ResolveDialog (escalation selecionado)

**`src/pages/Analytics.tsx`** (reescrever):
- PageHeader "Analytics" com botao "Exportar CSV"
- DateRangePicker
- 4 KPICards (Total Conversas, Total Mensagens, Taxa Resolucao, Custo Total em BRL)
- AnalyticsCharts

## Detalhes Tecnicos

**Preview de mensagens no card de escalonamento:** Para cada escalation, buscar as 2 ultimas mensagens via `messages WHERE conversation_id ORDER BY created_at DESC LIMIT 2`. Feito em batch na query principal (coletar todos conversation_ids, buscar mensagens, agrupar por conversation_id).

**Agregacao de top_categories e top_products_asked (jsonb):** Iterar sobre todos os registros do periodo, parsear cada jsonb como Record<string, number>, somar valores por key, ordenar e pegar top 8.

**Custo acumulado:** Iterar array ordenado por date, acumular soma de estimated_cost * 5.0 (conversao USD->BRL), gerar array com running total.

**Exportar CSV:** Montar string CSV com headers em portugues, iterar dados do periodo, formatar cada linha, criar Blob text/csv, forcar download via URL.createObjectURL + click em link temporario.

**Realtime (escalations):** Canal postgres_changes na tabela escalations, evento *, invalidar queries ["escalations"] e ["escalation-counts"].

**User email para atribuicao:** Obter de `useAuthStore` via `state.user?.email`.

## Componentes Reutilizados
PageHeader, KPICard, UrgencyBadge, RelativeTime, LoadingState, EmptyState, StatusBadge, SentimentBadge, formatCurrency, formatPercent, truncateText, useAuthStore

## Ordem de Implementacao

1. `src/hooks/useEscalations.ts`
2. `src/components/escalations/ResolveDialog.tsx`
3. `src/components/escalations/EscalationCard.tsx`
4. `src/pages/Escalations.tsx`
5. `src/hooks/useAnalytics.ts`
6. `src/components/analytics/DateRangePicker.tsx`
7. `src/components/analytics/AnalyticsCharts.tsx`
8. `src/pages/Analytics.tsx`
