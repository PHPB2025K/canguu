// ============================================================================
// CARTILHA ÚNICA — Regras invioláveis e de formato do atendimento marketplace
// ============================================================================
// Fonte única de verdade, consumida por QUATRO pontos (mudou aqui, vale em todos):
//   1. ml-webhook             — prompt de GERAÇÃO das respostas da Ana
//   2. daily-learning-review  — rubrica do juiz + gate das correções antes do insert
//   3. ml-response-validator  — hard-block regex pós-geração
//   4. frontend (Aprovar)     — gate antes de ativar uma correção no painel
//
// REGRA DE OURO: nenhum prompt/validador redeclara estas regras localmente.
// Módulo PURO: zero imports — roda no Deno (edge) e no bundle Vite (painel).

// ─── Limites de formato por canal ───────────────────────────────────────────

export const ML_QUESTION_MAX_CHARS = 350 // pergunta pública de anúncio (limite do ML)
export const ML_MESSAGE_MAX_CHARS = 500  // mensagem privada pós-venda
export const CHAT_MAX_TOTAL_CHARS = 600  // WhatsApp/Instagram (config max_total_chars)

// ─── Emoji (proibido em pergunta pública do ML) ──────────────────────────────
// Fonte única da classe de emoji; o validador constrói a regex /gu a partir dela.

export const EMOJI_PATTERN_SOURCE =
  '[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}\\u{FE00}-\\u{FE0F}\\u{1F900}-\\u{1F9FF}\\u{1FA00}-\\u{1FA6F}\\u{1FA70}-\\u{1FAFF}\\u{200D}\\u{20E3}\\u{E0020}-\\u{E007F}]'

export function hasEmoji(text: string): boolean {
  return new RegExp(EMOJI_PATTERN_SOURCE, 'u').test(text)
}

// ─── REGRA INVIOLÁVEL Nº 1: nunca mencionar reclamação/disputa ───────────────
// Sugerir/mencionar abertura de reclamação derruba a reputação da conta.
// Vale para QUALQUER texto destinado a marketplace: resposta gerada, correção
// do juiz, substituto do hard-block e aprovação manual no painel.

export const FORBIDDEN_CLAIM_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Stem amplo DE PROPÓSITO (decisão Pedro 03/07/2026: "reclamação e variações,
  // sem exceção") — bloqueia até uso tranquilizador ("não há reclamações").
  // Custo do falso positivo = fallback limpo; custo do falso negativo = reputação.
  { pattern: /\breclama\w*/i,        reason: 'menciona reclamação (proibido: derruba reputação da conta)' },
  // Só o substantivo: "disputado/disputando" é vocabulário legítimo de venda
  // ("um dos modelos mais disputados da loja") e não pode ser bloqueado.
  { pattern: /\bdisputas?\b/i,       reason: 'menciona disputa' },
  { pattern: /\bmedia[çc][ãa]o\b/i,  reason: 'menciona mediação' },
  { pattern: /\bprocon\b/i,          reason: 'menciona Procon' },
  { pattern: /\babr(?:a|am|ir|indo)\s+(?:uma\s+|um\s+)?(?:solicita[çc][ãa]o|pedido|processo)\s+de\s+(?:devolu[çc][ãa]o|troca|reembolso)/i, reason: 'orienta abrir solicitação de devolução/troca' },
]

export function detectForbiddenClaims(text: string): string[] {
  const matches: string[] = []
  for (const { pattern, reason } of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(text)) matches.push(reason)
  }
  return matches
}

// ─── Frases proibidas: pedido de contato externo ─────────────────────────────
// ML proíbe redirecionar pra canal externo; "fale conosco"/"estamos à
// disposição" soam como não-resposta evasiva.

export const FORBIDDEN_CONTACT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bentre[m]?\s+em\s+contato\b/i,                       reason: 'entre em contato' },
  { pattern: /\bentrar\s+em\s+contato\b/i,                          reason: 'entrar em contato' },
  { pattern: /\bfale[m]?\s+conosco\b/i,                             reason: 'fale conosco' },
  { pattern: /\bnos\s+(?:contate|chame|procure|envie|mande)\b/i,    reason: 'nos contate/envie' },
  { pattern: /\bme\s+(?:chame|envie|mande|contate)\b/i,             reason: 'me chame/envie' },
  { pattern: /\bcontate(?:[- ]nos|\s+nosso)\b/i,                    reason: 'contate-nos / contate nosso' },
  { pattern: /\bcontact(?:[- ]nos|\s+nosso)\b/i,                    reason: 'contact-nos' },
  { pattern: /\b(?:envie|mande|manda)\s+(?:uma\s+)?(?:mensagem|email)\b/i, reason: 'envie mensagem' },
  { pattern: /\b(?:estou|estamos|fico|ficamos|seguimos)\s+(?:a|à)\s+disposi[çc][aã]o\b/i, reason: 'estou/estamos à disposição' },
  { pattern: /\bpara\s+(?:mais|maiores)\s+(?:detalhes|informa[çc][õo]es)\b[^.]*\b(?:contat|fal[ae]|chame)\b/i, reason: 'para mais detalhes contate' },
]

