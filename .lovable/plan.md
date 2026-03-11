

# Correções de Polish — Perguntas ML

## Problemas identificados

Com base na investigação dos dados reais:

1. **`product_name` salvo como ID do anúncio** (`MLB3343832496` em vez do título real) — a edge function `ml-webhook` não busca o título do item na API do ML
2. **`error_message: already_answered_on_ml` em pergunta respondida com sucesso** — a edge function tenta postar a resposta, recebe confirmação, mas depois marca erro porque detecta que "já foi respondida" (provavelmente uma verificação redundante pós-post)
3. **`answered_by: 'ai'` vs frontend esperando `'ai_agent'`** — o `AnsweredByBadge` só reconhece `ai_agent`, então perguntas respondidas pela IA não mostram o badge correto

## Alterações

### 1. Edge Function `ml-webhook` — Buscar título do item

- Ao receber notificação de nova pergunta, chamar `GET /items/{item_id}` na API do ML para obter o `title` real
- Salvar em `product_name` o título retornado (fallback para `platform_item_id` se a chamada falhar)
- Limpar `error_message` quando a resposta for postada com sucesso (não gravar `already_answered_on_ml` se o status final é `answered`)

### 2. Edge Function `ml-webhook` — Padronizar `answered_by`

- Alterar de `'ai'` para `'ai_agent'` ao salvar no banco, alinhando com o que o frontend espera

### 3. Frontend `QuestionCard.tsx` — Tolerância no badge

- `AnsweredByBadge`: aceitar tanto `'ai'` quanto `'ai_agent'` como IA (para compatibilidade com registros já salvos)

### 4. Correção de dados existentes (one-time)

- UPDATE nas 2 perguntas reais existentes:
  - Buscar título real do item `MLB3343832496` via API do ML e atualizar `product_name`
  - Limpar `error_message` da pergunta `ef73968e` (foi respondida com sucesso)
  - Atualizar `answered_by` de `'ai'` para `'ai_agent'`

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/ml-webhook/index.ts` | Fetch título do item; padronizar `answered_by`; limpar `error_message` em sucesso |
| `src/components/marketplaces/QuestionCard.tsx` | `AnsweredByBadge` aceitar `'ai'` e `'ai_agent'` |
| Script SQL one-time | Corrigir dados das 2 perguntas existentes |

