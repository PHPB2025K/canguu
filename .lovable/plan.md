

# Ajustar logos da esteira na Landing Page

## Alterações em `src/components/landing/LogoMarquee.tsx`

1. **Tamanho mobile**: Trocar o `style={{ height }}` fixo por classes Tailwind responsivas. Como os valores atuais são definidos via `heightPx` inline, vou converter para usar classes com breakpoints — `h-10 md:h-8` para os logos padrão (WhatsApp, Mercado Livre, Shopee) e proporcionalmente menor para Amazon.

   Na verdade, os tamanhos atuais são 120px e 72px (bem maiores que h-8). O pedido diz "h-10 md:h-8" mas os valores reais são muito maiores. Vou interpretar como: **aumentar os logos no mobile** mantendo o desktop atual. Aplicarei um scale maior no mobile via CSS ou ajustarei as alturas inline com media query approach.

   Abordagem mais simples: manter o `style={{ height }}` atual para desktop e adicionar uma classe CSS que aumenta no mobile. Ou trocar para classes Tailwind com valores custom.

   Melhor abordagem: adicionar `className` com `max-md:scale-125` para aumentar 25% no mobile, mantendo os valores desktop atuais.

   Alternativa mais limpa: usar CSS variables ou simplesmente aumentar o `heightPx` base e reduzir no desktop. Mas para manter simplicidade, vou usar `max-md:scale-[1.25]` no container dos logos mobile.

2. **Opacidade**: Alterar `opacity: 0.45` → `opacity: 0.6` no style inline dos `<img>`.

## Mudanças específicas

No `<img>`:
- Adicionar `max-md:scale-125` à className para logos maiores no mobile
- Mudar `opacity: 0.45` para `opacity: 0.6` no style

Nenhuma outra seção será alterada. Animação, velocidade e layout permanecem intactos.

