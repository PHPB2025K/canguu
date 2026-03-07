

# SPRINT SYNC-3 — Marketplace com dados reais + Configurações

## Resumo

Filtrar dados mock (seller_id IS NULL) em todas as queries de marketplace_questions, adicionar campos visuais novos no QuestionCard, refatorar ConfigTab para remover inputs mockados e mostrar status real, e adicionar Realtime subscriptions.

## Arquivos alterados

### 1. `src/hooks/useMarketplaces.ts` — Filtrar mock + Realtime

- **Todas as queries** de `marketplace_questions`: adicionar `.not('seller_id', 'is', null)`
  - `useMarketplaceQuestions` (linha 10)
  - `useUnansweredCount` (linha 60)
  - `useMarketplaceQuestionCounts` (linhas 44, 49)
- Adicionar sort priority para `failed: 0.5` e `skipped: 2.5`
- Usar `external_created_at` como fallback no sort (se existir, priorizar sobre `created_at`)
- **Realtime**: Adicionar `useEffect` com `supabase.channel` para `marketplace_questions` e `marketplace_chats`, invalidando queries relevantes on change

### 2. `src/components/marketplaces/QuestionCard.tsx` — Novos campos visuais

- **Tempo de resposta IA**: Badge `⚡ X.Xs` ao lado do timestamp
  - Verde se < 5s, amarelo 5-10s, vermelho > 10s
  - Visível apenas se `ai_response_time_ms` existe
- **Badge "IA" / "Manual"**: Ao lado do status badge
  - `answered_by === 'ai_agent'` → badge com ícone Bot, cor primary
  - `answered_by === 'human'` → badge com ícone User, cor success
- **Status "failed"**: Badge "Erro" destructive + borda left 3px destructive no card + tooltip com `error_message`
- **Status "skipped"**: Badge "Ignorada" muted
- **Timestamp**: Usar `external_created_at ?? created_at` para o relativeTime
- Adicionar `failed` e `skipped` ao `statusConfig`

### 3. `src/components/marketplaces/QuestionsTab.tsx` — Novo filtro de status

- Adicionar opções de status no Select: "Erro" (failed), "Ignoradas" (skipped)

### 4. `src/components/marketplaces/ConfigTab.tsx` — Refatorar cards

**Remover**: `PlatformCardConnected` e `PlatformCardDisconnected` com inputs mockados
**Criar**: Um único `PlatformCard` que renderiza baseado no estado:

- **ML Conectado** (status=active, connection_status=connected):
  - Bolinha verde + "Conectado"
  - seller_nickname em bold, seller_id muted
  - "Token expira em: X" (relativo)
  - Stats reais: perguntas respondidas + tempo médio (já tem hooks)
  - Botões: "Reconectar" (outline, redirect para `ml-oauth?action=authorize`) + "Desconectar" (ghost destructive, toast)

- **ML Expirado/Revogado ou não encontrado**:
  - Bolinha vermelha/cinza + "Desconectado" ou "Não configurado"
  - Botão: "Conectar Mercado Livre" → redirect para `https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/ml-oauth?action=authorize`

- **Shopee** (sem token):
  - Bolinha amarela + "Aguardando aprovação API"
  - Botão desabilitado + tooltip

- **Amazon** (sem token):
  - Bolinha cinza + badge "Em breve"
  - Botão desabilitado + tooltip

**Remover** o array `PLATFORMS` com fields de input e a constante `PlatformConfig`

### 5. `src/hooks/useSidebarCounts.ts` — Filtrar mock

- Adicionar `.not('seller_id', 'is', null)` na query de `marketplace_questions` (linha ~37)
- Adicionar `.not('seller_id', 'is', null)` na query de `marketplace_chats` (linha ~41)

### 6. `src/components/marketplaces/MarketplaceKPICards.tsx` — Sem mudança direta

O KPI "Perguntas Pendentes" usa `useUnansweredCount` que será atualizado no hook (item 1).

### 7. `src/hooks/useMarketplaceTokens.ts` — Adicionar query de avg response time real

Atualizar `usePlatformAvgResponseTime` para usar `ai_response_time_ms` em vez de calcular manualmente:
```sql
SELECT AVG(ai_response_time_ms) FROM marketplace_questions 
WHERE platform = X AND status = 'answered' AND ai_response_time_ms IS NOT NULL
```
E adicionar `.not('seller_id', 'is', null)` + filtro no `usePlatformAnsweredCount`.

## Guardrails respeitados

- Tab Chats inalterada
- Card "Configurações da IA" inalterado
- Tokens nunca expostos
- Landing page inalterada
- Dados mock não deletados, apenas filtrados

