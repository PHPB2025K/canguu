// ML Response Validator — Post-processes AI responses for Mercado Livre
// Strips emojis, links, platform mentions, enforces char limits

const ML_QUESTION_FALLBACK = 'Ola! Obrigado pela pergunta. Vou verificar essa informacao e retorno em breve. Qualquer outra duvida, estamos a disposicao!'
const ML_MESSAGE_FALLBACK = 'Obrigado pela mensagem. Vamos verificar e retornamos em breve.'

// Patterns to remove
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu
const URL_REGEX = /https?:\/\/[^\s)]+/gi
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{4,5}[-.\s]?\d{4}/g
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PLATFORM_MENTIONS = /\b(shopee|amazon|site\s+pr[oó]prio|whatsapp|wpp|instagram|facebook|telegram|tiktok\s*shop)\b/gi
const CHUNK_SEPARATOR = /\\\\/g

export interface MLValidationResult {
  text: string
  warnings: string[]
  charCount: number
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
