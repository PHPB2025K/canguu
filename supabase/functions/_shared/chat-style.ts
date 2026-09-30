// A regex intentionally matches complete Unicode emoji sequences (ZWJ, modifiers and keycaps).
// eslint-disable-next-line no-misleading-character-class
const EMOJI_RE = /(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?)*|[\u{1F3FB}-\u{1F3FF}\u200D\uFE0E\uFE0F\u20E3])/gu;
const EMPTY_AFTER_FILTER_FALLBACK = 'Como posso te ajudar?';
const CHUNK_SEPARATOR = '\\\\';
const TEXT_SYMBOLS = new Set([
  '©',
  '®',
  '™'
]);
const CELEBRATION_RE = /\b(?:amei|amou|adorei|adorou|gostou|feliz|parab[eé]ns|perfeito|obrigad[oa]?|que\s+bom|fico\s+feliz|maravilh\w*|lind[oa]?|apaixon\w*|arrasou|sucesso)\b/iu;
const NEGATED_CELEBRATION_RE = /\bn[aã]o\s+(?:amei|amou|adorei|adorou|gostou|ficou\s+feliz)\b/iu;
const COMPLAINT_RE = /\b(?:quebrad\w*|atras\w*|problema|errad\w*|falt\w*|reclama\w*|p[eé]ssim\w*|chatead\w*|triste|danific\w*|defeit\w*|avariad\w*|machuc\w*|ferid\w*|trinc\w*|amass\w*|vaz\w*|incomplet\w*|n[aã]o\s+(?:cheg\w*|receb\w*)|decepcion\w*|cancel\w*|reembols\w*|troca)\b/iu;
function plainTextSymbol(token) {
  const plain = token.replace(/[\uFE0E\uFE0F]/gu, '');
  return TEXT_SYMBOLS.has(plain) ? plain : null;
}
function containsCustomerEmoji(text) {
  const matches = text.match(EMOJI_RE) ?? [];
  EMOJI_RE.lastIndex = 0;
  return matches.some((emoji)=>plainTextSymbol(emoji) === null);
}
function normalizeAfterEmojiRemoval(text) {
  const compact = text.replace(/[ \t]{2,}/g, ' ').replace(/\s*\\\s*/g, '\\').replace(/[ \t]+([,.;!?])/g, '$1').trim();
  return compact.split(CHUNK_SEPARATOR).map((chunk)=>chunk.trim()).filter(Boolean).join(CHUNK_SEPARATOR);
}
export function countMessageChunks(text) {
  const count = text.split(CHUNK_SEPARATOR).map((chunk)=>chunk.trim()).filter(Boolean).length;
  return Math.max(1, count);
}
/**
 * Emojis are removed by default. A single emoji may survive only when both the
 * customer and Ana are clearly celebratory, never in a complaint or an
 * operational reply. Text symbols such as copyright and trademark are kept.
 */ export function enforceRareEmojiPolicy(response, customerMessage) {
  const customerUsedEmoji = containsCustomerEmoji(customerMessage);
  const celebratory = CELEBRATION_RE.test(customerMessage) && CELEBRATION_RE.test(response);
  const complaint = COMPLAINT_RE.test(customerMessage) || NEGATED_CELEBRATION_RE.test(customerMessage);
  const mayKeepOne = customerUsedEmoji && celebratory && !complaint;
  let kept = false;
  const filtered = response.replace(EMOJI_RE, (emoji)=>{
    const textSymbol = plainTextSymbol(emoji);
    if (textSymbol !== null) return textSymbol;
    if (mayKeepOne && !kept) {
      kept = true;
      return emoji;
    }
    return ' ';
  });
  EMOJI_RE.lastIndex = 0;
  const normalized = normalizeAfterEmojiRemoval(filtered);
  return normalized || EMPTY_AFTER_FILTER_FALLBACK;
}
