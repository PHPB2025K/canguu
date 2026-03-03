

# Completar Página de Configurações (/settings)

## Estado Atual vs Requisitos

A página já tem: identidade (nome, prompt), modelo (select, slider, max_tokens), mensagens (boas-vindas, fora do horário), limites de resposta (4 campos), escalonamento (max_messages + keywords), integrações (4 cards com contagens), conta (email + logout + confirmação).

### Faltam implementar:

1. **Switch "Agente Ativo"** na seção Identidade — nova config key `is_active` (valor `"true"`/`"false"`)
2. **Telefone de Notificação** — já existe no banco (`notification_phone`), mas não está na UI
3. **Seção "Ferramentas"** — não existe no banco ainda. Criar como config key `enabled_tools` com valor JSON string de objeto `{ tool_name: boolean }`. Renderizar cada ferramenta como Switch
4. **Seção "Horário de Atendimento"** — não existe no banco. Criar como config key `business_hours` com valor JSON string contendo `{ days: boolean[], start: string, end: string, timezone: string, away_message: string }`. Renderizar com 7 checkboxes + inputs time + select timezone
5. **Dirty-checking** no botão Salvar — comparar form state com config original para disabled
6. **Avatar com iniciais** na tab Conta

## Alterações por Arquivo

### `src/pages/Settings.tsx`

**Seção Identidade — adicionar:**
- Switch "Agente Ativo" com descrição (usando `form.is_active === 'true'`)
- Input "Telefone de Notificação" (`notification_phone`)

**Nova seção "Ferramentas"** (após Escalonamento):
- Parse `form.enabled_tools` como JSON objeto `{ key: boolean }`
- Se não existir, usar defaults: `consultar_produtos`, `verificar_politicas`, `buscar_faq`, `rastrear_pedido`, `consultar_estoque`, `recomendar_produtos` (todos true)
- Cada ferramenta: Switch + label formatado em português
- Ao salvar: `JSON.stringify(toolsState)` → config key `enabled_tools`

**Nova seção "Horário de Atendimento"** (após Ferramentas):
- Parse `form.business_hours` como JSON
- 7 checkboxes inline (Seg-Dom)
- 2 inputs `type="time"` (início/fim)
- Select timezone (4 opções brasileiras)
- Textarea mensagem fora do horário (2 rows)
- Ao salvar: `JSON.stringify(hoursState)` → config key `business_hours`

**Dirty-checking:**
- Manter `originalConfig` ref ao lado do `form` state
- Comparar `JSON.stringify(form) + JSON.stringify(keywords) + JSON.stringify(tools) + JSON.stringify(hours)` com original
- Botão Salvar: `disabled={!isDirty || isPending}`

**Tab Conta — Avatar:**
- Extrair iniciais do email (primeira letra antes do @)
- Círculo `w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold`

### `src/hooks/useSettings.ts`

Sem alterações necessárias — o hook já é genérico (key-value). Novas keys (`is_active`, `enabled_tools`, `business_hours`) serão inseridas automaticamente pelo upsert existente.

## Schema do Banco

Nenhuma alteração de schema. As novas config keys serão criadas automaticamente pelo fallback insert no `useUpdateAgentConfig`.

## Arquivos modificados: 1 (`src/pages/Settings.tsx`)

