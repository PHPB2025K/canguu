

# Links por Plataforma + System Prompt de Canal

## Resumo

Substituir campo único "Link Marketplace" por 6 campos individuais de link por plataforma no jsonb `marketplace_links`. Atualizar system prompt com regra de canal e conversão.

## Alterações

### 1. `src/hooks/useProducts.ts` — Adicionar 2 helpers (após `extractMarketplaceLink`, line 233)

- `extractAllMarketplaceLinks(ml)` — extrai links por plataforma do jsonb para form state (Record<string, string>)
- `buildMarketplaceLinkJson(links)` — converte form state para jsonb (descarta vazios)

Reutiliza `MARKETPLACE_PLATFORMS` existente. Não altera nenhum helper existente.

### 2. `src/components/products/ProductDialog.tsx`

- **Import**: adicionar `extractAllMarketplaceLinks`, `buildMarketplaceLinkJson`; remover `extractMarketplaceLink`
- **getInitial** (line 38): trocar `marketplace_links: extractMarketplaceLink(...)` por `mp_links: extractAllMarketplaceLinks(product?.marketplace_links)`
- **JSX** (lines 189-192): remover campo único "Link Marketplace". Adicionar seção "Links dos Anúncios" com `sm:col-span-2`, grid 1 coluna, 6 inputs type="url" iterando `MARKETPLACE_PLATFORMS` com placeholders específicos
- **handleSave** (lines 84-86): trocar `marketplace_links: { url: ... }` por `marketplace_links: buildMarketplaceLinkJson(form.mp_links)`

### 3. `src/pages/ProductDetail.tsx`

- **Import**: adicionar `extractAllMarketplaceLinks`, `buildMarketplaceLinkJson`; remover `extractMarketplaceLink`
- **useEffect state** (line 46): trocar `marketplace_links: extractMarketplaceLink(...)` por `mp_links: extractAllMarketplaceLinks(product.marketplace_links)`
- **JSX** (lines 167-170): remover campo "Link Marketplace". Adicionar seção "Links dos Anúncios" idêntica ao dialog
- **handleSave** (line 76): trocar `marketplace_links: { url: ... }` por `marketplace_links: buildMarketplaceLinkJson(form.mp_links)`

### 4. Supabase Migration — System Prompt Update

SQL migration que faz UPDATE na `agent_config` substituindo o bloco `REGRA DE IDENTIFICAÇÃO DE PLATAFORMA:` pelo novo bloco `REGRA DE CANAL E CONVERSÃO DE PEDIDOS:` com toda a lógica de priorização de canal conforme especificado.

### Placeholders por plataforma

| Key | Placeholder |
|---|---|
| mercadolivre | `https://mercadolivre.com.br/...` |
| shopee | `https://shopee.com.br/...` |
| amazon | `https://amazon.com.br/...` |
| tiktok | `https://tiktok.com/shop/...` |
| site | `https://budamix.com.br/...` |
| whatsapp | `https://wa.me/...` |

## Arquivos NÃO alterados

ProductTable, ProductCards, ProductToolbar, Products.tsx, campo `site_link`, seção "Preços por Plataforma", todos os hooks/queries existentes.

