// Smoke tests pro guardrail de horário comercial (Ana 24/7).
// Executar: cd supabase/functions/_shared && deno test response-validator.test.ts

import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { detectBusinessHoursLimit, validateResponse } from './response-validator.ts'

// ─── Detector puro ──────────────────────────────────────────────

Deno.test('detector — frase canônica do incidente', () => {
  const text = 'Oi! 😊 Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem que responderemos assim que possível!'
  const reasons = detectBusinessHoursLimit(text)
  assert(reasons.length >= 4, `esperado >=4 razões, veio ${reasons.length}: ${reasons.join(', ')}`)
  assert(reasons.includes('segunda a sexta'))
  assert(reasons.includes('horário de atendimento/comercial/expediente'))
  assert(reasons.includes('deixe sua mensagem'))
  assert(reasons.includes('responderemos assim que possível'))
})

Deno.test('detector — variações de janela horária', () => {
  assertEquals(detectBusinessHoursLimit('das 9h às 17h').length, 1)
  assertEquals(detectBusinessHoursLimit('das 8 horas às 18 horas').length, 1)
  assertEquals(detectBusinessHoursLimit('horário comercial').length, 1)
  assertEquals(detectBusinessHoursLimit('estamos fora do expediente').length, 2) // 'expediente' + 'fora do expediente'
})

Deno.test('detector — frases neutras NÃO disparam', () => {
  assertEquals(detectBusinessHoursLimit('Oi! Como posso te ajudar?').length, 0)
  assertEquals(detectBusinessHoursLimit('O produto custa R$ 18,90').length, 0)
  assertEquals(detectBusinessHoursLimit('Estou disponível 24 horas por dia, 7 dias por semana.').length, 0)
  assertEquals(detectBusinessHoursLimit('Vamos retornar com mais informações sobre o pedido.').length, 0)
})

Deno.test('detector — falsos positivos potenciais', () => {
  // Não deve disparar com prazos de entrega
  assertEquals(detectBusinessHoursLimit('Entrega em 2 a 5 dias úteis').length, 0)
  // Não deve disparar com horário do produto (raro mas possível)
  assertEquals(detectBusinessHoursLimit('Funciona por 8 horas com bateria cheia').length, 0)
})

// ─── Integração com validateResponse ────────────────────────────

Deno.test('validateResponse — frase do incidente é BLOQUEADA e substituída', () => {
  const original = 'Oi! 😊 Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem que responderemos assim que possível!'
  const result = validateResponse(original)
  assertEquals(result.text, 'Estou disponível 24 horas por dia, 7 dias por semana. Como posso te ajudar? 😊')
  assert(result.warnings.includes('business_hours_blocked_substituted'))
  // Garante que pelo menos uma razão específica está logada
  assert(result.warnings.some(w => w.startsWith('forbidden_business_hours:')))
  assertEquals(result.chunkCount, 1)
})

Deno.test('validateResponse — variantes também bloqueadas', () => {
  const variantes = [
    'Funcionamos de segunda a sexta das 9h às 17h.',
    'Nosso atendimento está fechado no momento, deixe sua mensagem.',
    'Por favor, aguarde nosso retorno em horário comercial.',
    'Estamos fora do horário, retornaremos em breve.',
  ]
  for (const v of variantes) {
    const r = validateResponse(v)
    assert(r.warnings.includes('business_hours_blocked_substituted'),
      `variante NÃO bloqueada: ${v}`)
    assert(r.text.includes('24 horas'),
      `substituição esperada não veio: ${r.text}`)
  }
})

Deno.test('validateResponse — resposta válida 24/7 NÃO é tocada', () => {
  const ok = 'Estou disponível 24 horas por dia, 7 dias por semana. Como posso te ajudar? 😊'
  const result = validateResponse(ok)
  assertEquals(result.text, ok)
  assert(!result.warnings.includes('business_hours_blocked_substituted'))
})

Deno.test('validateResponse — preço e contexto comum NÃO disparam falso positivo', () => {
  const r1 = validateResponse('O produto custa R$ 18,90 e a entrega é em 5 dias úteis.')
  assert(!r1.warnings.includes('business_hours_blocked_substituted'))

  const r2 = validateResponse('Temos esse produto em 3 cores: azul, vermelho e verde.')
  assert(!r2.warnings.includes('business_hours_blocked_substituted'))
})
