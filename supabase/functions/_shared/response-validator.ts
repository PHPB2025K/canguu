// Response Validator — Post-processes AI responses for WhatsApp delivery
// Handles chunk validation, deduplication, formatting, and safety checks

const MAX_TOTAL_CHARS = 1500 // safety net
const MAX_CHUNKS = 4
const MAX_CHARS_PER_CHUNK = 200

const CONFIRMATION_WORDS = [
  'ótimo', 'perfeito', 'show', 'entendi', 'compreendi',
  'certo', 'beleza', 'maravilha', 'excelente', 'legal',
]

// Ana atende 24/7. Defesa em profundidade contra LLM hallucination da
// frase de horário comercial — regra 11 do system_prompt já proíbe, mas
// a Ana ignorou 11x em fev-mar/2026. Quando o detector aciona, a resposta
// inteira é substituída por uma versão segura — não tentamos "limpar"
// porque o resto da mensagem provavelmente também está errado.
const BUSINESS_HOURS_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bsegunda\s+(?:a|à|e)\s+sexta\b/i,                                        reason: 'segunda a sexta' },
  { pattern: /\b\d{1,2}\s*h(?:oras)?\s*(?:às|as|a|-|às\s+as)\s*\d{1,2}\s*h(?:oras)?\b/i, reason: 'janela Xh às Yh' },
  { pattern: /\bhor[áa]rio\s+(?:de\s+atendimento|comercial|de\s+expediente|do\s+expediente)\b/i, reason: 'horário de atendimento/comercial/expediente' },
  { pattern: /\bexpediente\b/i,                                                         reason: 'expediente' },
  { pattern: /\bresponderemos\s+assim\s+que\s+poss[íi]vel\b/i,                          reason: 'responderemos assim que possível' },
  { pattern: /\bretornaremos\s+(?:em\s+breve|assim\s+que)\b/i,                          reason: 'retornaremos em breve' },
  { pattern: /\bfora\s+(?:de|do)\s+(?:hor[áa]rio|expediente)\b/i,                       reason: 'fora do horário' },
  { pattern: /\batendimento\s+(?:est[áa]\s+)?fechad[oa]\b/i,                            reason: 'atendimento fechado' },
  { pattern: /\bestamos\s+fechad[oa]s\b/i,                                              reason: 'estamos fechados' },
  { pattern: /\bdeixe\s+sua\s+mensagem\b/i,                                             reason: 'deixe sua mensagem' },
  { pattern: /\bretornar?\s+(?:depois|amanh[ãa]|na\s+segunda)\b/i,                      reason: 'retornar depois/amanhã/segunda' },
]

const BUSINESS_HOURS_SAFE_REPLY = 'Estou disponível 24 horas por dia, 7 dias por semana. Como posso te ajudar? 😊'

/**
 * Detector puro — não muta. Retorna razões legíveis pra log/análise.
 * Exposto pra reutilização em testes e em outros pontos do pipeline.
 */
export function detectBusinessHoursLimit(text: string): string[] {
  const matches: string[] = []
  for (const { pattern, reason } of BUSINESS_HOURS_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) matches.push(reason)
  }
  return matches
}

