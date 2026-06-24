// ML Response Validator — Post-processes AI responses for Mercado Livre
// Strips emojis, links, platform mentions, enforces char limits

const ML_QUESTION_FALLBACK = 'Ola! Vou conferir essa informacao e te retorno em breve.'
const ML_MESSAGE_FALLBACK = 'Obrigado pela mensagem. Vou conferir e te retorno em breve.'

// Patterns to remove
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu
const URL_REGEX = /https?:\/\/[^\s)]+/gi
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{4,5}[-.\s]?\d{4}/g
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PLATFORM_MENTIONS = /\b(shopee|amazon|site\s+pr[oó]prio|whatsapp|wpp|instagram|facebook|telegram|tiktok\s*shop)\b/gi
const CHUNK_SEPARATOR = /\\\\/g

// HARD BLOCKERS — phrases that violate ML policy or Budamix tone rules.
// Two categories share the same downstream behavior (RAG substitution
// or technical fallback) but are tracked separately for telemetry.
//
//  1. CONTACT — asking the buyer to reach out off-platform. ML forbids
//     external channel redirects and even "fale conosco" reads as evasive
//     boilerplate that buyers correctly identify as non-answers.
//
//  2. ADMIN LEAK (added 2026-05-25) — phrases that admit listing/cadastral
//     failure or promise internal verification. These break the
//     "sceptical-but-gentle" rule (Bloco 17 of system_prompt). The LLM
//     reaches for them when product context lacks a specific compat field,
//     even though the prompt explicitly forbids them. Hard-blocking here
//     enforces the rule even when LLM adherence drifts.
const FORBIDDEN_CONTACT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
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

const FORBIDDEN_ADMIN_LEAK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
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
  // Added 2026-06-19 — real variants that escaped the patterns above.
  // The phrasing drifts ("não está DETALHADA", "Vou verificar", "não TENHO",
  // "confirmada sobre X" without the "cadastro" anchor), so broaden coverage.
  { pattern: /\bn[ãa]o\s+(?:est[áa]|esta)\s+detalhad[ao]\s+no\s+cadastro\b/i, reason: 'não está detalhada no cadastro' },
  { pattern: /\bn[ãa]o\s+(?:tenho|temos)\s+(?:essa\s+)?informa[çc][ãa]o\s+confirmad[ao]\b/i, reason: 'não tenho/temos informação confirmada' },
  { pattern: /\b(?:verificar|conferir|checar|consultar)\s+internamente\b/i, reason: 'verificar internamente (qualquer conjugação)' },
  { pattern: /\batualizar(?:emos)?\s+por\s+aqui\b/i,                reason: 'atualizar por aqui' },
  { pattern: /\bdevolu[çc][ãa]o\s+gratuita\s+em\s+at[ée]\b/i,       reason: 'promessa proativa de devolução gratuita em X dias' },
  // "vou conferir/verificar essa informação e te retorno em breve" — slipped through (no "internamente").
  // Was literally the old hardcoded fallback / prompt rule 10. Audit 2026-06-24.
  { pattern: /\b(?:vou|vamos|irei|iremos)\s+(?:conferir|verificar|checar|consultar)\b[^.!?]*\b(?:retorn|aviso|informo)\w*\b/i, reason: 'vou conferir e te retorno (promessa de verificação)' },
  { pattern: /\b(?:te|lhe)\s+retorno\b/i,                            reason: 'te retorno (promessa de retorno)' },
  { pattern: /\bretorn(?:o|amos|arei)\s+(?:em\s+breve|assim\s+que|o\s+mais\s+r[áa]pido)\b/i, reason: 'retorno em breve / assim que possível' },
]

export interface MLValidationResult {
  text: string
  warnings: string[]
  charCount: number
  /** True when ANY hard-block pattern matched (contact OR admin leak).
   *  Field name kept for backwards compat with existing callers; the
   *  semantic is "response was rejected as a whole and must be substituted".
   *  When true, `text` is empty — the caller must substitute it. */
  forbiddenContactDetected?: boolean
  /** All matched reasons, regardless of category. */
  forbiddenContactReasons?: string[]
  /** Granular flag for telemetry: true when admin-leak phrases matched
   *  (e.g. "não temos no cadastro", "atualizaremos o anúncio"). */
  forbiddenAdminLeakDetected?: boolean
}

/**
 * Pure detector — does NOT mutate. Returns the human-readable reasons
 * (`entre em contato`, etc.) so the caller can log and decide what to do.
 */
export function detectForbiddenContactRequest(text: string): string[] {
  const matches: string[] = []
  for (const { pattern, reason } of FORBIDDEN_CONTACT_PATTERNS) {
    if (pattern.test(text)) matches.push(reason)
  }
  return matches
}

/**
 * Pure detector for cadastral/admin leak phrases (Bloco 17 do prompt).
 */
export function detectForbiddenAdminLeak(text: string): string[] {
  const matches: string[] = []
  for (const { pattern, reason } of FORBIDDEN_ADMIN_LEAK_PATTERNS) {
    if (pattern.test(text)) matches.push(reason)
  }
  return matches
}

/**
 * Validate a response for ML question (public, pre-sale).
 * Max 350 chars, no emojis, no links, no platform mentions.
 */
