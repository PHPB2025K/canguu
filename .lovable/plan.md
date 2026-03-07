

# Fix: Logo no cabeçalho da Sidebar

## Problema
O logo está referenciado como `src="/src/assets/canggu-logo.png"` — caminho absoluto do filesystem que não funciona no Vite (funciona apenas em dev em alguns casos, falha em build/preview).

## Solução

**`src/components/layout/AppSidebar.tsx`**:
- Adicionar `import cangguLogo from '@/assets/canggu-logo.png'` no topo
- Trocar `src="/src/assets/canggu-logo.png"` por `src={cangguLogo}`
- Isso permite ao Vite processar o asset corretamente com hash no build

Mesma correção se existir referência similar em `Login.tsx`.

