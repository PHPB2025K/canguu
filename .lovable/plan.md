

# Corrigir esteira de logos para ciclo contínuo infinito

## Problema
A esteira atual tem apenas 2 cópias dos logos em um único `div`, então quando a animação termina metade do percurso, há um "pulo" visível e momentos sem logos na tela.

## Solução
Usar a técnica clássica de marquee infinito: duas cópias idênticas do set de logos lado a lado, cada uma com `animate-[marquee_35s_linear_infinite]`, onde a animação translada de `0` a `-100%`. Quando a primeira cópia sai pela esquerda, a segunda (idêntica) ocupa seu lugar, criando a ilusão de loop contínuo.

### Alterações

**`src/components/landing/LogoMarquee.tsx`**:
- Renderizar **dois `div` filhos idênticos** (cada um com os 4 logos), ambos com a animação marquee
- Usar `flex shrink-0` em cada grupo para evitar compressão
- A animação `translateX(0) → translateX(-100%)` aplicada ao container pai faz o ciclo parecer infinito

**`src/index.css`** (keyframe `marquee`):
- Já está correto: `0% { translateX(0) } → 100% { translateX(-50%) }` — basta garantir que temos exatamente 2 cópias completas no container

Na prática, o fix principal é garantir que cada grupo de logos ocupe exatamente metade do container e que `min-width` não colapse os logos. Cada grupo terá `flex-shrink-0` e `min-width: fit-content`.

