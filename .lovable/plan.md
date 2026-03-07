

# Rebranding: Budamix AI Agent → Canggu.ai

## Escopo

6 arquivos com referências à marca "Budamix AI Agent" na interface/meta tags. O placeholder "Assistente Budamix" em Settings é dado do cliente, mantém.

## Alterações

### 1. `index.html`
- `<title>` → "Canggu.ai — Dashboard"
- `meta description` → "Painel de Gestão - Canggu.ai"
- `meta author` → "Canggu"
- `og:title`, `twitter:title` → "Canggu.ai"
- `og:description`, `twitter:description` → "Painel de Gestão - Canggu.ai"

### 2. `src/hooks/usePageTitle.ts`
- `Budamix AI Agent` → `Canggu.ai` (ambas ocorrências)

### 3. `src/components/layout/AppLayout.tsx`
- Fallback title: `'Budamix AI Agent'` → `'Canggu.ai'`
- `document.title`: `Budamix AI Agent` → `Canggu.ai`

### 4. `src/components/layout/AppSidebar.tsx`
- Substituir `<span className="font-bold text-lg text-white">Budamix AI</span>` por dois spans: `<span style={{color:'#004D4D'}}>Canggu</span><span style={{color:'#C56A4A'}}>.ai</span>` com fonte Plus Jakarta Sans 800
- Nota: sidebar tem fundo teal escuro, então as cores #004D4D seriam invisíveis. Usar branco para "Canggu" e #C56A4A para ".ai" na sidebar (fundo escuro). As cores especificadas (#004D4D + #C56A4A) aplicam-se em fundo claro (login, etc.)

### 5. `src/pages/Login.tsx`
- `<h1>Budamix AI Agent</h1>` → split em `<span>Canggu</span>` (#004D4D) + `<span>.ai</span>` (#C56A4A), Plus Jakarta Sans 800

### 6. `src/pages/Settings.tsx` (linha 279)
- **NÃO ALTERAR** — placeholder "Assistente Budamix" é dado do cliente

### 7. Logo asset
- Copiar a imagem do logo enviada (`user-uploads://ChatGPT_Image_...png`) para `src/assets/canggu-logo.png`
- Usar como `<img>` na sidebar e login onde fizer sentido (o logo mostra "canggu.ai" com baiacu geométrico em fundo transparente — versão branca, ideal para sidebar escura)

### Fontes
- Adicionar import do Plus Jakarta Sans no `index.html` (já existe Inter, adicionar Jakarta)

