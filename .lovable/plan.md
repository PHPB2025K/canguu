
# Sprint 8 — Configuracoes + Polish Global

## Descoberta Importante: agent_config e key-value

A tabela `agent_config` NAO tem colunas por campo (como agent_name, system_prompt, etc.). Ela usa um padrao **key-value** com colunas `config_key` (varchar) e `config_value` (text). Cada configuracao e uma row separada.

Keys existentes no banco:
- `agent_name` = "Giovana"
- `system_prompt` = (texto longo do system prompt)
- `model` = "claude-sonnet-4-20250514"
- `max_tokens` = "500"
- `greeting_message` = mensagem de boas-vindas
- `away_message` = mensagem fora do horario
- `escalation_keywords` = JSON array de strings
- `max_messages_before_escalation` = "10"
- `notification_phone` = telefone
- `max_chars_per_chunk` = "200"
- `max_chunks_per_response` = "4"
- `max_total_chars` = "600"
- `message_buffer_seconds` = "8"
- `temperature` (se existir, senao default 0.7)

Nao existem campos dedicados para: ferramentas habilitadas, horario de atendimento, ou limites complexos de escalonamento como jsonb separado. Os dados de escalonamento sao campos individuais (max_messages_before_escalation, escalation_keywords).

## Arquivos a Criar/Modificar

### 1. `src/hooks/useSettings.ts` (CRIAR)
- `useAgentConfig()` — query SELECT * FROM agent_config, retorna como Record (config_key -> config_value)
- `useUpdateAgentConfig()` — mutation que recebe Record parcial, faz UPSERT por config_key
- `useIntegrationStats()` — queries count de products, customers, conversations para card Supabase

### 2. `src/hooks/useSidebarCounts.ts` (CRIAR)
- Query count de escalations WHERE status='pending' e conversations WHERE status='active'
- Realtime subscription em ambas tabelas para invalidar
- Retorna { pendingEscalations: number, activeConversations: number }

### 3. `src/pages/Settings.tsx` (REESCREVER)
Layout com tabs verticais (desktop) / horizontais (mobile):

**Tab "Agente IA":**
- Secao Identidade: agent_name (Input), system_prompt (Textarea 8 rows + contador chars), nao tem campo "ativo" dedicado no banco
- Secao Modelo: model (Select com opcoes LLM), temperature (Slider 0-2 step 0.1 — ler do config ou default 0.7), max_tokens (Input number)
- Secao Mensagens: greeting_message (Textarea), away_message (Textarea)
- Secao Limites de Resposta: max_chars_per_chunk, max_chunks_per_response, max_total_chars, message_buffer_seconds
- Secao Escalonamento: max_messages_before_escalation (Input number), escalation_keywords (chip input — parsear JSON array)
- Botao "Salvar Configuracoes" sticky no bottom

Ao salvar: iterar sobre os campos modificados, fazer UPSERT (INSERT ON CONFLICT ou UPDATE) por config_key. Toast sucesso/erro.

**Tab "Integracoes":**
4 cards de status: WhatsApp (info estatica), Supabase (contagens reais), OpenAI/LLM (modelo do config), N8N (info estatica)

**Tab "Conta":**
Email do user (read-only), botao Sair com ConfirmDialog

### 4. `src/components/layout/AppSidebar.tsx` (MODIFICAR)
- Importar e usar useSidebarCounts
- Adicionar badge vermelho no item "Escalonamentos" se pendingEscalations > 0
- Adicionar badge azul no item "Conversas" se activeConversations > 0
- Badges: pequeno circulo h-5 w-5 rounded-full text-xs font-bold

### 5. `src/components/layout/AppLayout.tsx` (MODIFICAR)
- Adicionar useEffect para atualizar document.title por rota: "Dashboard -- Budamix AI Agent"
- Fechar Sheet mobile ao navegar (useEffect em location.pathname que seta sheetOpen=false)

### 6. Polish em arquivos existentes (MODIFICAR minimamente)
- Adicionar `transition-all duration-200` em hover de cards existentes onde faltar
- Verificar que `hover:bg-muted/50` esta nas rows de tabela

## Detalhes Tecnicos

**Leitura do agent_config:** Carregar todas as rows, converter para um objeto `Record<string, string>`. Para campos numericos, parsear com Number(). Para escalation_keywords, parsear com JSON.parse().

**Salvamento:** Para cada key modificada, fazer:
```sql
UPDATE agent_config SET config_value = $value, updated_at = now() WHERE config_key = $key
```
Se a key nao existir, fazer INSERT.

**Slider de temperatura:** Ler config_value de "temperature" (se nao existir, default "0.7"). Exibir valor atual a direita. Ao salvar, converter para string.

**Chip input de keywords:** Mesmo padrao usado no FaqDialog — Input + Enter para add, X para remover. Parsear JSON array do config_value, ao salvar converter de volta para JSON string.

**Sidebar badges:** O hook useSidebarCounts faz 2 queries count com head:true. Realtime em escalations e conversations invalida o cache. Badges renderizados condicionalmente (count > 0).

**Titulo dinamico:** useEffect no AppLayout que seta `document.title = title + " -- Budamix AI Agent"` sempre que basePath mudar.

**Mobile sidebar close:** useEffect em AppLayout que observa location.pathname e seta setSheetOpen(false).

## Ordem de Implementacao

1. `src/hooks/useSettings.ts`
2. `src/hooks/useSidebarCounts.ts`
3. `src/pages/Settings.tsx`
4. `src/components/layout/AppSidebar.tsx` (adicionar badges)
5. `src/components/layout/AppLayout.tsx` (titulo dinamico + mobile close)