// Overpromise em reclamação — Bloco 14/16 do system_prompt. A Ana pode
// SÓ (a) coletar dados, (b) confirmar recebimento, (c) encaminhar pra
// equipe. NÃO pode prometer "resolver", "vou solucionar" ou "rapidinho"
// (prazo). Quando detecta, substituímos a frase INLINE (regex replace)
// em vez de rejeitar a resposta inteira — coleta de dados costuma estar
// correta, só o verbo precisa ser trocado pelo de encaminhamento.
//
// Caso real (25/05, conversa Grace Kelly): "Pra eu resolver isso pra
// você, pode me enviar... Com essas informações consigo encaminhar seu
// caso rapidinho!" — viola Bloco 14 mesmo com coleta de dados correta.
// Nota sobre regex: JavaScript `\b` é ASCII-only, então fronteiras após
// letras acentuadas (ê, ç, á) não casam. Usar flag `u` + `(?!\p{L})`
// pra fronteiras Unicode-aware quando o pattern termina em char acentuado.
const COMPLAINT_OVERPROMISE_PATTERNS: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  {
    pattern: /\bpra\s+eu\s+resolver\s+isso\s+pra\s+(?:voc[eê]|ti)(?!\p{L})/giu,
    replacement: 'pra eu encaminhar pra equipe',
    reason: 'pra eu resolver isso pra você',
  },
  {
    pattern: /\b(?:vou|consigo|posso)\s+resolver\s+(?:isso|pra\s+voc[eê]|o\s+seu\s+caso|tudo\s+isso)(?!\p{L})/giu,
    replacement: 'vou encaminhar pra equipe',
    reason: 'vou/consigo resolver',
  },
  {
    pattern: /\b(?:consigo|vou|posso)\s+encaminhar\s+(?:seu\s+caso\s+|isso\s+)?rapidinho\b/gi,
    replacement: 'vou encaminhar seu caso pra equipe',
    reason: 'encaminhar rapidinho',
  },
  {
    pattern: /\b(?:vou|consigo|posso)\s+(?:solucionar|cuidar\s+disso)\b/gi,
    replacement: 'vou encaminhar pra equipe',
    reason: 'vou solucionar/cuidar disso',
  },
  // "Vou resolver agora mesmo" / "vou resolver já"
  {
    pattern: /\bvou\s+resolver\s+(?:agora|j[áa])(?!\p{L})[^.!?\\]*/giu,
    replacement: 'vou encaminhar pra equipe',
    reason: 'vou resolver agora/já',
  },
]

/**
 * Detector puro de overpromise em reclamação.
 */
export function detectComplaintOverpromise(text: string): string[] {
  const matches: string[] = []
  for (const { pattern, reason } of COMPLAINT_OVERPROMISE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.replace('g', ''))
    if (re.test(text)) matches.push(reason)
  }
  return matches
}

export interface ValidationResult {
  text: string
  warnings: string[]
  chunkCount: number
  totalChars: number
}

/**
 * Validate and clean an AI-generated response for WhatsApp delivery.
 * Enforces chunk limits, removes duplicates, and fixes formatting.
 */