// ─── Frases proibidas: vazamento de processo interno / cadastro ──────────────
// Quebram a regra "cética mas gentil" (Bloco 17): não admitir falha de
// cadastro, não expor processo interno, não prometer verificação/retorno.

export const FORBIDDEN_ADMIN_LEAK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bn[ãa]o\s+(?:temos|consta|est[áa]\s+confirmad[ao])\s+(?:essa\s+)?(?:informa[çc][ãa]o)?\s*(?:no\s+)?cadastro\b/i, reason: 'não temos/consta no cadastro' },
  { pattern: /\bn[ãa]o\s+(?:est[áa]|esta)\s+confirmad[ao]\s+no\s+cadastro\b/i, reason: 'não está confirmado no cadastro' },
  { pattern: /\b(?:vamos|ir[ée]?mos|sera|ser[áa])\s+verificad[ao]?\s+internamente\b/i, reason: 'verificar internamente' },
  { pattern: /\bverificar\s+(?:com\s+)?(?:nossa\s+)?(?:equipe|setor)\s+(?:t[ée]cnic[ao]|respons[áa]vel|de\s+separa[çc][ãa]o)\b/i, reason: 'verificar com equipe técnica' },
  { pattern: /\b(?:vamos|ir[ée]?mos|sera|ser[áa])\s+atualizad[ao]?\s+(?:o\s+)?an[úu]ncio\b/i, reason: 'atualizar o anúncio' },
  { pattern: /\batualizar(?:emos)?\s+(?:o\s+)?an[úu]ncio\b/i,        reason: 'atualizaremos o anúncio' },
  { pattern: /\bpedimos\s+desculpas?\s+pela\s+diverg[êe]ncia\b/i,    reason: 'desculpas pela divergência' },
  { pattern: /\blamentamos\s+a\s+inconsist[êe]ncia\b/i,              reason: 'lamentamos a inconsistência' },
  { pattern: /\b(?:voc[êe]\s+pode|pode\s+solicitar)\s+a\s+devolu[çc][ãa]o\b/i, reason: 'pode solicitar devolução (proativo)' },
  { pattern: /\bfazer\s+a\s+devolu[çc][ãa]o\b/i,                    reason: 'fazer a devolução (proativo)' },
  { pattern: /\bn[ãa]o\s+(?:est[áa]|esta)\s+detalhad[ao]\s+no\s+cadastro\b/i, reason: 'não está detalhada no cadastro' },
  { pattern: /\bn[ãa]o\s+(?:tenho|temos)\s+(?:essa\s+)?informa[çc][ãa]o\s+confirmad[ao]\b/i, reason: 'não tenho/temos informação confirmada' },
  { pattern: /\b(?:verificar|conferir|checar|consultar)\s+internamente\b/i, reason: 'verificar internamente (qualquer conjugação)' },
  { pattern: /\batualizar(?:emos)?\s+por\s+aqui\b/i,                reason: 'atualizar por aqui' },
  { pattern: /\bdevolu[çc][ãa]o\s+gratuita\s+em\s+at[ée]\b/i,       reason: 'promessa proativa de devolução gratuita em X dias' },
  { pattern: /\b(?:vou|vamos|irei|iremos)\s+(?:conferir|verificar|checar|consultar)\b[^.!?]*\b(?:retorn|aviso|informo)\w*\b/i, reason: 'vou conferir e te retorno (promessa de verificação)' },
  { pattern: /\b(?:te|lhe)\s+retorno\b/i,                            reason: 'te retorno (promessa de retorno)' },
  { pattern: /\bretorn(?:o|amos|arei)\s+(?:em\s+breve|assim\s+que|o\s+mais\s+r[áa]pido)\b/i, reason: 'retorno em breve / assim que possível' },
]

