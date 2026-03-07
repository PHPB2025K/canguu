

# Permitir swipe manual na esteira de logos no mobile

## Problema
A esteira de logos usa `overflow-hidden` e animação automática. No mobile, o usuário não consegue arrastar/deslizar para ver os logos mais rápido.

## Solução
No mobile, adicionar `overflow-x-auto` ao container da esteira (substituindo `overflow-hidden`), permitindo scroll horizontal por toque. No desktop, manter `overflow-hidden` como está.

### Alterações em `src/components/landing/LogoMarquee.tsx`

1. Trocar a classe da `<section>` de `overflow-hidden` para `overflow-hidden md:overflow-hidden max-md:overflow-x-auto`
2. Na div com mask, adicionar `max-md:overflow-x-auto` e permitir touch scroll
3. A animação continua rodando normalmente — o usuário pode interromper arrastando no mobile

Concretamente, no container externo (div com mask):
- Adicionar `max-md:overflow-x-auto max-md:touch-pan-x` para permitir scroll por toque no mobile
- Mover `overflow-hidden` da section para apenas `md:overflow-hidden`, e no mobile usar `overflow-x-auto`

A animação marquee continuará rodando, mas o scroll manual será possível no mobile graças ao overflow visível.

