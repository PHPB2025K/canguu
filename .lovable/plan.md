

# Mostrar MLB do anúncio junto ao nome do produto

## Alteração

### `src/components/marketplaces/QuestionCard.tsx` (linha 137)

Atualizar a exibição do nome do produto para incluir o `platform_item_id` (ex: MLB3343832496) ao lado do título:

```
Produto Nome Aqui  MLB3343832496
```

- Nome do produto em `font-medium`
- ID do anúncio (`platform_item_id`) em `text-muted-foreground` com tamanho menor, ao lado do nome

Nenhuma outra alteração necessária — o campo `platform_item_id` já existe no tipo `MarketplaceQuestion`.

