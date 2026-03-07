

# Corrigir espaço vazio na esteira de logos

## Problema
Com apenas 4 logos e 2 cópias, o conjunto total não é largo o suficiente para preencher a tela inteira. Quando a animação translada -50%, o segundo grupo não cobre todo o viewport, deixando espaço vazio à direita.

## Solução
1. **Aumentar o número de cópias** de 2 para 4 (ou mais), garantindo que o conteúdo total seja sempre maior que 2x a largura da tela.
2. **Ajustar a animação**: manter `translateX(-50%)` no keyframe, pois com duplicação par (4 cópias = 2 conjuntos idênticos), metade do conteúdo é sempre visível.
3. **Garantir `min-width: max-content`** no container animado para que o flex não comprima os itens.

### Alterações em `src/components/landing/LogoMarquee.tsx`:
- Mudar `[0, 1].map(...)` para `[0, 1, 2, 3].map(...)` — 4 repetições do grupo de logos
- Adicionar `min-w-max` ou `w-max` ao div animado para forçar largura total sem colapso

Isso garante que a esteira sempre tenha logos suficientes para cobrir a tela em qualquer resolução.

