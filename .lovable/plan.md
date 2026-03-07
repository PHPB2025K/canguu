

# Landing Page Canggu.ai — Plano de Implementacao

## Resumo
Criar uma landing page publica premium na rota `/`, com layout independente (sem sidebar/header do dashboard), seguindo o design system existente. 14 arquivos criados, 2 modificados.

## Arquivos

### Modificados

1. **`src/App.tsx`** — Substituir `Navigate to="/dashboard"` por `<LandingPage />` na rota `/`
2. **`index.html`** — Atualizar meta tags (title, description, og tags)

### Criados

3. **`src/hooks/useInView.ts`** — Hook reutilizavel com Intersection Observer (ref + threshold -> boolean `inView`)

4. **`src/pages/LandingPage.tsx`** — Componente principal que importa e renderiza todas as secoes em sequencia, com `scroll-behavior: smooth` via useEffect no html element

5. **`src/components/landing/LandingNavbar.tsx`** — Navbar sticky propria:
   - Transparente no topo, bg-white + shadow ao scroll > 50px
   - Logo com imagem importada de `@/assets/canggu-logo.png`
   - Links ancora centrais (Funcionalidades, Integracoes, Como Funciona) — hidden mobile
   - Botao "Acessar Plataforma" `<Link to="/login">` rounded-full
   - Hamburger mobile com dropdown

6. **`src/components/landing/HeroSection.tsx`** — Badge animado (Sparkles pulse), H1 com "qualquer" em accent, subtitulo, 2 CTAs, badge credibilidade, screenshot mockup com frame de browser + perspectiva 3D + fade-in animado

7. **`src/components/landing/LogoMarquee.tsx`** — Esteira infinita com 8 wordmarks monocromaticos (WhatsApp, ML, Shopee, Amazon, Supabase, Claude AI, Evolution API, N8N), CSS keyframes marquee, mask-image fade nas bordas

8. **`src/components/landing/FeaturesSection.tsx`** — 6 feature cards em grid 3/2/1 cols, icones lucide em circulos coloridos, hover elevacao, stagger fade-in via useInView

9. **`src/components/landing/ScreenshotSection.tsx`** — Frame de browser flat, fundo decorativo blur, 3 highlights (Zap, Sparkles, Link)

10. **`src/components/landing/HowItWorksSection.tsx`** — 3 cards com numeros grandes translucidos, icones, linha tracejada SVG entre cards (desktop only)

11. **`src/components/landing/IntegrationsSection.tsx`** — 5 cards (WhatsApp, ML, Shopee, Amazon, Supabase) grid 5/3/2 cols, hover borda colorida, badges "Ativo"

12. **`src/components/landing/MetricsSection.tsx`** — Secao dark gradient, 4 metricas com counter animado (requestAnimationFrame ao entrar viewport), separadores verticais desktop

13. **`src/components/landing/TechStackSection.tsx`** — Badges pill com 5 tecnologias

14. **`src/components/landing/CTASection.tsx`** — Card centralizado com badge, titulo, botao grande `<Link to="/login">`

15. **`src/components/landing/LandingFooter.tsx`** — Footer escuro 3 colunas, logo texto, links, copyright

## Notas tecnicas

- Todas as cores via variaveis CSS existentes (`hsl(var(--primary))`, etc.) — nenhuma variavel nova
- Fontes ja importadas no projeto — sem duplicacao
- Animacoes: CSS keyframes para marquee e pulse; Intersection Observer + useInView para fade-in/stagger/counters
- Logo importado de `@/assets/canggu-logo.png` na navbar
- Nenhum arquivo existente do dashboard sera alterado alem de App.tsx e index.html

