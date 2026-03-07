

# SPRINT SYNC-4 — Dashboard KPI Marketplace + Polish

## Alterações

### 1. `src/hooks/useDashboardData.ts` — Novo hook `useMLQuestionsToday`

Add query counting `marketplace_questions` WHERE `platform = 'mercado_livre'` AND `created_at >= today 00:00` AND `seller_id IS NOT NULL`. Also count unanswered subset. Returns `{ total, unanswered }`.

### 2. `src/pages/Dashboard.tsx` — Novo KPI card

- Import `Store` from lucide and `useMLQuestionsToday`
- Add "Perguntas ML Hoje" card before "Sentimento Médio" (penultimate position)
- Icon: `Store` with warning color scheme
- Value color: warning if unanswered > 0, success if all answered

### 3. `src/components/marketplaces/ConfigTab.tsx` — Botão "Limpar dados demo"

- Add button at end of AI config card: "Limpar dados de demonstração" (ghost, sm, Trash2 icon)
- ConfirmDialog on click with warning text
- On confirm: 3 sequential deletes (messages → chats → questions WHERE seller_id IS NULL)
- Toast success + invalidate marketplace queries
- Use `useMutation` for the delete operation

### 4. `src/hooks/useMarketplaces.ts` — Ajustar ordenação

Already correct: `unanswered: 1, failed: 0, ai_suggested: 2, skipped: 3, answered: 4`. Per sprint spec, unanswered should be first. Change to: `unanswered: 0, failed: 1, ai_suggested: 2, skipped: 3, answered: 4`.

### 5. `src/pages/Marketplaces.tsx` — Indicadores de conexão no header

- Import `useMarketplaceTokenStatus` from hooks
- Below `<PageHeader>`, add a flex row with connection status indicators
- Read from `marketplace_token_status`: ML shows real status + seller_nickname; Shopee = "Aguardando"; Amazon = "Em breve"
- Styled as 13px muted-foreground text with colored dots, separated by " • "