export function validateResponse(text: string): ValidationResult {
  const warnings: string[] = []

  // Empty check
  if (!text || text.trim().length === 0) {
    return {
      text: 'Desculpe, não consegui processar sua mensagem. Pode tentar novamente? 😊',
      warnings: ['empty_response'],
      chunkCount: 1,
      totalChars: 74,
    }
  }

  // HARD BLOCK: Ana atende 24/7. Substituir a resposta inteira (não tentar
  // remendar) — uma resposta com "segunda a sexta" provavelmente também
  // contém outras suposições erradas sobre horário/disponibilidade.
  const businessHoursReasons = detectBusinessHoursLimit(text)
  if (businessHoursReasons.length > 0) {
    return {
      text: BUSINESS_HOURS_SAFE_REPLY,
      warnings: [
        'business_hours_blocked_substituted',
        ...businessHoursReasons.map(r => `forbidden_business_hours:${r}`),
      ],
      chunkCount: 1,
      totalChars: BUSINESS_HOURS_SAFE_REPLY.length,
    }
  }

  let cleaned = text.trim()

  // ─── Overpromise em reclamação (Bloco 14/16) ─────────────────
  // Substituição INLINE (diferente do business_hours que rejeita resposta
  // inteira) — a coleta de dados costuma estar correta, só o verbo precisa
  // ser trocado. Mantém continuidade pro cliente, evita micro-promessa.
  for (const { pattern, replacement, reason } of COMPLAINT_OVERPROMISE_PATTERNS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, replacement)
      warnings.push(`complaint_overpromise_cleaned:${reason}`)
    }
  }

  // ─── Remove AI self-references ────────────────────────────────
  cleaned = cleaned
    .replace(/como (uma? )?(?:IA|inteligência artificial|assistente virtual|modelo de linguagem)/gi, '')
    .replace(/eu sou (uma? )?(?:IA|inteligência artificial|modelo)/gi, '')
    .replace(/enquanto (uma? )?(?:IA|inteligência artificial)/gi, '')

  // ─── Remove leaked meta-reasoning (3-layer defense) ────────────
  const originalLength = cleaned.length
  cleaned = filterMetaReasoning(cleaned, warnings)

  // If filtering removed >70% of text OR left it empty, entire response was reasoning
  if (!cleaned || cleaned.trim().length === 0 || cleaned.length < originalLength * 0.3) {
    return {
      text: 'Oi! Como posso te ajudar? 😊',
      warnings: [...warnings, 'meta_reasoning_fallback'],
      chunkCount: 1,
      totalChars: 29,
    }
  }

  // ─── Markdown → WhatsApp formatting ──────────────────────────
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '*$1*')
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')

  // ─── Chunk validation ─────────────────────────────────────────
  // Split into chunks by \\ separator (each chunk becomes a separate WhatsApp message)
  let chunks = cleaned.split('\\\\').map(c => c.trim()).filter(c => c.length > 0)

  // Fallback: if AI didn't use \\ separator, try \n\n (legacy behavior)
  if (chunks.length <= 1 && cleaned.includes('\n\n')) {
    const nnChunks = cleaned.split(/\n\n+/).filter(c => c.trim().length > 0)
    if (nnChunks.length > 1) {
      chunks = nnChunks
    }
  }

  // Remove duplicate chunks (exact match after normalization)
  chunks = removeDuplicateChunks(chunks, warnings)

  // Remove redundant confirmations
  chunks = removeRedundantConfirmations(chunks, warnings)

  // Warn on long chunks
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length > MAX_CHARS_PER_CHUNK) {
      warnings.push(`chunk_too_long:${i}`)
    }
  }

  // Truncate to max chunks
  if (chunks.length > MAX_CHUNKS) {
    warnings.push('exceeded_chunk_limit')
    chunks = chunks.slice(0, MAX_CHUNKS)
  }

  cleaned = chunks.join('\\\\')

  // ─── Safety truncate ──────────────────────────────────────────
  if (cleaned.length > MAX_TOTAL_CHARS) {
    cleaned = cleaned.substring(0, MAX_TOTAL_CHARS - 3) + '...'
    warnings.push('truncated')
  }

  // ─── Price warning ────────────────────────────────────────────
  const priceMatches = cleaned.match(/R\$\s*[\d.,]+/g)
  if (priceMatches && priceMatches.length > 3) {
    warnings.push('multiple_prices_mentioned')
  }

  // Clean up extra whitespace
  cleaned = cleaned.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  const finalChunks = cleaned.split('\\\\').map(c => c.trim()).filter(c => c.length > 0)

  return {
    text: cleaned,
    warnings,
    chunkCount: finalChunks.length,
    totalChars: cleaned.length,
  }
}

/**
 * Remove chunks that are exact duplicates after normalization.
 * Also detect chunks starting with the same 5 words.
 */
function removeDuplicateChunks(chunks: string[], warnings: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const chunk of chunks) {
    const normalized = chunk.toLowerCase().trim()

    if (seen.has(normalized)) {
      warnings.push('duplicate_chunk_removed')
      continue
    }

    // Check for similar starts (same first 5 words)
    const words = normalized.split(/\s+/).slice(0, 5).join(' ')
    for (const existing of result) {
      const existingWords = existing.toLowerCase().trim().split(/\s+/).slice(0, 5).join(' ')
      if (words.length > 10 && words === existingWords) {
        warnings.push('possible_duplicate')
        break
      }
    }

    seen.add(normalized)
    result.push(chunk)
  }

  return result
}

/**
 * Filter meta-reasoning leaked by the AI model.
 * Uses generic pattern detection (not just a blocklist).
 * Returns cleaned text with meta-reasoning removed.
 */
