// Testes da CARTILHA ÚNICA (marketplace-rules) + integração com o validador ML.
// Executar: cd supabase/functions/_shared && deno test marketplace-rules.test.ts
//
// Os dois primeiros casos são as correções REAIS que o daily-learning-review
// gerou em 02/07/2026 pro incidente da "chaleira" (MLB5402326666) — mandavam o
// cliente abrir RECLAMAÇÃO, com emoji, >350 chars e "Estamos à disposição".
// Elas têm que ser REPROVADAS pelo gate. É a regressão que motivou a cartilha.

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  validateCorrectionText,
  detectForbiddenClaims,
  isOrderProblemText,
  pickMLFallback,
  hasEmoji,
  CLEAN_FALLBACK_ML,
  COMPLAINT_FALLBACK_ML,
  CLEAN_FALLBACK_ML_MESSAGE,
} from './marketplace-rules.ts'
import {
  validateMLQuestionResponse,
  validateMLMessageResponse,
} from './ml-response-validator.ts'

// ─── Casos reais do incidente (02/07/2026) ──────────────────────

const CORRECAO_RUIM_1 =
  'Olá! Sentimos muito que você tenha recebido um produto diferente do que comprou 😔 Isso não deveria ter acontecido! Por favor, abra uma solicitação de devolução/troca diretamente pela plataforma do Mercado Livre, na seção "Minhas Compras" > "Reclamações". Assim o processo fica registrado e conseguimos resolver da forma mais rápida possível para você. Estamos à disposição!'

const CORRECAO_RUIM_2 =
  'Olá! Lamentamos muito por esse transtorno! Receber um produto diferente do que comprou é realmente frustrante e entendemos sua insatisfação. 😔 Por favor, abra uma reclamação/devolução diretamente pela plataforma do Mercado Livre, na seção "Minhas Compras", selecionando o pedido. Assim o processo fica registrado e protegido, e vamos resolver isso o mais rápido possível para você. Estamos à disposição!'

const PERGUNTA_CHALEIRA_1 = 'Boa tarde vocês me enviaram uma chaleira no lugar dos potes de vídro de 640 ml'
const PERGUNTA_CHALEIRA_2 = 'vocês me entregaram uma CHALEIRA ELÉTRICA, NÃO OS POTES DA DESCRIÇÃO'

Deno.test('gate — correção ruim 1 (Reclamações + emoji + 373 chars) é reprovada', () => {
  const r = validateCorrectionText(CORRECAO_RUIM_1, ['mercado_livre'])
  assertEquals(r.ok, false)
  assert(r.violations.some((v) => v.includes('reclamação')), `faltou violação de reclamação: ${r.violations.join(' | ')}`)
  assert(r.violations.some((v) => v.includes('emoji')), 'faltou violação de emoji')
  assert(r.violations.some((v) => v.includes('caracteres')), 'faltou violação de tamanho')
  assert(r.violations.some((v) => v.includes('disposição')), 'faltou "estamos à disposição"')
})

Deno.test('gate — correção ruim 2 (abra uma reclamação) é reprovada', () => {
  const r = validateCorrectionText(CORRECAO_RUIM_2, ['mercado_livre'])
  assertEquals(r.ok, false)
  assert(r.violations.some((v) => v.includes('reclamação')))
})

Deno.test('gate — escopo "all" também recebe a régua de marketplace', () => {
  const r = validateCorrectionText('Bom dia! 😊 Como posso te ajudar?', ['all'])
  assertEquals(r.ok, false, 'emoji com escopo all deveria reprovar')
})

Deno.test('gate — escopo só de chat permite emoji', () => {
  const r = validateCorrectionText('Bom dia! 😊 Tudo bem? Como posso te ajudar hoje?', ['whatsapp', 'instagram'])
  assertEquals(r.ok, true, r.violations.join(' | '))
})

Deno.test('gate — correção boa de marketplace passa', () => {
  const boa = 'Olá! O kit tem 6 potes herméticos de 320ml na cor azul-petróleo, todos com tampa e 4 travas. Você recebe as 6 unidades em uma única entrega.'
  const r = validateCorrectionText(boa, ['mercado_livre'])
  assertEquals(r.ok, true, r.violations.join(' | '))
})

// ─── Palavras proibidas (reclamação/disputa e variações) ────────

Deno.test('claims — detecta todas as variações proibidas', () => {
  assert(detectForbiddenClaims('abra uma reclamação na plataforma').length > 0)
  assert(detectForbiddenClaims('você pode abrir uma disputa').length > 0)
  assert(detectForbiddenClaims('solicite a mediação do Mercado Livre').length > 0)
  assert(detectForbiddenClaims('procure o Procon').length > 0)
  assert(detectForbiddenClaims('abra uma solicitação de devolução pela plataforma').length > 0)
  assert(detectForbiddenClaims('na seção "Reclamações" do site').length > 0)
})

