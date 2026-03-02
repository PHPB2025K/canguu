
# Sprint 3 — Dashboard com KPIs, Graficos e Conversas Recentes

Implementar a pagina `/dashboard` completa com dados reais do Supabase, usando os componentes reutilizaveis ja criados.

## Observacao Importante sobre Dados

Os dados de `analytics_daily` no banco vao ate 2026-02-27. Como "hoje" pode nao ter dados, o dashboard deve tratar graciosamente valores nulos/vazios (exibir 0 ou "--" quando sem dados). Os valores de sentimento no banco estao em portugues ("positivo", "negativo", "neutro"), nao em ingles.

## Arquivos a Criar

### 1. `src/hooks/useDashboardData.ts`
Hook customizado que encapsula todas as queries do dashboard usando React Query (`@tanstack/react-query`). Queries independentes (falha em uma nao bloqueia as outras):

- **`usePendingEscalations()`** — `escalations` WHERE status = 'pending', retorna count
- **`useConversationsToday()`** — count de `conversations` criadas hoje + ontem para calcular trend
- **`useTodayAnalytics()`** — `analytics_daily` WHERE date = hoje (ou ultimo registro disponivel como fallback)
- **`useConversationsByHour()`** — `conversations` das ultimas 24h, agrupadas por hora no frontend
- **`useRecentConversations()`** — 10 ultimas `conversations` com join `customers`, incluindo subquery para ultima `messages` de cada

### 2. `src/components/dashboard/AlertBanner.tsx`
- Recebe `count` de escalonamentos pendentes
- Se count > 0: card amarelo com icone AlertTriangle, texto "Voce tem {count} escalonamento(s) pendente(s)", link para /escalations
- Se count = 0: retorna null

### 3. `src/components/dashboard/ConversationsChart.tsx`
- Recharts AreaChart com ResponsiveContainer
- Dados: array de {hour: string, count: number} para as ultimas 24h
- Gradiente azul, tooltip customizado, eixos formatados
- Card wrapper com titulo "Conversas por Hora"

### 4. `src/components/dashboard/SentimentChart.tsx`
- Recharts PieChart com ResponsiveContainer
- 3 fatias: Positivo (#22C55E), Negativo (#EF4444), Neutro (#6B7280)
- Legenda em portugues
- Card wrapper com titulo "Sentimento"

### 5. `src/components/dashboard/RecentConversations.tsx`
- Lista de conversas recentes com avatar (iniciais), nome, preview da ultima mensagem (truncado 60 chars), RelativeTime, StatusBadge, SentimentBadge
- Header com "Conversas Recentes" + link "Ver todas" para /conversations
- Click navega para /conversations/:id
- Usa LoadingState type="list" e EmptyState

### 6. `src/pages/Dashboard.tsx` (reescrever)
- Composicao dos componentes acima
- Grid responsivo: KPIs em 3 colunas (md) / 2 (sm) / 1 (mobile)
- Graficos em 2 colunas (lg) / 1 (mobile)
- Conversas recentes full-width abaixo

## Detalhes Tecnicos

**Mapeamento de sentimento:** O banco usa valores em portugues ("positivo", "negativo", "neutro"). Os badges SentimentBadge usam ingles ("positive", "negative", "neutral"). O dashboard precisara mapear os valores ao renderizar, OU adaptar o SentimentBadge para aceitar ambos.

**KPI "Custo Estimado":** O banco nao tem `cost_usd` na tabela `messages`. Usar `estimated_cost` do `analytics_daily` diretamente (ja esta em valor numerico). Converter para BRL com taxa fixa 5.0.

**KPI "Sentimento Medio":** Usar campos `sentiment_positive`, `sentiment_negative`, `sentiment_neutral` do `analytics_daily`. Exibir o dominante com emoji.

**Conversas por hora:** Query todas conversations das ultimas 24h, agrupar por hora no frontend usando `new Date(created_at).getHours()`. Preencher horas sem dados com 0.

**Ultima mensagem:** Para cada conversa recente, fazer uma segunda query buscando a ultima mensagem por conversation_id. Alternativa: buscar todas de uma vez com filtro `conversation_id.in.(ids)` ordenado por created_at desc.

**React Query config:** staleTime de 60s para evitar refetch excessivo. refetchOnWindowFocus habilitado para atualizar ao voltar a aba.

## Ordem de Implementacao

1. Criar `src/hooks/useDashboardData.ts` com todos os hooks
2. Criar `AlertBanner.tsx`
3. Criar `ConversationsChart.tsx`
4. Criar `SentimentChart.tsx`
5. Criar `RecentConversations.tsx`
6. Reescrever `Dashboard.tsx` compondo tudo
