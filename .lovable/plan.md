

# Corrigir esteira de logos — LogoMarquee.tsx

## Diagnostico

O componente `LogoMarquee.tsx` ja tem o codigo correto com imports de imagem, array de 4 logos, e rendering via `<img>`. O problema e que os arquivos de imagem em `src/assets/logos/` precisam ser substituidos pelos novos uploads anexados.

## Alteracoes

### 1. Substituir os 4 arquivos de imagem
Copiar os uploads para `src/assets/logos/`, sobrescrevendo os existentes:
- `user-uploads://src_assets_logos_whatsapp.png` → `src/assets/logos/whatsapp.png`
- `user-uploads://src_assets_logos_mercadolivre.png` → `src/assets/logos/mercadolivre.png`
- `user-uploads://src_assets_logos_shopee.png` → `src/assets/logos/shopee.png`
- `user-uploads://src_assets_logos_amazon.png` → `src/assets/logos/amazon.png`

### 2. Nenhuma alteracao de codigo necessaria
O `LogoMarquee.tsx` ja esta correto. O `index.css` ja tem o keyframe `marquee`.

