# DIAGNÓSTICO ANA — Ana muda em escalações

> Documento criado em 22/05/2026 durante operação de diagnóstico forense em sequência ao caso da cliente Carolina Michelsen (não respondida em 21/05 23:17–23:56 BRT, 12 mensagens sem follow-up).

## TL;DR

**Toda conversa que o classifier marca `should_escalate=true` fica MUDA**, mesmo após o fix de ontem (X-Internal-Token + verify_jwt=false em process-message).

O fix de ontem destravou apenas o caminho `webhook-whatsapp → process-message`. Mas `process-message → escalate` (invocação interna ainda usa `Bearer SERVICE_ROLE_KEY`) continua quebrado pelo mesmo motivo: JWT desalinhado, `escalate` rejeita com 401.

Resultado prático: conversa normal (pergunta de produto) → Ana responde. Conversa de reclamação séria (pedido de estorno, ironia, raiva) → Ana fica em silêncio.

## Escopo do bug

Query Supabase nas últimas 48h, conversas com `customer_msgs > 0` e `llm_replies = 0`:

```
Carolina Michelsen | 555185367365 | source=whatsapp | 12 msgs cliente / 0 LLM | 21/05 23:56 BRT
Edneia Cunha       | 5511945674062| source=null     | 10 msgs cliente / 0 LLM | 21/05 15:18 BRT
```

A Edneia é o caso original (antes do fix de ontem). A **Carolina ocorreu DEPOIS do fix de ontem** (~7h após o deploy do `webhook-whatsapp` v36 + `process-message` v42), e é o caso que prova que o bug NÃO foi totalmente resolvido.

## Reprodução do caso Carolina — pipeline rastreado

### Mensagens no banco (`messages` table, conv_id `da69473c-ad94-4efe-a1d8-c22bf907748a`)

```
23:17:15 — agent: welcome poll (origin_poll=true, hardcoded)
23:17:15 — cliente: "Boa noite. Estou mandando mensagem agora..."
23:17:31 — cliente: "5" (responde Outro)
23:18:06 — cliente: "Ou seja, de 12 canecas, só irei aproveitar 7..."
23:18:24 — cliente: [imagem caneca verde-água]
23:18:32 — cliente: [imagem caneca preta]
23:18:38 — cliente: [imagem 2 canecas brancas]
23:18:45 — cliente: [imagem 2 canecas brancas]
23:18:52 — cliente: [imagem utensílio]
23:19:12 — cliente: "Quero o estorno referente ao valor de 5 canecas."
23:53:52 — cliente: "Como uma empresa tem coragem de vender produtos remendados?????"
23:53:59 — cliente: "Eu tô chocada."
23:56:48 — cliente: [imagem] "Olhem isso aqui!"
```

ZERO mensagens com `sender='agent' AND tokens_used IS NOT NULL`. Apenas o welcome poll hardcoded.

### Logs do edge function (Supabase, últimas 24h, eventos relevantes da Carolina)

```
23:14:13 BRT — webhook-whatsapp v36 POST 200 (23.2s)   ← debounce + processo
23:14:22 BRT — webhook-whatsapp v36 POST 200 (23.9s)
23:14:29 BRT — process-message v42 POST 200 (6.9s)     ← LLM rodou
23:14:29 BRT — escalate v15       POST 401 (156ms)     ← FALHOU

23:17:11 BRT — webhook-whatsapp v36 POST 200 (27.7s)
23:17:17 BRT — process-message v42 POST 200 (5.7s)     ← LLM rodou
23:17:17 BRT — escalate v15       POST 401 (74ms)      ← FALHOU
```

Padrão: **toda invocação de `process-message` (200, ~6s, LLM completou) é PAREADA com invocação de `escalate` retornando 401**. Os timestamps batem ms a ms.

### Estado de `escalations` no banco

```sql
SELECT * FROM escalations WHERE conversation_id = 'da69473c-ad94-4efe-a1d8-c22bf907748a';
-- 0 rows
```

Nem o record de escalation foi criado, porque a função `escalate` rejeitou no gateway antes do handler rodar.

## Causa raiz (código)

### Onde quebra

Arquivo `supabase/functions/process-message/index.ts`, linhas 310–356:

