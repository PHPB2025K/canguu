# ANA — atendimento Mercado Livre em múltiplas contas

O webhook e a reconciliação periódica usam o mesmo caminho: confirmar vendedor da pergunta, carregar anúncio e conhecimento específico, gerar uma decisão com evidências, publicar e consultar novamente a resposta antes de registrar sucesso. `process-ml-question` é legado e não participa desse fluxo.

## Escopo e fontes

- A chave do conhecimento é `(seller_id, item_id)`; SKU, identificadores de variação e atributos vêm do anúncio. O vínculo com `products` exige correspondência determinística. Conflitos ficam sem vínculo; o anúncio continua utilizável.
- Informações estáveis ficam em `ml_listing_knowledge`. Atualização por versão do anúncio, com revisão diária da descrição. O conteúdo é comparado por hash; não há chamadas ao modelo na sincronização.
- Preço de venda usa `/items/{id}/sale_price?context=channel_marketplace` quando solicitado. Estoque e disponibilidade por variação vêm da API atual e são revalidados antes da publicação. O estoque agregado do catálogo interno não determina disponibilidade no anúncio.
- O modelo recebe somente o anúncio e trechos pertinentes à pergunta, além de orientações do canal. Correções são limitadas ao mesmo vendedor e anúncio. Divergências ou evidências ausentes devem produzir decisão `human`. Uma trava determinística impede confirmar material/aquecimento quando título indica alumínio e atributo indica porcelana/cerâmica, contradição observada em anúncio real.
- Evidência literal, números e regras do canal são validados antes do envio. Isso reduz erros; não substitui a correção dos dados de origem.

## Autorização e credenciais

`ml-webhook` precisa aceitar notificações públicas. Toda ação administrativa, entretanto, exige autenticação. `dry_run`, `manual_answer`, `assign_handoff` e `resolve_handoff` aceitam usuário autenticado da Canggu. `sync_account`, `sync_listing` e `reconcile` exigem credencial de serviço validada.

ML1 conserva o OAuth Canggu. A renovação possui exclusão mútua entre webhook e `ml-oauth`. ML2/ML3 reutilizam apenas o acesso de curta duração da integração operacional existente; o processo que já renova suas credenciais continua sendo o único dono dos refresh tokens. Não copiar nem renovar refresh tokens no conector ANA.

## Processamento e atendimento humano

`ml_work_leases` e `claim_ml_work` impedem trabalho simultâneo duplicado. A sugestão é salva antes de publicar. Falha de publicação pode ser repetida; quando o contexto não mudou, a sugestão é reutilizada sem uma segunda geração. Após três falhas, encaminhar para a fila humana.

A Canggu só apresenta envio confirmado depois de reler a resposta no ML. Uma resposta feita diretamente no ML também é conciliada, com autoria `marketplace_verified`. Pendências aparecem como **Atendimento humano** no painel, identificadas por conta.

