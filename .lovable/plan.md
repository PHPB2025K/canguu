

# Aplicar logo Canggu.ai em todo o projeto

## Situacao atual

O logo atual em `src/assets/canggu-logo.png` tem elementos muito claros (baiacu cinza claro + "Canggu" quase branco + ".ai" vermelho) — funciona sobre fundos escuros mas e quase invisivel sobre fundos claros.

Todos os 4 pontos ja importam `@/assets/canggu-logo.png` via Vite. O novo logo anexado sera salvo como esse mesmo asset.

## Estrategia de legibilidade

O novo logo tem fundo preto. Seguindo a tabela do prompt:

| Local | Fundo | Solucao |
|-------|-------|---------|
| Sidebar | #004D4D (escuro) | Logo imagem, h-8 |
| Footer landing | #132525 (escuro) | Logo imagem, h-8 |
| Navbar landing | Transparente / branco | Fallback texto sempre |
| Login | Fundo claro | Fallback texto, h-10 |

## Alteracoes

### 1. `src/assets/canggu-logo.png`
- Substituir pelo arquivo anexado (`user-uploads://Design_sem_nome_-_2026-03-06T215025.918.png`)

### 2. `src/components/layout/AppSidebar.tsx`
- Manter `<img>` do logo, ajustar classe para `h-8` (de h-14)

### 3. `src/components/landing/LandingFooter.tsx`
- Importar logo de `@/assets/canggu-logo.png`
- Substituir o `<p>` com texto "Canggu.ai" por `<img src={logo} className="h-8" />`
- Manter o subtitulo abaixo

### 4. `src/components/landing/LandingNavbar.tsx`
- Remover uso do `<img>` logo
- Usar fallback texto em ambos os estados (transparente e scrolled): `<span className="font-['Plus_Jakarta_Sans'] font-extrabold text-xl"><span className="text-primary">Canggu</span><span className="text-accent">.ai</span></span>`

### 5. `src/pages/Login.tsx`
- Substituir `<img>` por fallback texto centralizado, h-10 equivalente (text-3xl ou text-4xl)
- Manter "Painel de Gestao" abaixo

## Nenhuma outra alteracao
Nenhuma funcionalidade, layout ou logica sera modificada.

