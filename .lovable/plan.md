

# Corrigir esteira de logos — renderiza texto em vez de imagens

## Problema
A esteira na landing page mostra 7 nomes em texto (SUPABASE, CLAUDE AI, EVOLUTION API, N8N, WHATSAPP, MERCADO LIVRE, SHOPEE) em vez de 4 logotipos como imagens. Isso indica que:
1. Os arquivos PNG salvos podem estar vazios/corrompidos (as substituicoes anteriores podem nao ter gravado corretamente)
2. A versao em execucao pode estar usando um cache antigo do componente

## Solucao

### 1. Reescrever LogoMarquee.tsx com fallback robusto
- Manter os imports dos 4 PNGs (`whatsapp.png`, `mercadolivre.png`, `shopee.png`, `amazon.png`)
- Adicionar um timestamp/comentario para forcar rebuild do Vite
- Garantir que os `<img>` tenham dimensoes minimas e `onError` fallback

### 2. Re-copiar os 4 logos do upload do usuario
- `user-uploads://5.png` → `src/assets/logos/whatsapp.png`
- `user-uploads://3.png` → `src/assets/logos/mercadolivre.png`  
- `user-uploads://4.png` → `src/assets/logos/shopee.png`
- `user-uploads://2.png` → `src/assets/logos/amazon.png`

### 3. Atualizar a lista de logos
O screenshot mostra 7 itens mas o componente so tem 4. Preciso confirmar: a esteira deve ter apenas os 4 logos de plataformas de marketplace/comunicacao (WhatsApp, Mercado Livre, Shopee, Amazon), correto? Ou deve incluir tambem os logos de tecnologia (Supabase, Claude AI, Evolution API, N8N)?

### 4. Forcar rebuild
Fazer uma alteracao no componente (ex: adicionar `key` ou comentario com timestamp) para invalidar qualquer cache do Vite.

