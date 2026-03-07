

# Usar logo enviado como logotipo padrão do sistema

## Problema
O cabeçalho da sidebar usa apenas texto estilizado. O usuário quer usar a imagem do logo enviada (que mostra "canggu.ai" com ícone do baiacu em branco/terracota sobre fundo transparente).

## Solução

1. **Salvar o asset**: Copiar `user-uploads://ChatGPT_Image_6_03_2026_19_18_46-2.png` para `src/assets/canggu-logo.png` (substituir o existente)

2. **`src/components/layout/AppSidebar.tsx`**:
   - Importar o logo: `import cangguLogo from '@/assets/canggu-logo.png'`
   - Substituir os spans de texto por `<img src={cangguLogo} alt="Canggu.ai" className="h-8" />` — usar apenas `h-8` (sem `w-8`) para que a largura seja proporcional e o logo apareça inteiro

3. **`src/pages/Login.tsx`**: Também usar o logo importado acima do formulário, com tamanho maior (`h-12` ou `h-16`)

