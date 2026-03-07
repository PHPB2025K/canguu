

# Aumentar tamanho dos logos (Shopee, Mercado Livre, WhatsApp)

Adicionar uma propriedade `height` a cada logo no array e usar tamanhos individuais no `className`:

- **WhatsApp, Mercado Livre, Shopee**: de `h-16` para `h-32` (128px)
- **Amazon**: manter `h-16` (64px)

### Alteração em `src/components/landing/LogoMarquee.tsx`:
- Adicionar campo `height` ao array `logos` (ex: `{ name: "WhatsApp", src: whatsappLogo, height: "h-32" }`)
- Amazon fica com `height: "h-16"`
- No `<img>`, trocar `className="h-16 ..."` por template usando `logo.height`

