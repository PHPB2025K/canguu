
# Sprint 5 — Pagina de Produtos (CRUD Completo)

Implementar `/products` com listagem tabela/cards, busca, filtros, criacao/edicao via dialog, e exclusao com confirmacao.

## Mapeamento Real do Schema (Correcoes ao Prompt)

O prompt do usuario usa nomes de colunas diferentes do banco real. Aqui esta o mapeamento correto que sera usado:

| Prompt diz | Banco real | Tipo |
|---|---|---|
| `line` | `product_line` | varchar |
| `description` | `short_description` | text |
| `stock` | `stock_quantity` | integer |
| `active` | `is_active` | boolean |
| `suggestions` | `usage_suggestions` | text |
| `link_site` | `site_link` | text |
| `link_marketplace` | `marketplace_links` | jsonb |
| `price_marketplace` | `price_marketplace` | jsonb (nao numeric) |
| `dimensions` | `dimensions` | jsonb (nao text) |
| `images` | `images` | jsonb (nao text[]) |

Linhas existentes no banco: BSP, CQT, Hermetica, JGR, KBT, MDL, MXG, PNH, TBC

## Arquivos a Criar

### 1. `src/hooks/useProducts.ts`

Hooks React Query para a pagina de produtos:

- **`useProductList(filters)`** — busca products com filtros opcionais (search em name/sku via ilike, product_line via eq, is_active via eq). Ordenacao por coluna configuravel. staleTime 60s.
- **`useProduct(id)`** — busca produto individual por id.
- **`useCreateProduct()`** — mutation INSERT com invalidacao do cache.
- **`useUpdateProduct()`** — mutation UPDATE com invalidacao do cache.
- **`useDeleteProduct()`** — mutation DELETE com invalidacao do cache.
- **`useToggleProductActive()`** — mutation UPDATE is_active com invalidacao do cache (para o switch inline).
- **`useProductLines()`** — query SELECT DISTINCT product_line para popular o select de filtro.

### 2. `src/components/products/ProductToolbar.tsx`

Toolbar no topo com:
- SearchBar (placeholder "Buscar por nome ou SKU...")
- Select "Linha" com valores dinamicos do hook useProductLines
- Select "Status" (Todos/Ativos/Inativos)
- ToggleGroup (Table2/LayoutGrid) para alternar visualizacao
- Botao "Adicionar Produto" (azul, icone Plus)

### 3. `src/components/products/ProductTable.tsx`

Tabela shadcn com colunas: SKU, Nome, Linha, Material, Preco Site, Estoque (badge colorido), Ativo (Switch inline), Acoes (editar/excluir).
- Headers clicaveis para ordenacao (name, sku, price_site, stock_quantity)
- Seta indicadora de direcao da ordenacao

### 4. `src/components/products/ProductCards.tsx`

Grid de cards responsivo (3/2/1 colunas).
- Imagem ou placeholder, SKU, nome, linha, preco, badge estoque, switch ativo, botoes editar/excluir.
- Imagem: extrair primeira URL do campo images (jsonb — pode ser array de strings ou array de objetos).

### 5. `src/components/products/ProductDialog.tsx`

Dialog shadcn (max-w-3xl) para criar/editar:
- Form em grid 2 colunas
- Campos: SKU (disabled em edicao), Nome, Linha, Material, Preco Site, Estoque, Dimensoes (tratado como texto para o usuario, convertido para jsonb), Descricao Curta, Descricao Completa, Imagens (textarea URLs por linha), Sugestoes de Uso, Diferenciais, Link Site, Link Marketplace (campo simples texto — o jsonb sera tratado internamente), Ativo (switch)
- Validacao: SKU e Nome obrigatorios
- Ao salvar: insert/update no Supabase + toast + fechar + invalidar cache

### 6. Paginas atualizadas

**`src/pages/Products.tsx`** (reescrever):
- Composicao: PageHeader + ProductToolbar + ProductTable ou ProductCards (conforme toggle)
- Estado local: viewMode, search, filters, sortColumn, sortDirection
- Estado para dialog criar/editar (open + produto selecionado)
- Estado para ConfirmDialog de exclusao

**`src/pages/ProductDetail.tsx`** (reescrever):
- Pagina full-width de edicao
- Botao "Voltar para produtos" no topo
- Carrega produto por id com useProduct
- Form identico ao dialog mas inline na pagina
- Botoes Cancelar (navega para /products) + Atualizar

## Detalhes Tecnicos

**Campo `price_marketplace` (jsonb):** No banco e jsonb, nao numeric. No formulario sera exibido como campo texto simples. Ao salvar, se o usuario digitar um numero, sera armazenado como `{"default": valor}`. Ao exibir, tentar extrair um valor numerico do jsonb.

**Campo `dimensions` (jsonb):** Similar — exibido como texto no formulario. Ao salvar como `{"raw": texto}`. Ao exibir, mostrar como string.

**Campo `images` (jsonb):** Textarea com URLs por linha. Ao salvar, converter para array de strings `["url1", "url2"]`. Ao carregar, converter jsonb para array e juntar com newlines.

**Campo `marketplace_links` (jsonb):** Campo texto simples. Salvar como `{"url": texto}`.

**Ordenacao:** Estado local no componente Products (sortColumn + sortDirection "asc"/"desc"). Passado como .order() na query Supabase.

**Toggle tabela/cards:** Estado local, nao persistido (localStorage seria ideal mas nao essencial).

## Componentes Reutilizados

- `PageHeader` — titulo + botao adicionar
- `SearchBar` — busca com debounce
- `LoadingState` — skeleton para tabela e cards
- `EmptyState` — quando nao ha produtos
- `ConfirmDialog` — confirmacao de exclusao
- `formatCurrency` — precos em BRL

## Ordem de Implementacao

1. `src/hooks/useProducts.ts`
2. `src/components/products/ProductDialog.tsx`
3. `src/components/products/ProductTable.tsx`
4. `src/components/products/ProductCards.tsx`
5. `src/components/products/ProductToolbar.tsx`
6. `src/pages/Products.tsx` (reescrever)
7. `src/pages/ProductDetail.tsx` (reescrever)
