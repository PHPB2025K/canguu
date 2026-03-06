

# Quebrar mensagens do agente IA em chunks pelo marcador `\\`

## O que fazer

No componente `MessageBubble.tsx`, quando o `sender` for `"agent"`, dividir o `content` pelo marcador `\\` e renderizar cada parte como um bubble separado, empilhados verticalmente com um pequeno espaço entre eles — simulando como o cliente recebe no WhatsApp.

## Alterações

### `src/components/conversations/MessageBubble.tsx`
- Detectar se `message.sender === "agent"` e o conteúdo contém `\\`
- Se sim, fazer `content.split('\\\\')` para obter os chunks
- Renderizar cada chunk como um bubble individual (mesmo estilo do agente), empilhados com `gap` pequeno
- O horário e tokens aparecem apenas no último chunk
- O ícone/label "Agente IA" aparece apenas no primeiro chunk

### Sem alterações em outros arquivos
A lógica fica isolada no componente de renderização.

