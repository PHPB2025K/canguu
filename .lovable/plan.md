

# Atualizar logo do sistema

## O que será feito
1. Substituir `src/assets/canggu-logo.png` pela nova imagem enviada (versão com ícone do baiacu + "Canggu.ai" em fundo claro/transparente)
2. Aumentar o tamanho do logo na sidebar de `h-12` para `h-14`
3. Aumentar o tamanho do logo na tela de login de `h-20` para `h-24`

## Arquivos alterados
- `src/assets/canggu-logo.png` — substituído pelo novo arquivo
- `src/components/layout/AppSidebar.tsx` — `className="h-12"` → `className="h-14"`
- `src/pages/Login.tsx` — `className="h-20"` → `className="h-24 mx-auto"`

