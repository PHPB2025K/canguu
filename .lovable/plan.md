

# Fix: Logo na Sidebar

## Problema
O `canggu-logo.png` contém o ícone do baiacu + wordmark, mas está sendo renderizado em `h-8 w-8` (32x32px), cortando o ícone. O usuário quer exibir apenas o texto "Canggu.ai" sem o ícone/imagem.

## Solução

**`src/components/layout/AppSidebar.tsx`** (linha 37):
- Remover o `<img src={cangguLogo}>` completamente
- Manter apenas os spans de texto: "Canggu" (branco) + ".ai" (#C56A4A), Plus Jakarta Sans 800
- Pode remover o import do `cangguLogo` também

Resultado: header da sidebar mostra apenas o texto estilizado "Canggu.ai" sem ícone.

