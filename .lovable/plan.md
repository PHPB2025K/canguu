

# Sprint 4 — Pagina de Conversas (Split-View + Chat + Realtime)

Implementar `/conversations` com layout split-view estilo WhatsApp Web e `/conversations/:id` como rota direta.

## Dados Reais do Banco

Valores reais encontrados no banco (diferentes do prompt):
- `assigned_to`: "agent", "pending_human", "human_agent" (NAO "ai_agent")
- `sender` (messages): "customer", "agent", "human_agent" (NAO "ai_agent")
- O codigo tratara "agent" como equivalente a "ai_agent" para manter consistencia visual

## Arquivos a Criar

### 1. `src/hooks/useConversations.ts`
Hooks React Query para a pagina de conversas:

- **`useConversationList(filters)`** — busca conversations com join customers, aplica filtros (status, category, sentiment, search). Busca tambem a ultima mensagem de cada conversa via subquery. Supabase realtime subscription para atualizar lista automaticamente.
- **`useConversationMessages(conversationId)`** — busca todas as messages de uma conversa ordenadas por created_at ASC. Realtime subscription para novas mensagens.
- **`useConversationDetail(conversationId)`** — busca conversa individual com join customer.
- **`useSendMessage()`** — mutation para inserir mensagem na tabela messages com sender="human_agent".
- **`useUpdateAssignment()`** — mutation para UPDATE conversations SET assigned_to.

### 2. `src/components/conversations/ConversationList.tsx`
Painel esquerdo (w-96):
- SearchBar no topo com placeholder "Buscar por nome ou telefone..."
- 3 Selects inline: Status, Categoria, Sentimento + botao Limpar
- ScrollArea com lista de conversas
- Cada item: avatar iniciais, nome, preview mensagem, RelativeTime, badges
- Indicador nao-lido (bolinha azul) se ultima mensagem e de sender="customer"
- Item selecionado destacado com bg-blue-500/10 border-l-2
- Loading/Empty states

### 3. `src/components/conversations/ConversationChat.tsx`
Painel direito completo:
- **Header**: nome cliente, telefone, badges, botao Assumir/Devolver
- **Area de mensagens**: bolhas estilizadas por sender (customer=cinza esquerda, agent=azul direita, human_agent=verde direita). Separadores de data. Auto-scroll.
- **Input**: Textarea auto-resize + botao enviar. Desabilitado quando assigned_to="agent" com mensagem explicativa amarela.
- **Empty state**: quando nenhuma conversa selecionada

### 4. `src/components/conversations/MessageBubble.tsx`
Componente de bolha individual:
- Props: message (Message), isOwnSide (boolean)
- Estilos por sender: customer (bg-gray-800, esquerda), agent (bg-blue-600/20, direita), human_agent (bg-green-600/20, direita)
- Icones: User para customer, Bot para agent, UserCheck para human_agent
- Labels: "Cliente", "Agente IA", "Atendente"
- Tipos especiais: audio (Mic icon), image (Image icon), document (FileText icon)
- Timestamp HH:MM

### 5. `src/components/conversations/DateSeparator.tsx`
Separador de data entre mensagens:
- "Hoje", "Ontem", ou "DD/MM/AAAA"
- Linha horizontal com texto centralizado

### 6. `src/components/conversations/ChatInput.tsx`
Input de mensagem:
- Textarea auto-resize (1-4 linhas)
- Enter envia, Shift+Enter nova linha
- Botao Send circular azul
- Estado desabilitado com aviso amarelo quando assigned_to="agent"

### 7. Paginas atualizadas

**`src/pages/Conversations.tsx`** (reescrever):
- Desktop: flex com ConversationList (w-96) + ConversationChat (flex-1)
- Mobile (<1024px): mostra apenas lista. Ao clicar, navega para /conversations/:id
- Estado local para conversa selecionada (desktop)

**`src/pages/ConversationDetail.tsx`** (reescrever):
- Chat full-width com botao "Voltar para conversas" no topo
- Reutiliza ConversationChat

## Detalhes Tecnicos

**Mapeamento assigned_to/sender:**
- DB "agent" = visual "Agente IA" (icone Bot, cor azul)
- DB "human_agent" = visual "Atendente" (icone UserCheck, cor verde)
- DB "customer" = visual "Cliente" (icone User, cor cinza)
- Botao "Assumir": UPDATE assigned_to = 'human_agent'
- Botao "Devolver": UPDATE assigned_to = 'agent'

**Realtime:**
- Canal `conversations-changes`: escuta INSERT/UPDATE na tabela conversations para atualizar lista
- Canal `messages-{conversationId}`: escuta INSERT na tabela messages filtrado por conversation_id para chat ao vivo
- Cleanup de subscriptions no unmount

**Filtros:**
- Status: filtro direto .eq("status", value)
- Categoria: filtro direto .eq("category", value)
- Sentimento: filtro direto .eq("sentiment", value)
- Search: .or(`name.ilike.%${search}%,phone.ilike.%${search}%`) no join customers — implementado via fetch all + filter client-side (Supabase nao suporta ilike em tabelas joined facilmente)

**Auto-scroll:** useRef no container + scrollIntoView({ behavior: "smooth" }) via useEffect quando messages mudam.

**Mobile detection:** usar hook useIsMobile existente (breakpoint 768px). Para o split-view usar lg (1024px) via CSS classes.

## Ordem de Implementacao

1. `src/hooks/useConversations.ts` — hooks de dados e realtime
2. `src/components/conversations/DateSeparator.tsx`
3. `src/components/conversations/MessageBubble.tsx`
4. `src/components/conversations/ChatInput.tsx`
5. `src/components/conversations/ConversationChat.tsx`
6. `src/components/conversations/ConversationList.tsx`
7. `src/pages/Conversations.tsx` — reescrever com split-view
8. `src/pages/ConversationDetail.tsx` — reescrever com chat full-width

