

# Substituir logos da esteira — LogoMarquee

## Diagnóstico
O código do `LogoMarquee.tsx` já está correto — usa `<img>` com imports ES6. O problema são os arquivos de imagem que precisam ser substituídos pelos novos uploads otimizados.

## Alterações

### 1. Copiar os 4 logos otimizados para `src/assets/logos/`
- `user-uploads://5.png` → `src/assets/logos/whatsapp.png`
- `user-uploads://3.png` → `src/assets/logos/mercadolivre.png`
- `user-uploads://4.png` → `src/assets/logos/shopee.png`
- `user-uploads://2.png` → `src/assets/logos/amazon.png`

### 2. Nenhuma alteração de código
O componente `LogoMarquee.tsx` já está implementado corretamente.