**Acolhimento obrigatório, decisão do Pedro em 09/10/2026:** toda escalada de pergunta aberta publica primeiro um texto controlado de acolhimento na conta/anúncio corretos. O ML permite uma única resposta por pergunta, sem alteração posterior ([orientação oficial](https://vendedores.mercadolivre.com.br/aprender/nota/responda-a-todas-as-perguntas-e-conclua-a-transacao-de-forma-mais-rapida?guideKeyId=GE70)). Portanto, não prometer retorno na mesma pergunta: dúvidas de produto orientam nova pergunta no anúncio; casos de pedido orientam a aba de mensagens da compra no próprio ML.

O acolhimento confirmado tem autoria `ai_handoff` e **mantém `status=pending`**. Os dados em `ai_classification.handoff` registram motivo, texto, tentativas, confirmação, notificação e resolução humana. A ação autenticada `resolve_handoff` exige nota da equipe com confirmação/fonte/ação; não publica uma segunda mensagem. A equipe deve corrigir a fonte do produto/anúncio quando necessário. A nota interna não é automaticamente transformada em característica do produto.

Travas separadas `handoff:` e `handoff-escalation:` evitam duplicar a resposta e o registro na fila. Confirmação por leitura remota também cobre timeout depois de envio bem-sucedido. Falha do acolhimento continua em novas tentativas, com espera limitada a 30 minutos, sem abandono após três tentativas e sem nova geração de IA. O registro no módulo **Escalonamentos** vem depois da tentativa pública e mostra se o acolhimento foi confirmado. Falha de gravação é repetida independentemente do prazo da próxima tentativa de acolhimento. Se o ML demonstrar que a pergunta foi encerrada/removida, registrar a impossibilidade e manter tratamento humano; nunca fabricar confirmação.

Perguntas que já receberam acolhimento têm somente **Registrar resolução interna** no painel. O filtro **Pendentes de atendimento** inclui essa fila. A conciliação automática não encerra um caso humano só porque o ML passou a apresentar `ANSWERED`.

## Escalonamentos para Yasmin (decisão de 09/10/2026)

Usar o módulo já existente **Canggu → Escalonamentos**. Não automatizar continuidade em chat de pedido. O webhook também não envia mais aviso de caso humano ao Telegram; permanecem somente alertas técnicos do monitor operacional.

Uma pergunta ML tem no máximo um registro em `escalations`, vinculado por `marketplace_question_id` (FK única). `conversation_id` fica nulo para ML; os outros canais continuam com suas conversas. O cartão mostra conta, assunto, anúncio, ID/texto da pergunta, motivo, acolhimento e referência de pedido. A equipe pode assumir e resolver. Resolver atualiza a pergunta e o escalonamento numa única transação, sem mensagens públicas ou privadas e sem reabrir conversa de outro canal. RPCs de criação e resolução são exclusivas do serviço; o painel usa a função autenticada. A resolução fica bloqueada enquanto o acolhimento estiver pendente (salvo impossibilidade comprovada pelo ML).

Perguntas não trazem automaticamente um pedido. Consulta de pedidos só ocorre diante de relato de compra ou número explícito, sem usar IA:

- Número explícito: validar vendedor, comprador, anúncio e data na API antes de marcar confirmado.
- Sem número: buscar pedidos do mesmo comprador/vendedor (até 50 resultados), conferir anúncio e data. Resultado único é **candidato, vínculo a confirmar**, não associação comprovada.
- Resultado múltiplo/parcial, API indisponível ou falta de identificação: explicitar no cartão para conferência humana. Pré-venda fica **sem pedido vinculado à pergunta**.
- Nenhuma consulta de chat ou envio de mensagem de pós-venda. ID da pergunta nunca vira número do pedido.

Não há consumo adicional de tokens nessa etapa. A consulta de pedidos é feita uma vez por criação de caso, com chamadas de leitura e registro estruturado.

## Rotinas na VPS

- `ana-ml-bridge.py`: a cada 2 minutos, importa acessos ML2/ML3 e reconcilia as três contas. ML1 preserva a notificação imediata; o conector aguarda pelo menos 60 segundos antes de recuperá-la. Limite de cinco perguntas por conta/ciclo.
- `ana-ml-bridge.py --catalog`: diariamente às 05:17, horário local São Paulo. Compara alterações e mantém checkpoints por item; também revisita dados com mais de 24 horas. Novos anúncios são carregados sob demanda ao chegar a primeira pergunta.
- `ana-ml-monitor.py`: substitui o monitor de perguntas existente, no mesmo agendamento de 10 minutos. Verifica saúde do conector, acesso real às contas, perguntas aguardando mais de 15 minutos, acolhimento ou registro em Escalonamentos não confirmado após 5 minutos. A fila humana já registrada não gera lembrete após 15 minutos; Yasmin a consulta diariamente. HTTP com erro nunca é considerado fila vazia. Reutiliza o destino operacional de alertas já configurado.
- Estado e checkpoints ficam na pasta privada de estado `ana-ml` da VPS. Backups do monitor e crontab são preservados antes de substituição.
- Limite atual da listagem de catálogo: 1.000 anúncios ativos por conta. Ao alcançá-lo, o job sinaliza erro explícito; migrar a enumeração para scan antes de ampliar acima desse volume.

## Validação

```sh
npx -y deno test --no-config supabase/functions/_shared/ml-support.test.ts supabase/functions/_shared/ml-escalation.test.ts
npx -y deno check --no-config supabase/functions/ml-webhook/index.ts supabase/functions/ml-oauth/index.ts
npm test -- --run
npm run build
```

A suíte cobre roteamento e envio nas três contas com API simulada, leitura de confirmação, concorrência, propriedade do anúncio/pergunta, encaminhamento humano, modo sem publicação, reutilização após falha e conciliação de resposta humana. Os ensaios autenticados `dry_run` consultam API e modelo reais sem enviar respostas públicas.

Para conferir uma execução real, verificar `platform_question_id`, `seller_id`, `answer_text`, autoria e uso de tokens; confirmar também a resposta na API do ML. Não criar perguntas públicas falsas nem reenviar respostas existentes para obter evidência.

## Publicação e recuperação

Aplicar a migração aditiva antes das funções. Publicar somente `ml-webhook` e `ml-oauth`, preservando os controles de autenticação de cada uma. O painel precisa da mudança de `useAnswerQuestion` para enviar de verdade e confirmar o resultado. O resolvedor de dependências do CI evita que um novo helper ML publique todos os outros canais.

Antes de qualquer retorno de versão: suspender as duas linhas identificadas `ANA-ML managed` no crontab, restaurar monitor e funções a partir dos backups privados da operação e usar o rollback Vercel registrado no relatório interno. Não apagar tabelas nem histórico para desfazer código. A versão anterior do webhook só selecionava um token; manter a correção mínima de seleção por vendedor mesmo em rollback. Nunca publicar o repositório inteiro sobre funções que sofreram mudanças diretamente em produção.