```typescript
const escalationCheck = checkEscalation(classification, context, config)

if (escalationCheck.shouldEscalate) {
  log('escalating', { reason: escalationCheck.reason })

  const escalationUrgency = calculateEscalationUrgency(...)

  // If we own dispatch (edge-function pipeline), invoke the full escalate
  // edge function: it creates the record, updates the conversation, sends
  // the standard transfer message to the customer and notifies Pedro.
  if (body.dispatch) {
    try {
      await dispatchEscalation({...})       // ← chama escalate via fetch
    } catch (err) {
      log('error', { step: 'dispatch_escalation', error: String(err) })
    }
  }

  // Return escalation data for legacy callers (N8N) to handle
  return jsonResponse({
    success: true,
    responseMessageId: null,          // ← nenhuma agent message salva
    responseText: null,
    ...
    escalated: true,
    ...
  })
}
```

Arquivo `supabase/functions/_shared/whatsapp-dispatch.ts`, linhas 144–164 (`dispatchEscalation`):

```typescript
const response = await fetch(`${supabaseUrl}/functions/v1/escalate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceRoleKey}`,   // ← mesmo JWT que ontem dava 401
    'Content-Type': 'application/json',
  },
  ...
})
```

Edge function `escalate` em produção: `verify_jwt=true`. O gateway do Supabase rejeita o JWT (mesma causa raiz exata que tivemos ontem com `process-message`), retorna 401 antes do handler rodar. Erro engolido pelo `try/catch` silencioso. `process-message` faz early return com `responseText: null`. Nenhuma agent message é salva. Conversation não muda pra `escalated`. Cliente fica muda.

### Por que conversa normal funciona

Pergunta tipo "Vocês têm pote de 1L?" → classifier NÃO marca `should_escalate=true` → `escalationCheck.shouldEscalate=false` → cai no STEP 9 → `generateResponse()` → salva agent message com tokens_used → `dispatchChunkedText()` envia via Evolution diretamente (não passa por edge function interna). ✅

### Por que reclamação grave fica muda

Pergunta tipo "Quero estorno" + "Como uma empresa tem coragem" → classifier marca `should_escalate=true` → cai no STEP 7 escalation → invoca `escalate` via Bearer JWT → 401 → erro silencioso → early return. ❌

## Outras dependências do mesmo problema

Grep em `canguu/supabase/functions/**`:

```
webhook-whatsapp/index.ts:512 → fetch /process-message  (já fixado X-Internal-Token)
_shared/whatsapp-dispatch.ts:159 → fetch /escalate       (BROKEN, MESMO BUG)
```

Apenas 2 chamadas inter-functions no codebase. A primeira já tem o bypass. A segunda não. **Esta é a única outra superfície afetada.**

## Estado de produção (snapshot 22/05 09:30 BRT)

| Function | Versão prod | verify_jwt | Status |
|----------|-------------|------------|--------|
| webhook-whatsapp | v36 | true | ✅ OK (manda X-Internal-Token pra process-message) |
| process-message | v42 | **false** | ✅ OK (valida X-Internal-Token no STEP 0) |
| escalate | v15 | **true** | 🔴 BUG — recebe Bearer JWT do dispatchEscalation, rejeita 401 |
| send-whatsapp | v16 | true | ⚠️ Não é invocado entre edge functions, é chamado pela Evolution direto — não afeta |
| outras (send-human, ml-*, etc) | — | true | ⚠️ Não são invocadas pelo pipeline da Ana — não afetam ESTE bug |

## Divergências de repo (constatadas no Passo 1)

- **Mac local** (`~/Documents/05-Projetos-Codigo/canguu`): HEAD `102f3b6` = origin/main. Mas tem `webhook-whatsapp/index.ts` e `process-message/index.ts` UNCOMMITTED (hotfix de ontem deployado via CLI direto, sem commit no git).
- **origin/main**: HEAD `102f3b6` — versão ANTES dos hotfixes de ontem.
- **VPS** (`/root/.openclaw/workspace/canguu`): HEAD `e48c681` (commit local não-pushed, só toca `supabase/.temp/cli-latest`). Arquivos `supabase/functions/` na VPS = versão antiga origin/main, SEM hotfixes.
- **Produção (Supabase Edge)**: hashes batem com Mac uncommitted (foi de lá que veio o deploy ontem).

## Risco no GitHub Actions

`.github/workflows/deploy-edge-functions.yml` faz `supabase functions deploy --project-ref` SEM `--no-verify-jwt` em nenhum passo. Se eu commitar e pushar agora o hotfix de `process-message` (que tem comentários `verify_jwt=false`) o GHA vai REDEPLOYAR e o CLI default vai jogar `verify_jwt=true` de novo, REVERTENDO o fix.

