

# SPRINT SYNC-2 — Seção "Anúncios" no formulário de produto

## Resumo

Remover campos legados (Link Site, Links Marketplace) dos formulários de produto e adicionar uma seção "Anúncios deste Produto" que lê/escreve na tabela `product_listings`. Criar um dialog para adicionar/editar anúncios e um dialog de confirmação para deletar.

## Arquivos alterados

### 1. `src/hooks/useProductListings.ts` (NOVO)

Hook com React Query para CRUD de `product_listings`:
- `useProductListings(productId)` — query `SELECT * FROM product_listings WHERE product_id = X ORDER BY platform`
- `useCreateListing()` — insert mutation, invalida `["product-listings", productId]`
- `useUpdateListing()` — update mutation
- `useDeleteListing()` — delete mutation

### 2. `src/components/products/ListingDialog.tsx` (NOVO)

Dialog shadcn/ui para adicionar/editar anúncio com campos:
- Plataforma (Select: ML/Shopee/Amazon/Site Próprio)
- Título do Anúncio (Input text, obrigatório)
- ID na Plataforma (Input text, opcional)
- URL do Anúncio (Input URL, opcional)
- Tipo (Select: Unitário/Kit/Combo/Variação)
- Quantidade (Input number, visível apenas quando tipo != single, default 1)
- Preço R$ (Input number, opcional)
- Ativo (Switch, default true)

Recebe prop `listing?: ProductListing` para modo edição.

### 3. `src/components/products/ProductListingsSection.tsx` (NOVO)

Componente da seção "Anúncios deste Produto":
- Header com título + botão "+ Adicionar Anúncio"
- Lista de cards compactos com dados do listing:
  - Badge de plataforma (ML amarelo, Shopee vermelho, Amazon laranja, Site teal)
  - Título, tipo traduzido, preço, platform_item_id, URL clicável
  - Botões editar/deletar + indicador ativo (bolinha verde/cinza)
- Empty state quando sem anúncios
- AlertDialog de confirmação ao deletar
- Usa `useProductListings(productId)` para dados

### 4. `src/pages/ProductDetail.tsx` (EDITAR)

- Remover campo "Link Site" (linha 149-151)
- Remover seção "Links do Anúncio nos Marketplaces" (linhas 168-183)
- Remover `site_link` e `mp_links` do form state e do handleSave
- Remover imports de `extractAllMarketplaceLinks`, `buildMarketplaceLinkJson`, `MARKETPLACE_LINK_PLACEHOLDERS`
- Adicionar `<ProductListingsSection productId={id!} />` entre "Diferenciais" e o switch "Produto ativo"

### 5. `src/components/products/ProductDialog.tsx` (EDITAR)

- Remover campo "Link Site" (linha 168-170)
- Remover seção "Links do Anúncio nos Marketplaces" (linhas 187-203)
- Remover `site_link` e `mp_links` do `getInitial()` e do `handleSave` payload
- Remover imports não utilizados (`extractAllMarketplaceLinks`, `buildMarketplaceLinkJson`, `MARKETPLACE_LINK_PLACEHOLDERS`)
- **NÃO** adicionar seção de anúncios no dialog de criar (anúncios só fazem sentido após o produto existir)

### 6. `src/components/products/ProductTable.tsx` (SEM ALTERAÇÃO)

A tabela não tem coluna de links/marketplace — nenhuma mudança necessária.

## Constantes de plataforma para badges

```typescript
const PLATFORM_BADGES = {
  mercado_livre: { bg: "bg-[#FFE600]", text: "text-[#333]", label: "ML" },
  shopee: { bg: "bg-[#EE4D2D]", text: "text-white", label: "Shopee" },
  amazon: { bg: "bg-[#FF9900]", text: "text-[#232F3E]", label: "Amazon" },
  site_proprio: { bg: "bg-primary", text: "text-white", label: "Site" },
};

const LISTING_TYPE_LABELS = {
  single: "Unitário", kit: "Kit", combo: "Combo", variation: "Variação",
};
```

