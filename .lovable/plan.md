

# Conectar Tab Configurações com dados reais do marketplace_tokens

## Situação Atual

- A tabela `marketplace_tokens` já existe no Supabase com campos: `platform`, `seller_id`, `status`, `access_token`, `refresh_token`, `token_expires_at`, `seller_nickname`, `app_id`, `metadata`
- A tabela já tem RLS policy para authenticated users
- O tipo não está no `types.ts` gerado (será necessário usar type casting)
- Não existe edge function de OAuth do ML ainda
- O `ConfigTab.tsx` usa dados 100% estáticos

## Plano

### 1. Criar view segura `marketplace_token_status` (migração SQL)

View que expõe apenas campos seguros (sem tokens):

```sql
CREATE VIEW public.marketplace_token_status
WITH (security_invoker = on) AS
SELECT
  id, platform, seller_id, seller_nickname, app_id, status,
  token_expires_at,
  CASE
    WHEN access_token IS NOT NULL AND token_expires_at > now() THEN 'connected'
    WHEN access_token IS NOT NULL AND token_expires_at <= now() THEN 'expired'
    ELSE 'disconnected'
  END AS connection_status,
  created_at, updated_at
FROM public.marketplace_tokens;
```

### 2. Criar hook `useMarketplaceTokens` em `src/hooks/useMarketplaces.ts`

- Query para `marketplace_token_status` view (por plataforma)
- Query para contagem de perguntas respondidas por plataforma (`marketplace_questions` WHERE status = 'answered')
- Subscription Realtime na tabela `marketplace_tokens` para invalidar a query automaticamente

### 3. Refatorar `PlatformCard` em `ConfigTab.tsx`

Substituir props estáticas por dados reais:

- **Status**: Baseado em `connection_status` da view (connected/expired/disconnected)
- **Seller ID**: Exibir `seller_id` real ou placeholder se desconectado
- **Tokens**: Sempre exibir "••••••••" com ícone de cadeado (nunca o valor real)
- **Estatísticas**: Perguntas respondidas reais + tempo médio (ou "—")
- **Botões**:
  - Desconectado → "Conectar [Plataforma]" (habilitado apenas para ML, desabilitado para Shopee/Amazon com tooltip "Em breve")
  - Conectado → "Reconectar" (outline) + "Desconectar" (ghost destructive)
  - Expirado → "Renovar Token" (warning)
- **Botão "Conectar Mercado Livre"**: Por enquanto, mostra toast informando que a URL OAuth será configurada (não existe edge function ml-oauth ainda)

### 4. Realtime subscription

No hook, adicionar `supabase.channel('marketplace_tokens').on('postgres_changes', ...)` para invalidar queries quando tokens mudam.

## Arquivos alterados

| Arquivo | Ação |
|---------|------|
| Migração SQL (view) | Criar `marketplace_token_status` view |
| `src/hooks/useMarketplaces.ts` | Adicionar `useMarketplaceTokenStatus`, `usePlatformStats`, realtime subscription |
| `src/components/marketplaces/ConfigTab.tsx` | Refatorar PlatformCard com dados reais |
| `src/types/database.ts` | Adicionar interface `MarketplaceTokenStatus` |

## Guardrails respeitados

- Tokens NUNCA expostos no frontend (view exclui access_token/refresh_token)
- Tab Perguntas e Tab Chats inalteradas
- Card de IA inalterado
- Nenhuma outra página alterada
- Todo texto em português brasileiro