Deno.test('claims — texto limpo não dispara', () => {
  assertEquals(detectForbiddenClaims(COMPLAINT_FALLBACK_ML).length, 0)
  assertEquals(detectForbiddenClaims(CLEAN_FALLBACK_ML).length, 0)
})

Deno.test('claims — vocabulário de venda legítimo NÃO dispara (review 03/07)', () => {
  assertEquals(detectForbiddenClaims('É um dos modelos mais disputados da nossa loja!').length, 0)
  assertEquals(detectForbiddenClaims('Esse modelo é muito disputado nesta época').length, 0)
})

Deno.test('claims — "reclamações" em sentido tranquilizador TAMBÉM bloqueia (decisão deliberada: variações sem exceção)', () => {
  assert(detectForbiddenClaims('Não temos reclamações de vazamento nesse modelo').length > 0)
})

// ─── Validador ML agora bloqueia menção a reclamação ────────────

Deno.test('validador ML — resposta com "reclamação" é hard-block', () => {
  const r = validateMLQuestionResponse('Olá! Abra uma reclamação em Minhas Compras que resolvemos.')
  assertEquals(r.forbiddenContactDetected, true)
  assertEquals(r.forbiddenClaimDetected, true)
  assertEquals(r.text, '')
  assert(r.warnings.some((w) => w.startsWith('forbidden_claim:')))
})

// ─── Fallbacks: limpos e aprovados pela própria régua ───────────

Deno.test('fallbacks — passam no gate e no validador (nunca se auto-bloqueiam)', () => {
  for (const f of [CLEAN_FALLBACK_ML, COMPLAINT_FALLBACK_ML]) {
    const gate = validateCorrectionText(f, ['mercado_livre'])
    assertEquals(gate.ok, true, `${f} → ${gate.violations.join(' | ')}`)
    const val = validateMLQuestionResponse(f)
    assertEquals(val.forbiddenContactDetected ?? false, false)
    assertEquals(val.text, f)
  }
  const msg = validateMLMessageResponse(CLEAN_FALLBACK_ML_MESSAGE)
  assertEquals(msg.forbiddenContactDetected ?? false, false)
})

// ─── Detecção de problema de pedido (escolha do fallback) ───────

Deno.test('problema de pedido — os dois casos reais da chaleira detectam', () => {
  assert(isOrderProblemText(PERGUNTA_CHALEIRA_1), 'caso 1 não detectado')
  assert(isOrderProblemText(PERGUNTA_CHALEIRA_2), 'caso 2 não detectado')
  assert(isOrderProblemText('paguei 3 e enviaram 2'))
  assert(isOrderProblemText('meu pedido não chegou'))
  assert(isOrderProblemText('veio faltando um pote'))
})

Deno.test('problema de pedido — dúvida comum de produto NÃO detecta', () => {
  assertEquals(isOrderProblemText('A tampa pode ser lavada na lava-louças?'), false)
  assertEquals(isOrderProblemText('Posso levar ao micro-ondas sem a tampa?'), false)
  assertEquals(isOrderProblemText('Qual a capacidade do pote quadrado?'), false)
  // pré-venda com "faltando" sem verbo de recebimento (review 03/07)
  assertEquals(isOrderProblemText('Está faltando alguma cor no anúncio?'), false)
})

Deno.test('pickMLFallback — reclamação ganha acolhimento, dúvida ganha genérico', () => {
  assertEquals(pickMLFallback(PERGUNTA_CHALEIRA_1), COMPLAINT_FALLBACK_ML)
  assertEquals(pickMLFallback('Qual a capacidade do pote?'), CLEAN_FALLBACK_ML)
})

// ─── Emoji helper ───────────────────────────────────────────────

Deno.test('hasEmoji — detecta e não dá falso positivo', () => {
  assert(hasEmoji('Sentimos muito 😔 pelo ocorrido'))
  assertEquals(hasEmoji('Resposta limpa, sem emoji, com acentuação: ção, é, à.'), false)
})

// ─── Correção ativa com emoji (caso c61f7ed3, escopo mercado_livre) ─

Deno.test('gate — correção ativa antiga com emoji em escopo ML seria bloqueada hoje', () => {
  const c61f7ed3 =
    'Olá! 😊 O anúncio é de 1 kit contendo 6 potes herméticos de 320ml na cor azul-petróleo, todos com tampa e 4 travas. Ou seja, você recebe as 6 unidades em uma única entrega! Se tiver mais alguma dúvida, estamos por aqui! 💙'
  const r = validateCorrectionText(c61f7ed3, ['mercado_livre'])
  assertEquals(r.ok, false)
  assert(r.violations.some((v) => v.includes('emoji')))
})
