

# Aumentar tamanho do logo em todos os pontos

## Alteracoes

| Arquivo | Atual | Novo |
|---------|-------|------|
| `src/components/layout/AppSidebar.tsx` (linha 37) | `h-8` | `h-14` |
| `src/components/landing/LandingFooter.tsx` (linha 9) | `h-8` | `h-14` |
| `src/components/landing/LandingNavbar.tsx` (linha 28) | `text-xl` | `text-3xl` |
| `src/pages/Login.tsx` (linha 51) | `text-4xl` | `text-5xl` |

Os dois pontos que usam imagem (sidebar e footer) vao de `h-8` (32px) para `h-14` (56px). Os dois pontos que usam fallback texto (navbar e login) aumentam proporcionalmente.

