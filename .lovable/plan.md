

# Atualizar esteira de logos na Landing Page

## Alteracoes

### 1. Copiar 4 logos para `src/assets/logos/`
- `user-uploads://ChatGPT_Image_6_03_2026_22_19_37.png` → `src/assets/logos/whatsapp.png`
- `user-uploads://ChatGPT_Image_6_03_2026_22_22_37.png` → `src/assets/logos/mercadolivre.png`
- `user-uploads://ChatGPT_Image_6_03_2026_22_21_01.png` → `src/assets/logos/shopee.png`
- `user-uploads://ChatGPT_Image_6_03_2026_22_16_33.png` → `src/assets/logos/amazon.png`

### 2. `src/components/landing/LogoMarquee.tsx`
- Import os 4 logos como modulos ES6
- Reduzir array de 8 wordmarks texto para 4 objetos `{ name, src }`
- Substituir `<span>` por `<img src={logo.src} alt={logo.name} className="h-8 w-auto select-none" style={{ filter: "grayscale(100%)", opacity: 0.45 }} />`
- Manter duplicacao `[...logos, ...logos].map(...)` para loop seamless
- Manter gap-20 (80px), animacao marquee, mask-image, titulo, padding — tudo inalterado

