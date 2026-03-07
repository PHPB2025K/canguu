

# Forçar tamanho grande nos logos da esteira

## Problema
Os logos já têm `h-32` no código, mas continuam aparecendo pequenos na tela. Provavelmente as imagens PNG originais são pequenas e o `w-auto` limita a renderização ao tamanho nativo da imagem, ignorando o `h-32`.

## Solução
Trocar as classes Tailwind por **inline styles com `height` e `minHeight`** para forçar o redimensionamento, e garantir que as imagens escalem corretamente:

**`src/components/landing/LogoMarquee.tsx`**:
- WhatsApp, Mercado Livre, Shopee: `style={{ height: "120px" }}` (em vez de classe `h-32`)
- Amazon: `style={{ height: "48px" }}`
- Adicionar `object-contain` para manter proporção ao escalar acima do tamanho nativo

Isso força o navegador a escalar as imagens independentemente da resolução original dos PNGs.

