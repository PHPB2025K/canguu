

# Aplicar logotipos na Landing Page e Login

## Alterações

1. **Copiar assets**: Salvar os 2 arquivos enviados em `src/assets/canggu-logo-light.png` e `src/assets/canggu-logo-dark.png`

2. **`src/components/landing/LandingNavbar.tsx`**: Importar `canggu-logo-light.png`, substituir o `<span>` com texto "Canggu.ai" por `<img src={logoLight} alt="Canggu.ai" className="h-8 w-auto" />`

3. **`src/pages/Login.tsx`**: Importar `canggu-logo-light.png`, substituir o `<p>` com texto estilizado por `<img src={logoLight} alt="Canggu.ai" className="h-10 w-auto mx-auto" />`, manter subtítulo "Painel de Gestão"

4. **`src/components/landing/LandingFooter.tsx`**: Importar `canggu-logo-dark.png`, substituir o import e uso do logo atual (`canggu-logo.png`) pelo novo `canggu-logo-dark.png` com `className="h-8 w-auto"`, manter subtítulo

Nenhuma alteração de layout, espaçamento ou outros componentes.

