

# Correção: Layout de Scroll na página /marketplaces

## Problema
O container `<main>` no AppLayout tem `overflow-y-auto`, fazendo tudo rolar junto — título, KPIs, tabs e conteúdo.

## Solução

### 1. `src/pages/Marketplaces.tsx`
- Trocar `space-y-6` por `flex flex-col h-full overflow-hidden gap-6`
- PageHeader e KPICards: `shrink-0`
- Tabs container: `flex-1 flex flex-col min-h-0 overflow-hidden`
- TabsContent para questions e chats: `flex-1 min-h-0 overflow-hidden` + `data-[state=active]:flex data-[state=active]:flex-col`
- TabsContent para config: `flex-1 min-h-0 overflow-y-auto`

### 2. `src/components/marketplaces/QuestionsTab.tsx`
- Container: `flex flex-col h-full overflow-hidden`
- Filtros: `shrink-0`
- Lista de cards: wrappear em `div` com `flex-1 overflow-y-auto min-h-0`

### 3. `src/components/marketplaces/ChatsTab.tsx`
- Trocar `h-[calc(100vh-320px)] min-h-[500px]` por `h-full`

### 4. `src/components/layout/AppLayout.tsx`
- Na `<main>`, para que a página Marketplaces consiga usar `h-full`, preciso garantir que o main não tenha overflow-y-auto quando a página interna gerencia scroll. A abordagem mais simples: manter `overflow-y-auto` no main (outras páginas precisam dele) mas no Marketplaces usar `h-[calc(100vh-3.5rem)]` ou similar. Na verdade, como main já é `flex-1` dentro de um flex-col, basta que o Marketplaces use `h-full` — mas main precisa ter `overflow-hidden` ou a altura fixa.

Abordagem refinada: Não alterar AppLayout. Em Marketplaces, usar `h-[calc(100vh-3.5rem-2rem)]` (viewport - header 56px - padding) para forçar a altura fixa. Ou melhor: usar classes que fazem o container preencher o parent com `min-h-0` e o main já tem flex-1.

Vou verificar: main é `flex-1 overflow-y-auto`. Se Marketplaces tiver `h-full`, ele vai ter a altura do conteúdo intrínseco, não do parent, porque `overflow-y-auto` permite crescer. Preciso mudar main para não ter overflow para a página de Marketplaces, ou usar uma abordagem com height fixo.

**Melhor abordagem**: Não modificar AppLayout. No Marketplaces, usar altura calculada: `h-[calc(100vh-theme(spacing.14)-2*theme(spacing.6))]` simplificado como `h-[calc(100vh-5.5rem)]` (header 3.5rem + padding 1rem top + 1rem bottom = ~5.5rem no desktop). Isso é robusto sem alterar outras páginas.

### Arquivos modificados:
1. **`src/pages/Marketplaces.tsx`** — container flex-col com altura fixa, overflow-hidden
2. **`src/components/marketplaces/QuestionsTab.tsx`** — flex-col h-full, filtros shrink-0, lista scrollável
3. **`src/components/marketplaces/ChatsTab.tsx`** — trocar altura calculada por `h-full`
4. **`src/components/marketplaces/ConfigTab.tsx`** — wrapper `overflow-y-auto h-full`

Nenhum outro arquivo modificado.

