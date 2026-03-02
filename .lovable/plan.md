

# Adicionar Claude Opus 4.6 e Claude Sonnet 4.6 aos Modelos

## Alteracao

**Arquivo:** `src/pages/Settings.tsx`

Atualizar o array `LLM_MODELS` para incluir os dois novos modelos com os Model IDs corretos conforme a documentacao da Anthropic mostrada na imagem:

| Modelo | Model ID (value) | Label |
|--------|-------------------|-------|
| Claude Opus 4.6 | `claude-opus-4-6` | Claude Opus 4.6 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Claude Sonnet 4.6 |

Array atualizado (ordem por capacidade):
```
gpt-4o-mini, gpt-4o, gpt-4-turbo, claude-opus-4-6, claude-sonnet-4-6, claude-sonnet-4-20250514, claude-haiku-4-20250414
```

Apenas 2 linhas adicionadas ao array existente. Nenhuma outra alteracao necessaria.

