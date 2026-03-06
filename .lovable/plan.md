

# Corrigir scroll da lista de perguntas

## Problema
O `ScrollArea` na lista de perguntas tem `max-h-[calc(100vh-380px)]` que pode estar cortando conteúdo, especialmente quando cards são expandidos. O valor fixo de 380px pode não acomodar todos os cenários.

## Solução
Remover o `max-h` fixo do `ScrollArea` e deixar a lista renderizar naturalmente dentro do fluxo da página, permitindo que o scroll nativo da página funcione. Alternativamente, trocar para uma altura que garanta visibilidade total — mas o mais simples e funcional é remover o `ScrollArea` com `max-h` e deixar os cards fluírem normalmente.

### Alteração em `src/components/marketplaces/QuestionsTab.tsx` (linha 114)
- Remover o wrapper `ScrollArea` com `max-h` restritivo
- Manter apenas o `div` com `space-y-3` para que todos os cards sejam visíveis via scroll nativo da página