**Antes de commitar qualquer coisa em `supabase/functions/process-message/**` ou `supabase/functions/escalate/**`, o workflow precisa de fix pra passar `--no-verify-jwt` por function específica.**

## Plano de correção (Passo 5)

1. **`escalate/index.ts`**: adicionar STEP 0 que valida `X-Internal-Token` igual ao process-message.
2. **`_shared/whatsapp-dispatch.ts`**: na função `dispatchEscalation`, adicionar header `X-Internal-Token: ${INTERNAL_DISPATCH_TOKEN}` no fetch.
3. **`.github/workflows/deploy-edge-functions.yml`**: adicionar lista de functions que precisam de `--no-verify-jwt` no comando de deploy (ou passar a flag condicionalmente).
4. **Deploy**: escalate v16 com `--no-verify-jwt` via CLI direto (não via GHA). webhook-whatsapp v37 + process-message v43 só se necessário (provavelmente só o _shared muda, então redeploy de webhook-whatsapp basta pra ele puxar o helper atualizado).
5. **Validação Passo 6**: invocar process-message manualmente com `dispatch=false` pra simular a conv da Carolina e provar que o cérebro gera resposta + que o caminho de escalation completaria se dispatch estivesse ativo.

## Por que o teste do Kobe ontem funcionou e não pegou esse caso

Kobe perguntou "Vocês têm pote de vidro de 1L?" — pergunta de produto, classifier não marcou escalation, fluxo passou direto pelo STEP 9 (generate response) que não tem dependência de outra edge function. Ana respondeu normalmente.

O teste do Kobe **não exercitou o caminho de escalation**. Era o único caminho que ainda estava quebrado, e só foi exposto quando uma cliente real com reclamação grave (Carolina) chegou hoje.

## Lição

- Toda invocação interna entre edge functions via `Bearer SERVICE_ROLE_KEY` está cega no projeto `jpacmloqsfiebvagfomt` (causa raiz exata desconhecida, ver pendência de pós-mortem).
- O fix de ontem só destravou 1 das 2 invocações inter-functions. Faltou catalogar TODAS no momento do diagnóstico.
- Testes E2E precisam exercitar TODOS os caminhos: pergunta normal + escalation + áudio + imagem + burst de mensagens.

---

## Anexo — Bug bônus descoberto na validação E2E (22/05 11:20 BRT)

Durante o Teste 6 do roteiro de validação, o Kobe confirmou que a escalation
foi criada corretamente no banco, mas observou que **não validou visualmente
a notificação no WhatsApp pessoal do Pedro**. Pedro confirmou em seguida que
o número configurado em `agent_config.notification_phone = '5519992979490'`
**não é o WhatsApp pessoal dele** — é o número da própria instância da Ana
(Evolution Cloudfly).

Significa que, desde que o escalation flow foi escrito (provavelmente cutover
de 30/04 ou antes), TODAS as notificações de escalation que deveriam alertar
o owner estavam sendo enviadas pra própria Ana em um loop silencioso. Pedro
nunca recebeu uma única notificação de escalation desde que o pipeline ficou
de pé.

Por que ninguém notou antes:
- Bug do escalate (401 JWT) mascarava: 0 escalations registradas até hoje,
  então a notificação nunca chegava a ser tentada
- Pedro nunca viu mensagem chegando, mas como não havia tabela de log de
  envio outbound (Evolution.sendText não persiste), não havia evidência
- Quando o caso da Carolina chegou, a discussão foi pro caminho da Ana muda,
  não pro caminho da notificação

Fix aplicado em 22/05 11:20 BRT:

1. `UPDATE agent_config SET config_value='5519993040768'` em prod (efeito
   imediato — próxima escalation notifica corretamente)
2. `escalate/index.ts:29` `DEFAULT_NOTIFICATION_PHONE` trocado pra
   `5519993040768` com comentário de aviso (proteção caso config seja
   deletada/zerada)
3. Re-deploy via GHA (`escalate v18`)
4. Re-validação E2E pendente: Kobe vai re-rodar Teste 6 pra Pedro
   confirmar visualmente recebimento da notif

Lição: testes E2E precisam validar **fim-a-fim**, incluindo envio outbound
real, não só estado de banco. Bugs em destino de mensagem podem ficar
invisíveis se ninguém confere o canal de destino.

---

*Documento finalizado em 22/05/2026, antes da aplicação do fix do escalate
(versões 1-2). Atualizado com anexo do bug do notification_phone em 22/05
11:20 BRT (versão 3).*
