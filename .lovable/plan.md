

# Aplicar logotipo no topo da Sidebar do Dashboard

## Alteração

**`src/components/layout/AppSidebar.tsx`**:
- Substituir `import cangguLogo from '@/assets/canggu-logo.png'` por `import logoDark from '@/assets/canggu-logo-dark.png'`
- Atualizar o `<img>` no topo da sidebar: `src={logoDark}`, `className="h-8 w-auto"` (atualmente `h-14`)
- Manter o `<div className="p-6">` existente para espaçamento

Nenhuma outra alteração no projeto.

