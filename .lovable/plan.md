

# Ajustar seção "Conectado onde seus clientes estão"

## Alterações em `src/components/landing/IntegrationsSection.tsx`

1. **Remover Supabase** da lista `integrations` (linha 8)
2. **Alterar Shopee** (linha 6): badge de `"Ativo ✓"` para `"Em breve"` e badgeClass de `bg-success/10 text-success` para `bg-muted text-muted-foreground`
3. **Ajustar grid**: com 4 itens, mudar `grid-cols-5` para `grid-cols-4` (linha 21) para melhor distribuição no desktop

