

# Remover "Site Próprio" e renomear seção de links

## Alterações

### 1. `src/hooks/useProducts.ts`
- Remover `"site"` de `MARKETPLACE_PLATFORMS`
- Remover entrada `site` de `MARKETPLACE_LABELS` e `MARKETPLACE_LINK_PLACEHOLDERS`

### 2. `src/components/products/ProductDialog.tsx`
- Alterar título "Links dos Anúncios" para "Links do Anúncio nos Marketplaces"

### 3. `src/pages/ProductDetail.tsx`
- Alterar título "Links dos Anúncios" para "Links do Anúncio nos Marketplaces"

O campo "Link Site" já existe em ambos os formulários e continuará funcionando normalmente para o link do site próprio.

