// ML Response Validator — Post-processes AI responses for Mercado Livre
// Strips emojis, links, platform mentions, enforces char limits
//
// As LISTAS de padrões proibidos vivem na CARTILHA ÚNICA (marketplace-rules.ts)
// — compartilhadas com o prompt de geração, o juiz do daily-learning-review e
// o gate de aprovação do painel. Aqui só se aplica o enforcement.

import {
  FORBIDDEN_CONTACT_PATTERNS,
  FORBIDDEN_ADMIN_LEAK_PATTERNS,
  detectForbiddenClaims,
  EMOJI_PATTERN_SOURCE,
  CLEAN_FALLBACK_ML,
  CLEAN_FALLBACK_ML_MESSAGE,
} from './marketplace-rules.ts'

export { detectForbiddenClaims }

// Fallbacks limpos da cartilha. O antigo "Vou conferir essa informacao e te
// retorno em breve" violava as próprias regras do validador (promessa de
// retorno em canal público) — corrigido 03/07/2026.
const ML_QUESTION_FALLBACK = CLEAN_FALLBACK_ML
const ML_MESSAGE_FALLBACK = CLEAN_FALLBACK_ML_MESSAGE

// Patterns to remove
const EMOJI_REGEX = new RegExp(EMOJI_PATTERN_SOURCE, 'gu')
const URL_REGEX = /https?:\/\/[^\s)]+/gi
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{4,5}[-.\s]?\d{4}/g
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PLATFORM_MENTIONS = /\b(shopee|amazon|site\s+pr[oó]prio|whatsapp|wpp|instagram|facebook|telegram|tiktok\s*shop)\b/gi
const CHUNK_SEPARATOR = /\\\\/g

// HARD BLOCKERS — phrases that violate ML policy or Budamix tone rules.
// Three categories share the same downstream behavior (RAG substitution
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
//
//  3. CLAIM (added 2026-07-03) — any mention of reclamação/disputa/mediação.
//     Orienting the buyer to open a claim tanks the account reputation.
//     Pattern lists live in marketplace-rules.ts (single source of truth).

export interface MLValidationResult {
  text: string
  warnings: string[]
  charCount: number
  /** True when ANY hard-block pattern matched (contact, admin leak OR claim).
   *  Field name kept for backwards compat with existing callers; the
   *  semantic is "response was rejected as a whole and must be substituted".
   *  When true, `text` is empty — the caller must substitute it. */
  forbiddenContactDetected?: boolean
  /** All matched reasons, regardless of category. */
  forbiddenContactReasons?: string[]
  /** Granular flag for telemetry: true when admin-leak phrases matched
   *  (e.g. "não temos no cadastro", "atualizaremos o anúncio"). */
  forbiddenAdminLeakDetected?: boolean
  /** Granular flag for telemetry: true when claim-mention phrases matched
   *  (reclamação/disputa/mediação — proibido absoluto em marketplace). */
  forbiddenClaimDetected?: boolean
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
  // Three pattern families are checked. They share the same outcome (block +
  // substitute) but are reported separately for telemetry.
  const contactReasons = detectForbiddenContactRequest(text)
  const adminLeakReasons = detectForbiddenAdminLeak(text)
  const claimReasons = detectForbiddenClaims(text)
  const allReasons = [...contactReasons, ...adminLeakReasons, ...claimReasons]
  if (allReasons.length > 0) {
    return {
      text: '', // empty signals the caller to substitute
      warnings: [
        ...contactReasons.map(r => `forbidden_contact:${r}`),
        ...adminLeakReasons.map(r => `forbidden_admin_leak:${r}`),
        ...claimReasons.map(r => `forbidden_claim:${r}`),
      ],
      charCount: 0,
      forbiddenContactDetected: true, // back-compat: callers use this to branch
      forbiddenContactReasons: allReasons,
      forbiddenAdminLeakDetected: adminLeakReasons.length > 0,
      forbiddenClaimDetected: claimReasons.length > 0,
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
