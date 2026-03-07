

# SPRINT SYNC-1 — Corrigir tipos TypeScript

## Diagnóstico

Após verificar todos os arquivos, **os nomes de coluna no frontend já estão corretos** — `stock_quantity`, `product_line`, `short_description`, `is_active`, `site_link`, `marketplace_links`, `usage_suggestions` são usados consistentemente em queries e componentes. Nenhuma correção de nome de coluna é necessária.

O trabalho real é **adicionar campos e tipos faltantes** em `src/types/database.ts`.

## Alterações

### `src/types/database.ts`

1. **Product** — adicionar campos `search_text`, `embedding` (opcionais, já existem no banco mas faltam no tipo); adicionar campo opcional `listings`

2. **Adicionar `ProductListing`** (tipo novo para tabela `product_listings`):
   - `id`, `product_id`, `platform`, `platform_item_id`, `listing_title`, `listing_url`, `listing_type`, `kit_quantity`, `listing_price`, `is_active`, `metadata`, `created_at`, `updated_at`

3. **MarketplaceQuestion** — adicionar campos novos: `product_id`, `seller_id`, `ai_classification`, `ai_response_time_ms`, `tokens_used`, `error_message`, `external_created_at`, `updated_at`

4. **MarketplaceChat** — adicionar campos novos: `seller_id`, `buyer_id`, `customer_id`, `conversation_id`, `last_message_at`, `metadata`

5. **MarketplaceChatMessage** — adicionar campos novos: `external_message_id`, `tokens_used`

6. **MarketplaceTokenStatus** — já existe, apenas ajustar para incluir `status` com union type literal (`'pending' | 'active' | 'expired' | 'revoked'`)

### Nenhum outro arquivo alterado

Nenhuma query, componente, hook ou página precisa ser modificado — os nomes de coluna já estão corretos.

