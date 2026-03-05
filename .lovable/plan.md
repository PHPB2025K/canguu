

# Preços por Plataforma — Plano de Implementação

## Resumo

Substituir o campo único "Preço Marketplace R$" por 6 campos individuais (Mercado Livre, Shopee, Amazon, TikTok Shop, Site Próprio, WhatsApp Direto) salvos como jsonb em `price_marketplace`. Atualizar o system prompt da IA com regra de identificação de plataforma.

## Arquivos a Modificar

### 1. `src/hooks/useProducts.ts` — Helper `extractMarketplacePrice`

Atualizar para aceitar key opcional de plataforma:

```ts
export function extractMarketplacePrice(pm: unknown, platform?: string): number | null {
  if (!pm) return null;
  if (typeof pm === "number") return pm;
  if (typeof pm === "object" && pm !== null) {
    const obj = pm as Record<string, unknown>;
    if (platform && platform in obj && typeof obj[platform] === "number") return obj[platform] as number;
    if ("default" in obj && typeof obj.default === "number") return obj.default;
    const vals = Object.values(obj).filter((v) => typeof v === "number");
    if (vals.length > 0) return vals[0] as number;
  }
  return null;
}
```

Adicionar novo helper para extrair todos os preços por plataforma para o formulário:

```ts
const MARKETPLACE_PLATFORMS = ["mercadolivre", "shopee", "amazon", "tiktok", "site", "whatsapp"] as const;

export function extractAllMarketplacePrices(pm: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of MARKETPLACE_PLATFORMS) {
    const val = pm && typeof pm === "object" ? (pm as Record<string, unknown>)[key] : undefined;
    result[key] = typeof val === "number" ? String(val) : "";
  }
  return result;
}

export function buildMarketplacePriceJson(prices: Record<string, string>): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(prices)) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) result[key] = num;
  }
  return Object.keys(result).length > 0 ? result : null;
}
```

### 2. `src/components/products/ProductDialog.tsx`

- No `getInitial`: substituir `price_marketplace: extractMarketplacePrice(...)` por `mp_prices: extractAllMarketplacePrices(product?.price_marketplace)`
- Remover o campo `<Input id="price_marketplace">` (lines 143-145)
- Adicionar seção "Preços por Plataforma" com `sm:col-span-2`, contendo grid 2x3 com os 6 campos (label + input number step 0.01, placeholder "R$ 0,00")
- No `handleSave`: substituir `price_marketplace: form.price_marketplace ? { default: ... } : null` por `price_marketplace: buildMarketplacePriceJson(form.mp_prices)`
- O `set` precisa suportar nested: adicionar `setMpPrice(key, value)` helper

### 3. `src/pages/ProductDetail.tsx`

- Mesma lógica: substituir `price_marketplace` único por `mp_prices` object no state
- Remover campo "Preço Marketplace R$" (lines 118-121)
- Adicionar seção "Preços por Plataforma" idêntica ao dialog
- No `handleSave`: usar `buildMarketplacePriceJson(form.mp_prices)`

### 4. System Prompt — Supabase UPDATE

Usar o insert tool para concatenar o bloco de regra de identificação de plataforma ao `config_value` existente na `agent_config` onde `config_key = 'system_prompt'`.

## Sem alteração de schema

A coluna `price_marketplace` (jsonb) já existe. Apenas o formato do JSON muda de `{ "default": 99.90 }` para `{ "mercadolivre": 99.90, "shopee": 89.90, ... }`.

## Arquivos NÃO alterados

ProductTable, ProductCards, ProductToolbar, Products.tsx, todas as queries/mutations/hooks existentes (exceto o helper `extractMarketplacePrice`).

