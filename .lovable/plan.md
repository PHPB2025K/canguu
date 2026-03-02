
# Sprint 6 — Politicas/FAQ + Clientes

Implementar `/policies` com tabs e CRUD para policies e faq, e `/customers` com listagem e detalhe.

## Schema Real Confirmado

**policies**: id, title (varchar), category (varchar), marketplace (varchar), content (text), summary (text), priority (integer), is_active (boolean), created_at, updated_at

**faq**: id, question (text), answer (text), category (varchar), keywords (array), usage_count (integer), is_active (boolean), created_at, updated_at

**customers**: id, name (varchar), phone (varchar), email (varchar), source (varchar), tags (array), notes (text), marketplace_user_id (varchar), total_conversations (integer), first_contact_at, last_contact_at, created_at, updated_at

## Arquivos a Criar

### 1. `src/hooks/usePolicies.ts`
- `usePolicyList(categoryFilter)` — query policies com filtro opcional por category, ORDER BY priority DESC
- `useCreatePolicy()` — mutation INSERT + invalidate
- `useUpdatePolicy()` — mutation UPDATE + invalidate
- `useDeletePolicy()` — mutation DELETE + invalidate
- `useTogglePolicyActive()` — mutation UPDATE is_active inline
- `useFaqList(categoryFilter)` — query faq com filtro, ORDER BY usage_count DESC
- `useCreateFaq()` — mutation INSERT
- `useUpdateFaq()` — mutation UPDATE
- `useDeleteFaq()` — mutation DELETE
- `useToggleFaqActive()` — mutation UPDATE is_active inline
- `useFaqCategories()` — SELECT DISTINCT category FROM faq

### 2. `src/hooks/useCustomers.ts`
- `useCustomerList(search)` — query customers com search ilike em name, phone, email. ORDER BY last_contact_at DESC
- `useCustomer(id)` — single customer by id
- `useCustomerConversations(customerId)` — conversations WHERE customer_id, com join ultima mensagem
- `useUpdateCustomerTags()` — mutation UPDATE tags
- `useUpdateCustomerNotes()` — mutation UPDATE notes
- `useCustomerSentimentStats(customerId)` — busca sentiments das conversas do cliente para calcular predominante

### 3. `src/components/policies/PolicyDialog.tsx`
Dialog criar/editar politica (max-w-2xl):
- Campos: Titulo* (Input), Categoria* (Select: Troca/Entrega/Garantia/Pagamento/Geral), Marketplace (Input), Conteudo* (Textarea 8 rows), Resumo (Textarea 3 rows + contador "/500"), Prioridade (Input number), Ativo (Switch)
- Validacao: titulo, categoria, conteudo obrigatorios
- Insert/Update + toast + close

### 4. `src/components/policies/PolicyTable.tsx`
Tabela com colunas: Titulo, Categoria (badge), Marketplace, Prioridade, Ativo (Switch), Acoes (editar/excluir)

### 5. `src/components/policies/FaqDialog.tsx`
Dialog criar/editar FAQ (max-w-2xl):
- Campos: Pergunta* (Textarea 2 rows), Resposta* (Textarea 6 rows), Categoria* (Input), Keywords (chip input com Enter para add, X para remove), Ativo (Switch)
- Em edicao: exibir "Utilizado X vezes" read-only
- Validacao: pergunta, resposta, categoria obrigatorios

### 6. `src/components/policies/FaqTable.tsx`
Tabela com colunas: Pergunta (truncar 80 chars), Categoria (badge), Keywords (chips max 3 + "+N"), Uso (badge numero), Ativo (Switch), Acoes (editar/excluir)

### 7. `src/components/customers/CustomerTable.tsx`
Tabela com colunas: Nome, Telefone (formatPhone), Origem (badge colorido), Total Conversas, Ultimo Contato (RelativeTime), Tags (chips max 2 + "+N"), Acoes (Eye)
- Click na row navega para /customers/:id
- Ordenacao por nome, total_conversations, last_contact_at

### 8. `src/components/customers/CustomerInfo.tsx`
Card coluna esquerda do detalhe: avatar iniciais, nome, telefone, email, badge origem

### 9. `src/components/customers/CustomerTags.tsx`
Card de tags editaveis: chips removiveis + input para adicionar via Enter. UPDATE customers SET tags.

### 10. `src/components/customers/CustomerNotes.tsx`
Card de notas: Textarea + botao "Salvar Notas". UPDATE customers SET notes.

### 11. `src/components/customers/CustomerHistory.tsx`
Lista de conversas do cliente: StatusBadge + categoria + preview ultima mensagem + RelativeTime. Click navega para /conversations/:id.

### 12. Paginas

**`src/pages/Policies.tsx`** (reescrever):
- Tabs "Politicas" | "FAQ"
- Tab Politicas: Select categoria + botao Adicionar + PolicyTable + PolicyDialog + ConfirmDialog exclusao
- Tab FAQ: Select categoria + botao Adicionar + FaqTable + FaqDialog + ConfirmDialog exclusao

**`src/pages/Customers.tsx`** (reescrever):
- PageHeader + SearchBar + CustomerTable

**`src/pages/CustomerDetail.tsx`** (reescrever):
- Botao voltar + layout 2 colunas
- Esquerda: CustomerInfo + CustomerTags + CustomerNotes
- Direita: 3 stat cards (Total Conversas, Sentimento Medio, Ultima Interacao) + CustomerHistory

## Detalhes Tecnicos

**Chip Input (keywords/tags):** Componente inline dentro dos dialogs/cards. Input controlado + onKeyDown Enter para push ao array + map de badges com botao X.

**Contador de caracteres (resumo):** `{value.length}/500` renderizado abaixo do Textarea.

**Badge de origem (customers):** whatsapp = bg-green-500/10 text-green-400, site = bg-blue-500/10 text-blue-400, marketplace = bg-purple-500/10 text-purple-400.

**Sentimento medio (detalhe cliente):** Contar sentiments das conversas do cliente (positive/negative/neutral), exibir o predominante com emoji.

**Total conversas e ultimo contato:** Usar campos `total_conversations` e `last_contact_at` ja existentes na tabela customers (populados por trigger). Nao precisa de subquery.

## Componentes Reutilizados
PageHeader, SearchBar, LoadingState, EmptyState, ConfirmDialog, StatusBadge, SentimentBadge, RelativeTime, formatPhone, formatCurrency, truncateText

## Ordem de Implementacao

1. `src/hooks/usePolicies.ts`
2. `src/components/policies/PolicyDialog.tsx`
3. `src/components/policies/PolicyTable.tsx`
4. `src/components/policies/FaqDialog.tsx`
5. `src/components/policies/FaqTable.tsx`
6. `src/pages/Policies.tsx`
7. `src/hooks/useCustomers.ts`
8. `src/components/customers/CustomerTable.tsx`
9. `src/components/customers/CustomerInfo.tsx`
10. `src/components/customers/CustomerTags.tsx`
11. `src/components/customers/CustomerNotes.tsx`
12. `src/components/customers/CustomerHistory.tsx`
13. `src/pages/Customers.tsx`
14. `src/pages/CustomerDetail.tsx`
