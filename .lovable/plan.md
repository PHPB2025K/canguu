

# Atualizar logo do sistema

## O que será feito
1. **Substituir o asset** `src/assets/canggu-logo.png` pela nova imagem enviada
2. **Aumentar o tamanho** do logo na sidebar de `h-8` para `h-12`
3. **Aumentar o tamanho** do logo na tela de login de `h-14` para `h-20`

## Arquivos alterados
- `src/assets/canggu-logo.png` — substituído pelo novo arquivo
- `src/components/layout/AppSidebar.tsx` — linha 37: `className="h-8"` → `className="h-12"`
- `src/pages/Login.tsx` — linha com o logo: `className="h-14"` → `className="h-20 mx-auto"`

