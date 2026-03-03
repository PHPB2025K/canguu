

# Polimento Final — Budamix AI Agent

## Análise do Estado Atual

Boa parte dos requisitos já está implementada:
- **Sidebar badges com realtime**: `useSidebarCounts` + badges no `AppSidebar` já existem e funcionam
- **Título dinâmico**: `AppLayout` já define `document.title` baseado na rota
- **Mobile sidebar**: já fecha ao navegar (useEffect em AppLayout)
- **Dialogs com scroll**: ProductDialog, PolicyDialog, FaqDialog já têm `max-h-[90vh] overflow-y-auto`
- **LoadingState e EmptyState**: todas as páginas já usam
- **PageHeader**: todas as páginas relevantes já usam

## O que falta

### 1. Criar hook `usePageTitle` e usar em cada página
O AppLayout já faz isso globalmente, mas para garantir títulos mais específicos (ex: "Editar Produto" em ProductDetail vs "Produtos" genérico), criar o hook e adicioná-lo em cada página. Isso também cobre ConversationDetail que não tem mapeamento no AppLayout.

**Novo arquivo:** `src/hooks/usePageTitle.ts`

**Páginas a atualizar (adicionar 1 linha em cada):**
- Dashboard, Conversations, ConversationDetail, Products, ProductDetail, Policies, Customers, CustomerDetail, Escalations, Analytics, Settings, Login

### 2. Adicionar `transition-colors` em table rows
- `ProductTable.tsx` — TableRow (line 62)
- `PolicyTable.tsx` — TableRow (line 34)
- `FaqTable.tsx` — TableRow (line 39)
- `CustomerTable.tsx` — já tem `hover:bg-muted/50` mas verificar `transition-colors`

### 3. Adicionar `transition-colors` em cards clicáveis
- `ProductCards.tsx` — div do card (line 35): adicionar `transition-colors hover:shadow-md`
- `EscalationCard.tsx` — Card (line 36): adicionar `transition-colors`

### 4. Adicionar `hover:bg-muted/50` em table rows que não têm
- `ProductTable.tsx` rows
- `PolicyTable.tsx` rows  
- `FaqTable.tsx` rows

### 5. ResolveDialog — adicionar `max-h-[90vh] overflow-y-auto`
- `ResolveDialog.tsx` line 31 — DialogContent falta essas classes

## Arquivos modificados (total: ~15)
1. **Novo:** `src/hooks/usePageTitle.ts`
2. `src/pages/Dashboard.tsx` — +1 linha
3. `src/pages/Conversations.tsx` — +1 linha
4. `src/pages/ConversationDetail.tsx` — +1 linha
5. `src/pages/Products.tsx` — +1 linha
6. `src/pages/ProductDetail.tsx` — +1 linha
7. `src/pages/Policies.tsx` — +1 linha
8. `src/pages/Customers.tsx` — +1 linha
9. `src/pages/CustomerDetail.tsx` — +1 linha
10. `src/pages/Escalations.tsx` — +1 linha
11. `src/pages/Analytics.tsx` — +1 linha
12. `src/pages/Settings.tsx` — +1 linha
13. `src/pages/Login.tsx` — +1 linha
14. `src/components/products/ProductTable.tsx` — hover + transition
15. `src/components/policies/PolicyTable.tsx` — hover + transition
16. `src/components/policies/FaqTable.tsx` — hover + transition
17. `src/components/products/ProductCards.tsx` — transition
18. `src/components/escalations/EscalationCard.tsx` — transition
19. `src/components/escalations/ResolveDialog.tsx` — max-h + overflow

Nenhuma lógica de negócio, query ou mutation será alterada. Apenas adições visuais e o hook de título.