// ─── Detecção de pergunta que é PROBLEMA DE PEDIDO ───────────────────────────
// (produto errado/faltando/não chegou) — usada pra escolher o fallback certo.

// "faltando" sozinho NÃO entra (dúvida de pré-venda legítima: "está faltando
// alguma cor no anúncio?") — só combinado com verbo de recebimento (padrão 1).
// "não recebi/chegou" fica: o caso real dominante é "meu pedido não chegou";
// o falso positivo raro só troca o TEXTO do fallback, nunca viola política.
const ORDER_PROBLEM_PATTERNS: RegExp[] = [
  /\b(?:recebi|enviaram|entregaram|mandaram|veio|chegou)\b[\s\S]{0,100}\b(?:errad\w+|diferente|trocad\w+|quebrad\w+|danificad\w+|avariad\w+|incomplet\w+|faltando|faltou|no\s+lugar)\b/i,
  /\bno\s+lugar\s+d(?:o|a|os|as|e)\b/i,
  /\bn[ãa]o\s+(?:recebi|chegou)\b/i,
  /\b(?:produto|item|pedido|kit)\s+(?:errad\w+|diferente|trocad\w+)\b/i,
  /\b(?:enviaram|entregaram|mandaram|recebi|veio)\b[\s\S]{0,100}\bn[ãa]o\s+(?:os?\b|as?\b|era\b|é\b)/i,
  /\bpaguei\s+\d+\s+e\s+(?:enviaram|vieram|recebi|veio)\b/i,
]

export function isOrderProblemText(text: string): boolean {
  const t = text || ''
  return ORDER_PROBLEM_PATTERNS.some((p) => p.test(t))
}

// ─── Fallbacks de canal PÚBLICO (nunca prometem retorno) ─────────────────────
// Escolha via pickMLFallback(pergunta): reclamação de pedido ganha acolhimento
// + orientação pela aba de mensagens do pedido; dúvida comum ganha o genérico.

export const CLEAN_FALLBACK_ML =
  'Olá! Os detalhes deste produto estão na descrição do anúncio. Se tiver outra dúvida sobre ele, pode perguntar por aqui.'

export const COMPLAINT_FALLBACK_ML =
  'Olá! Sentimos muito pelo ocorrido. Acompanhe pela aba de mensagens do pedido, em Minhas Compras — nossa equipe dá sequência por lá.'

export const CLEAN_FALLBACK_ML_MESSAGE =
  'Obrigado pela mensagem! Nossa equipe acompanha por aqui e dá sequência no seu atendimento.'

export function pickMLFallback(questionText: string): string {
  return isOrderProblemText(questionText) ? COMPLAINT_FALLBACK_ML : CLEAN_FALLBACK_ML
}

// ─── Blocos de prompt compartilhados (geração E juiz leem os MESMOS) ─────────

// Regra 17 "cética mas gentil" — texto usado no prompt de geração do ml-webhook.
export const REGRA_CETICA_ML_PROMPT = `REGRA 17 (cética mas gentil) — PROIBIDO ABSOLUTO, mesmo quando faltar um dado:
   - NÃO admita falha de cadastro: nunca diga "não está detalhada/confirmada no cadastro", "não temos/tenho essa informação confirmada", "não consta no cadastro".
   - NÃO exponha processo interno: nunca diga "vou/vamos verificar internamente", "verificar com a equipe", "vamos atualizar o anúncio", "atualizar por aqui".
   - NÃO use frases de telemarketing: "estou/estamos à disposição", "entre em contato", "fale conosco", "nossa equipe técnica", "mande mensagem".
   - NÃO prometa proativamente devolução, reembolso, prazo de entrega ou estoque.
   Quando faltar um dado específico, responda com o que você SABE do produto. É uma resposta PÚBLICA, sem follow-up privado: NUNCA diga "vou conferir e te retorno" nem prometa retornar depois. Se realmente não souber aquele detalhe, seja transparente e objetivo, orientando pelo que consta na descrição do anúncio (ex.: "Olá! Esse detalhe está na descrição do anúncio; sobre o produto posso te ajudar com o que precisar.") — sem expor cadastro/processo interno e sem prometer retorno.`

// Regra de problema de pedido — texto usado no prompt de geração do ml-webhook.
export const REGRA_PROBLEMA_PEDIDO_ML_PROMPT = `PROBLEMA DE PEDIDO (ex.: "paguei 3 e enviaram 2", "vai vir incompleto", "não recebi", "veio produto errado"): reconheça brevemente e oriente, de forma pública e impessoal, a acompanhar pela aba de MENSAGENS DO PEDIDO no próprio Mercado Livre ("Minhas Compras" → o pedido) — onde a equipe dá sequência. NUNCA peça nº do pedido/CPF na resposta pública, NUNCA sugira reclamação/disputa/mediação — mencionar reclamação é PROIBIDO ABSOLUTO em qualquer resposta de marketplace.`