export function validateMLQuestionResponse(text: string): MLValidationResult {
  return validateMLResponse(text, 350, ML_QUESTION_FALLBACK)
}

/**
 * Validate a response for ML message (private, post-sale).
 * Max 500 chars, emojis allowed (1-2), no links, no platform mentions.
 */
export function validateMLMessageResponse(text: string): MLValidationResult {
  return validateMLResponse(text, 500, ML_MESSAGE_FALLBACK, true)
}

function validateMLResponse(
  text: string,
  maxChars: number,
  fallback: string,
  allowEmojis = false,
): MLValidationResult {
  const warnings: string[] = []

  if (!text || text.trim().length === 0) {
    return { text: fallback, warnings: ['empty_response'], charCount: fallback.length }
  }

  // HARD BLOCK: caller is responsible for substituting the response when
  // this fires — typically with a verified correction from search_corrections
  // or a technical fallback. We do NOT try to "fix" the LLM output here
  // because contextually-correct rewrites need product info we don't have.
  //
  // Two pattern families are checked. They share the same outcome (block +
  // substitute) but are reported separately for telemetry.
  const contactReasons = detectForbiddenContactRequest(text)
  const adminLeakReasons = detectForbiddenAdminLeak(text)
  const allReasons = [...contactReasons, ...adminLeakReasons]
  if (allReasons.length > 0) {
    return {
      text: '', // empty signals the caller to substitute
      warnings: [
        ...contactReasons.map(r => `forbidden_contact:${r}`),
        ...adminLeakReasons.map(r => `forbidden_admin_leak:${r}`),
      ],
      charCount: 0,
      forbiddenContactDetected: true, // back-compat: callers use this to branch
      forbiddenContactReasons: allReasons,
      forbiddenAdminLeakDetected: adminLeakReasons.length > 0,
    }
  }

  let cleaned = text.trim()

  // Remove chunk separators (AI habit from WhatsApp mode)
  if (CHUNK_SEPARATOR.test(cleaned)) {
    cleaned = cleaned.replace(CHUNK_SEPARATOR, ' ')
    warnings.push('chunk_separator_removed')
  }

  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')     // *bold* → bold
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1')       // _italic_ → italic
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')

  // Remove emojis (for questions; messages allow limited emojis)
  if (!allowEmojis) {
    if (EMOJI_REGEX.test(cleaned)) {
      cleaned = cleaned.replace(EMOJI_REGEX, '')
      warnings.push('emojis_removed')
    }
  }

  // Remove external URLs but preserve ML internal links (mercadolivre.com.br/MLBxxx)
  const mlInternalLinks: string[] = []
  const mlLinkPattern = /mercadolivre\.com\.br\/MLB\d+/gi
  let mlMatch
  while ((mlMatch = mlLinkPattern.exec(cleaned)) !== null) {
    mlInternalLinks.push(mlMatch[0])
  }
  if (URL_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(URL_REGEX, '')
    warnings.push('urls_removed')
  }
  // Re-insert ML internal links that were stripped (short format, no https://)
  if (mlInternalLinks.length > 0) {
    const uniqueLinks = [...new Set(mlInternalLinks)]
    for (const link of uniqueLinks) {
      if (!cleaned.includes(link)) {
        cleaned = cleaned.trimEnd() + ' ' + link
      }
    }
  }

  // Remove phone numbers
  if (PHONE_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(PHONE_REGEX, '')
    warnings.push('phones_removed')
  }

  // Remove email addresses
  if (EMAIL_REGEX.test(cleaned)) {
    cleaned = cleaned.replace(EMAIL_REGEX, '')
    warnings.push('emails_removed')
  }

  // Remove platform mentions
  if (PLATFORM_MENTIONS.test(cleaned)) {
    cleaned = cleaned.replace(PLATFORM_MENTIONS, '')
    warnings.push('platform_mentions_removed')
  }

  // Clean up extra whitespace
  cleaned = cleaned.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n').trim()

  // If cleaning emptied the response, use fallback
  if (cleaned.length < 10) {
    return { text: fallback, warnings: [...warnings, 'too_short_after_cleaning'], charCount: fallback.length }
  }

  // Truncate to max chars at last sentence boundary
  if (cleaned.length > maxChars) {
    cleaned = truncateAtBoundary(cleaned, maxChars)
    warnings.push('truncated')
  }

  return { text: cleaned, warnings, charCount: cleaned.length }
}

/**
 * Truncate text at the last period, exclamation, or question mark before maxLen.
 * Falls back to last space if no sentence boundary found.
 */
function truncateAtBoundary(text: string, maxLen: number): string {
  const sub = text.substring(0, maxLen)

  // Find last sentence-ending punctuation
  const lastPeriod = Math.max(
    sub.lastIndexOf('.'),
    sub.lastIndexOf('!'),
    sub.lastIndexOf('?'),
  )

  if (lastPeriod > maxLen * 0.5) {
    return sub.substring(0, lastPeriod + 1).trim()
  }

  // Fall back to last space
  const lastSpace = sub.lastIndexOf(' ')
  if (lastSpace > maxLen * 0.5) {
    return sub.substring(0, lastSpace).trim() + '...'
  }

  return sub.trim() + '...'
}