function filterMetaReasoning(text: string, warnings: string[]): string {
  let cleaned = text

  // ── Layer A: Blocklist (exact phrases known from past incidents) ──
  const blocklist = [
    /^Não tenho contexto suficiente[^\\]*/i,
    /^Preciso verificar[^\\]*/i,
    /nenhum produto foi carregado[^\\]*/i,
    /não consigo acessar[^\\]*/i,
    /erro ao buscar[^\\]*/i,
    /não foram encontrados produtos[^\\]*/i,
    /sem produtos? disponíve[il]s? no momento/i,
    /\bnull\b|\bundefined\b|\bNaN\b/,
  ]
  for (const pattern of blocklist) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '').trim()
      warnings.push('meta_blocklist_hit')
    }
  }

  // ── Layer B: Generic pattern detection (regex) ──────────────────

  // B1: Self-reference in third person
  const selfRefPattern = /\b(?:a ana|o agente|a atendente|o sistema|o assistente)\b/i
  // B2: References to technical context/history
  const contextRefPattern = /\b(?:o contexto|o histórico|conversa anterior|mensagem anterior|sem mensagem|sem contexto|no log|no registro)\b/i
  // B3: Reasoning verbs in first person
  const reasoningVerbPattern = /\b(?:analis|verific|consider|identific|observ|conclu|determin|avali)(?:ando|ei|o que)\b/i
  // B4: Meta-conditional language
  const metaConditionalPattern = /\b(?:dado que|com base n[oa]|levando em conta|a partir d[eo]s? dados?|de acordo com o contexto)\b/i
  // B5: Response prefixes
  const prefixPattern = /^(?:resposta|mensagem|ana|nota|obs):\s*/i
  // B6: Parenthetical meta notes
  const parenMetaPattern = /\([^)]*(?:verificando|analisando|pensando|nota interna|contexto)[^)]*\)/gi
  // B7: Dashes introducing meta-commentary (--- separator followed by content)
  const dashSeparator = /^-{3,}.*$/gm

  // Apply prefix removal first
  cleaned = cleaned.replace(prefixPattern, '')
  // Remove parenthetical meta notes
  cleaned = cleaned.replace(parenMetaPattern, (match) => {
    warnings.push('meta_paren_removed')
    return ''
  })
  // Remove dash separators
  cleaned = cleaned.replace(dashSeparator, (match) => {
    warnings.push('meta_separator_removed')
    return ''
  })

  // ── Layer C: Chunk-level filtering ──────────────────────────────
  // Split into chunks, test each one, remove chunks that are reasoning
  const separator = cleaned.includes('\\\\') ? '\\\\' : '\n\n'
  const rawChunks = cleaned.split(separator).map(c => c.trim()).filter(c => c.length > 0)

  const cleanChunks: string[] = []
  for (const chunk of rawChunks) {
    // Count how many meta-signals this chunk has
    let metaScore = 0
    if (selfRefPattern.test(chunk)) metaScore += 2
    if (contextRefPattern.test(chunk)) metaScore += 2
    if (reasoningVerbPattern.test(chunk)) metaScore += 2
    if (metaConditionalPattern.test(chunk)) metaScore += 2

    // Any single strong signal is enough to remove a short chunk
    if (metaScore >= 2 && chunk.length < 300) {
      warnings.push('meta_chunk_removed')
      continue
    }
    // Skip oversized chunks (>300 chars without product/price markers = likely reasoning)
    if (chunk.length > 300 && !chunk.includes('R$') && !chunk.includes('*')) {
      warnings.push('meta_oversized_chunk_removed')
      continue
    }

    cleanChunks.push(chunk)
  }

  return cleanChunks.join(separator === '\\\\' ? '\\\\' : '\n\n').trim()
}

/**
 * If 2+ chunks start with a confirmation word, keep only the first.
 */
function removeRedundantConfirmations(chunks: string[], warnings: string[]): string[] {
  let confirmationFound = false
  const result: string[] = []

  for (const chunk of chunks) {
    const firstWord = chunk.trim().split(/[\s!.,]+/)[0].toLowerCase()
    const isConfirmation = CONFIRMATION_WORDS.some(w => firstWord === w)

    if (isConfirmation && confirmationFound) {
      warnings.push('redundant_confirmation_removed')
      // Keep the rest of the chunk if it has substantive content after the confirmation
      const afterConfirmation = chunk.replace(/^[^\s!.,]+[!.,\s]*/i, '').trim()
      if (afterConfirmation.length > 30) {
        result.push(afterConfirmation)
      }
      continue
    }

    if (isConfirmation) {
      confirmationFound = true
    }

    result.push(chunk)
  }

  return result
}