// Regras de escrita da CORREÇÃO — usadas pelo juiz do daily-learning-review.
export const REGRAS_CORRECAO_ML = `COMO ESCREVER resposta_correta (OBRIGATÓRIO — a correção segue a MESMA cartilha da geração; correção que violar é descartada automaticamente):
- Máximo ${ML_QUESTION_MAX_CHARS} caracteres. SEM emoji, SEM links, SEM mencionar outras plataformas. Texto puro, tom público.
- Curta, direta e cordial: responda EXATAMENTE o que o cliente perguntou. UMA frase de acolhimento no máximo — sem parágrafos de empatia.
- PROIBIDO ABSOLUTO: mencionar reclamação/disputa/mediação/Procon; orientar abrir solicitação de devolução/troca; pedir contato externo; "estou/estamos à disposição"; expor cadastro/processo interno; prometer verificação/retorno; prometer devolução/reembolso/prazo proativamente.
- PROBLEMA DE PEDIDO (produto errado/faltando/não chegou): acolher em UMA frase curta e orientar acompanhar pela aba de MENSAGENS DO PEDIDO no próprio Mercado Livre ("Minhas Compras" → o pedido), onde a equipe dá sequência. NUNCA reclamação.
- NÃO introduzir informação fora da VERDADE DO CATÁLOGO nem deixar a correção mais longa que o necessário.`

export const REGRAS_CORRECAO_CHAT = `COMO ESCREVER resposta_correta (chat WhatsApp/Instagram — correção que violar é descartada automaticamente):
- Curta e humana (máximo ${CHAT_MAX_TOTAL_CHARS} caracteres). Emojis com moderação são ok.
- Em reclamação/problema: empatia primeiro + coletar dados (nº do pedido, foto) + encaminhar pra equipe. NUNCA prometer troca/reembolso/prazo/coleta (só a equipe humana promete) e NUNCA mencionar horário de atendimento.
- Não inflar o texto nem introduzir informação que não se sabe.`

// ─── GATE: validação de uma correção antes de entrar/ativar na base ──────────
// Usado pelo daily-learning-review (antes do insert) e pelo painel (Aprovar).
// Escopo com 'all' ou 'mercado_livre' recebe a régua completa de marketplace.

export interface CorrectionGateResult {
  ok: boolean
  violations: string[]
}

export function validateCorrectionText(
  text: string,
  scopes: string[] | null | undefined,
): CorrectionGateResult {
  const violations: string[] = []
  const t = (text || '').trim()
  if (!t) return { ok: false, violations: ['texto vazio'] }

  const s = (scopes && scopes.length ? scopes : ['all']).map((x) => String(x).toLowerCase())
  const appliesToMarketplace = s.includes('all') || s.includes('mercado_livre')

  if (appliesToMarketplace) {
    for (const { pattern, reason } of FORBIDDEN_CLAIM_PATTERNS) {
      if (pattern.test(t)) violations.push(reason)
    }
    for (const { pattern, reason } of FORBIDDEN_CONTACT_PATTERNS) {
      if (pattern.test(t)) violations.push(`frase proibida: ${reason}`)
    }
    for (const { pattern, reason } of FORBIDDEN_ADMIN_LEAK_PATTERNS) {
      if (pattern.test(t)) violations.push(`frase proibida: ${reason}`)
    }
    if (hasEmoji(t)) violations.push('emoji (proibido em resposta pública de marketplace)')
    if (/https?:\/\//i.test(t)) violations.push('link externo')
    if (t.length > ML_QUESTION_MAX_CHARS) {
      violations.push(`${t.length} caracteres (máximo ${ML_QUESTION_MAX_CHARS} em resposta pública do ML)`)
    }
  } else {
    // Escopo só de chat: régua mais leve (formato); conteúdo é papel dos
    // detectores de chat (business-hours/overpromise) no daily-learning-review.
    if (t.length > CHAT_MAX_TOTAL_CHARS) {
      violations.push(`${t.length} caracteres (máximo ${CHAT_MAX_TOTAL_CHARS} no chat)`)
    }
  }

  return { ok: violations.length === 0, violations }
}
