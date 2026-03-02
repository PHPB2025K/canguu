

# Sprint 1 — Login, AuthGuard, Layout Shell e Rotas

Implementacao da fundacao do dashboard Budamix AI Agent: autenticacao com Supabase Auth, sidebar de navegacao, header dinamico e rotas protegidas. Zero alteracoes no Supabase.

## Arquivos a Criar

### 1. `src/stores/useAuthStore.ts`
Store Zustand para gerenciar estado de autenticacao:
- Estado: `user`, `session`, `loading`, `initialized`
- Action `initialize()`: chama `getSession()` e registra listener `onAuthStateChange()`
- Action `signOut()`: chama `supabase.auth.signOut()`

### 2. `src/pages/Login.tsx`
Pagina publica de login:
- Fundo bg-gray-950, card centralizado com shadcn Card
- Titulo "Budamix AI Agent" + subtitulo "Painel de Gestao"
- Campos email e senha com labels em portugues
- Botao "Entrar" azul (#3B82F6) full-width com spinner durante loading
- Chama `supabase.auth.signInWithPassword()`
- Toast destructive em caso de erro
- Redirect para /dashboard se ja autenticado ou apos login

### 3. `src/components/layout/AuthGuard.tsx`
Componente wrapper de protecao de rotas:
- Inicializa o auth store
- Exibe spinner/skeleton centralizado enquanto `loading` e true
- Redireciona para `/login` se nao autenticado
- Renderiza `<Outlet />` se autenticado

### 4. `src/components/layout/AppSidebar.tsx`
Sidebar fixa com navegacao:
- w-64, bg-gray-900, h-screen, border-r border-gray-800
- Logo "Budamix AI" no topo
- 8 itens de navegacao usando NavLink com icones Lucide
- Item ativo: bg-blue-500/10, text-blue-400
- Separador antes de Configuracoes
- Bottom: email do usuario truncado + botao "Sair" vermelho
- Mobile: renderiza como Sheet/Drawer

### 5. `src/components/layout/AppLayout.tsx`
Layout shell principal:
- Desktop: sidebar fixa + conteudo com ml-64
- Mobile: sidebar como Sheet + header com hamburger
- Header sticky com titulo dinamico da pagina + icone de notificacoes + avatar
- Conteudo: p-6, bg-gray-950, min-h-screen, overflow-y auto
- `<Outlet />` do React Router

### 6. Paginas Placeholder (11 arquivos)
Componentes simples para cada rota:
- `Dashboard.tsx`, `Conversations.tsx`, `ConversationDetail.tsx`
- `Products.tsx`, `ProductDetail.tsx`, `Policies.tsx`
- `Customers.tsx`, `CustomerDetail.tsx`
- `Escalations.tsx`, `Analytics.tsx`, `Settings.tsx`
- Cada uma com icone grande (opacity-20) + titulo + "Em construcao..."

## Arquivos a Modificar

### 7. `index.html`
- Adicionar classe `dark` no `<html>` para tema escuro padrao
- Atualizar `<title>` para "Budamix AI Agent"
- Adicionar link para font Inter do Google Fonts

### 8. `src/index.css`
- Atualizar CSS variables do tema escuro com cores mais adequadas ao design (gray-950 como background)
- Configurar sidebar colors para gray-900
- Manter primary azul (#3B82F6 = HSL 217 91% 60%)

### 9. `src/App.tsx`
- Configurar React Router com todas as rotas:
  - `/login` publica
  - `/` redirect para `/dashboard`
  - Rotas protegidas dentro de AuthGuard + AppLayout
  - Rotas com `:id` para conversations, products, customers

## Estrutura de Rotas

```text
BrowserRouter
  /login          → Login (publica)
  /               → redirect /dashboard
  [AuthGuard]     → verifica sessao
    [AppLayout]   → sidebar + header + outlet
      /dashboard
      /conversations
      /conversations/:id
      /products
      /products/:id
      /policies
      /customers
      /customers/:id
      /escalations
      /analytics
      /settings
  *               → NotFound
```

## Detalhes Tecnicos

- Supabase client ja existe em `src/integrations/supabase/client.ts`
- NavLink ja existe em `src/components/NavLink.tsx` — sera usado para highlighting ativo
- Sidebar shadcn existe mas NAO sera usada (o prompt pede sidebar custom com estilos especificos)
- Em vez disso, sidebar sera um componente custom usando Tailwind puro + Sheet do shadcn para mobile
- Zustand ja esta no package.json
- Nenhuma migracao SQL ou alteracao no Supabase

## Ordem de Implementacao

1. Atualizar `index.html` e `index.css` (tema escuro)
2. Criar `useAuthStore.ts`
3. Criar `Login.tsx`
4. Criar `AuthGuard.tsx`
5. Criar `AppSidebar.tsx`
6. Criar `AppLayout.tsx`
7. Criar 11 paginas placeholder
8. Atualizar `App.tsx` com rotas

