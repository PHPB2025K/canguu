

# Aplicar Design System Budamix — Mudança Puramente Visual

## Resumo

Migrar de tema azul/default shadcn para paleta orgânica Budamix (areia, teal, terracotta). Sem alterações de lógica, hooks ou queries. Apenas CSS variables, classes de cor, fontes e gráficos.

## Estado Atual

- Nenhuma classe `bg-gray-900/800/950` encontrada — o projeto já usa tokens semânticos (`bg-card`, `bg-background`, etc.)
- Hardcoded restante: `bg-blue-600`, `hover:bg-blue-700`, `text-blue-400`, `#3B82F6`, `hsl(217, 91%, 60%)`
- CSS variables atuais são shadcn default (azul `217 91% 60%`)
- Sidebar usa tokens semânticos mas precisa estilização teal escuro

## Alterações por Arquivo

### 1. `src/index.css` — CSS Variables + Fontes
- Substituir `:root` pela paleta Budamix completa
- Remover bloco `.dark`
- Adicionar `@import` de Google Fonts (DM Sans + Plus Jakarta Sans)
- Adicionar `--success`, `--warning`, `--gold`, `--porcelain`
- Font-family: DM Sans para body, Plus Jakarta Sans para headings

### 2. `tailwind.config.ts` — Cores extras
Adicionar ao `extend.colors`: `success`, `warning`, `gold`, `porcelain`

### 3. `src/components/layout/AppSidebar.tsx` — Sidebar teal
- Logo: `bg-white/15` + ícone `text-white`
- Texto/título: `text-white`
- Nav items inativos: `text-white/70 hover:bg-white/10 hover:text-white`
- Nav items ativos: `bg-white/15 text-white font-medium`
- Badges: manter vermelho para escalonamentos, `bg-white/20 text-white` para conversas
- Separador: `border-white/10`
- Footer: `text-white/50`, sair `text-red-300 hover:text-red-200`
- Borda footer: `border-white/10`

### 4. `src/components/layout/AppLayout.tsx` — Sidebar background
- Aside: `bg-[hsl(var(--sidebar-background))]` (teal) em vez de `bg-card`
- Header: mantém `bg-card/50 backdrop-blur`

### 5. `src/components/conversations/MessageBubble.tsx` — Cores das bolhas
- Customer: `bg-muted border border-border` (areia)
- Agent: `bg-porcelain border border-porcelain` (sage)
- Human: `bg-primary/15 border border-primary/20`
- Label/time classes: usar `text-muted-foreground` e `text-primary`

### 6. `src/components/conversations/ConversationChat.tsx` (line 94)
- `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary/90`

### 7. `src/components/conversations/ChatInput.tsx` (line 69)
- `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary/90`

### 8. `src/components/dashboard/ConversationsChart.tsx` — Cores teal
- `hsl(217, 91%, 60%)` → `hsl(180, 100%, 15%)` (3 ocorrências)

### 9. `src/components/analytics/AnalyticsCharts.tsx` — Cores teal
- `#3B82F6` → `#004D4D` (6 ocorrências)

### 10. `src/components/dashboard/SentimentChart.tsx`
- Cores já OK (`#22C55E`, `#EF4444`, `#6B7280`). Manter.

### 11. `src/components/escalations/EscalationCard.tsx`
- Border colors: `border-l-red-500` → `border-l-destructive`, `border-l-orange-500` → `border-l-accent`, `border-l-blue-500` → `border-l-primary`, `border-l-gray-500` → `border-l-border`
- Botão Assumir: `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary/90`
- `text-blue-400` (atribuído) → `text-primary`
- Adicionar `shadow-sm` ao Card

### 12. `src/components/common/KPICard.tsx`
- Ícone: envolver em círculo `bg-primary/10 rounded-lg p-2`, ícone `text-primary`
- Trend positivo: `text-green-400` → `text-[hsl(var(--success))]`
- Adicionar `shadow-sm` ao Card

### 13. `src/components/common/StatusBadge.tsx`
- `text-yellow-400` → `text-[hsl(var(--warning))]`; `bg-yellow-500/10` → `bg-warning/15`
- `text-blue-400` / `bg-blue-500/10` → `text-primary` / `bg-primary/10`
- `text-green-400` / `bg-green-500/10` → `text-[hsl(var(--success))]` / `bg-success/15`

### 14. `src/components/common/SentimentBadge.tsx`
- `text-green-400` / `bg-green-500/10` → `text-[hsl(var(--success))]` / `bg-success/15`

### 15. `src/components/common/UrgencyBadge.tsx`
- `text-blue-400` / `bg-blue-500/10` → `text-primary` / `bg-primary/10`

### 16. `src/components/common/PriorityBadge.tsx`
- Same as UrgencyBadge: `text-blue-400` / `bg-blue-500/10` → `text-primary` / `bg-primary/10`

### 17. `src/pages/Policies.tsx`
- `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary/90` (2 buttons)

### 18. `src/components/customers/CustomerTable.tsx` + `CustomerInfo.tsx`
- `text-blue-400` / `bg-blue-500/10` → `text-primary` / `bg-primary/10` (source "site")

## Total: ~18 files modified (only CSS class and color changes)

