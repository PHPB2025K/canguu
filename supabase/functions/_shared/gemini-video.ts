// Google Gemini — Video understanding for WhatsApp video messages.
//
// Isolated module: Gemini is invoked ONLY when the customer sends a video.
// It returns a Portuguese factual description (visual + audio) that becomes
// the message.content the rest of the pipeline reads. Everything else (intent
// classification, response generation, conversation memory) stays on Claude.
//
// To swap providers later, replace the body of analyzeVideo() — the contract
// (base64 in, descriptive string out) is the only thing the webhook depends on.

// Primary model. Falls back to the secondary one only when the primary
// returns transient errors enough times in a row.
const PRIMARY_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.0-flash'

const PRIMARY_MAX_ATTEMPTS = 3 // tries against PRIMARY_MODEL before falling back
const RETRY_DELAYS_MS = [1000, 2000, 4000] // backoff between attempts

// HTTP statuses Google considers safe to retry. 408/429/5xx are transient;
// 400/401/403/404 mean the call itself is bad and retrying won't help.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

// Inline upload limit (Gemini accepts up to 20MB inline). WhatsApp tops out
// well below that. If we ever overflow, we can switch to the Files API.
const MAX_INLINE_BYTES = 20 * 1024 * 1024

const ANALYSIS_PROMPT = `Você está analisando um vídeo curto enviado por um cliente da Budamix \
(loja de utensílios domésticos: vidro, cerâmica, porcelana) pelo WhatsApp.

Sua tarefa é descrever, em português brasileiro, o que aparece e o que é dito \
no vídeo, para que uma atendente possa entender a situação sem assistir.

Regras:
- Escreva em texto corrido, no máximo 4 frases.
- Foque no PRODUTO mostrado (cor, formato, material aparente), em PROBLEMAS \
visíveis (rachadura, lascas, manchas, embalagem amassada, peça quebrada, \
quantidade errada) e no que a pessoa FALA no áudio.
- Inclua entre aspas qualquer trecho relevante do que foi dito.
- Não invente detalhes; descreva apenas o que vê e ouve. Se o áudio estiver \
mudo ou inaudível, diga isso explicitamente.
- Não responda ao cliente nem dê opinião; só descreva.
- Não use colchetes nem hashtags; texto corrido apenas.`

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
      role?: string
    }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  promptFeedback?: {
    blockReason?: string
  }
}

export interface VideoAnalysis {
  description: string
  tokensUsed: number
  model: string
  attempts: number
}

class GeminiHttpError extends Error {
  status: number
  retryable: boolean
  constructor(status: number, body: string) {
    super(`Gemini API error ${status}: ${body}`)
    this.status = status
    this.retryable = RETRYABLE_STATUSES.has(status)
  }
}

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'gemini-video', step, ts: new Date().toISOString(), ...data }))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Single attempt against a specific model. Throws GeminiHttpError on HTTP
 * failures (with .retryable flagged) and a plain Error for parsing/empty
 * results (which we treat as non-retryable — usually a content filter).
 */
async function callGeminiOnce(
  model: string,
  apiKey: string,
  videoBase64: string,
  mimeType: string,
): Promise<VideoAnalysis> {
  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: videoBase64 } },
        { text: ANALYSIS_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 600,
      responseMimeType: 'text/plain',
    },
  }

  const response = await fetch(`${geminiUrl(model)}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new GeminiHttpError(response.status, errorText.slice(0, 500))
  }

  const result = await response.json() as GeminiResponse

  if (result.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${result.promptFeedback.blockReason}`)
  }

  const description = result.candidates?.[0]?.content?.parts
    ?.map(p => p.text ?? '')
    .join('')
    .trim() ?? ''

  if (!description) {
    throw new Error('Gemini returned an empty description')
  }

  return {
    description,
    tokensUsed: result.usageMetadata?.totalTokenCount ?? 0,
    model,
    attempts: 1, // overwritten by analyzeVideo
  }
}

/**
 * Send a video to Gemini with retry + model fallback.
 *
 * Strategy:
 *   1. Try gemini-2.5-flash up to 3 times with exponential backoff
 *      (1s, 2s, 4s). Retry only on transient HTTP statuses.
 *   2. If all 3 fail with retryable errors, try gemini-2.0-flash once.
 *   3. If that also fails, throw — the webhook then falls back to
 *      Whisper-only audio transcription.
 *
 * Non-retryable errors (400 bad request, 401 bad key, 403 quota,
 * content blocked, empty response) bail out immediately and skip to
 * the model fallback.
 */
export async function analyzeVideo(
  videoBase64: string,
  mimeType: string,
): Promise<VideoAnalysis> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  // base64 length × 0.75 ≈ raw byte size
  const approxBytes = Math.floor(videoBase64.length * 0.75)
  if (approxBytes > MAX_INLINE_BYTES) {
    throw new Error(`video too large for inline upload (${approxBytes} bytes > ${MAX_INLINE_BYTES})`)
  }

  // Normalize mime — WhatsApp sometimes sends 'video/mp4; codecs=...'
  const normalizedMime = (mimeType || 'video/mp4').split(';')[0].trim() || 'video/mp4'

  let lastError: unknown
  let totalAttempts = 0

  // Phase 1: primary model with retries
  for (let attempt = 1; attempt <= PRIMARY_MAX_ATTEMPTS; attempt++) {
    totalAttempts++
    try {
      const result = await callGeminiOnce(PRIMARY_MODEL, apiKey, videoBase64, normalizedMime)
      return { ...result, attempts: totalAttempts }
    } catch (err) {
      lastError = err
      const retryable = err instanceof GeminiHttpError && err.retryable
      log('attempt_failed', {
        model: PRIMARY_MODEL,
        attempt,
        retryable,
        status: err instanceof GeminiHttpError ? err.status : null,
        error: String(err).slice(0, 200),
      })
      if (!retryable) break // permanent error (400/401/403 or empty/blocked) — go to fallback model
      if (attempt < PRIMARY_MAX_ATTEMPTS) {
        await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 4000)
      }
    }
  }

  // Phase 2: fallback model, single attempt
  totalAttempts++
  try {
    const result = await callGeminiOnce(FALLBACK_MODEL, apiKey, videoBase64, normalizedMime)
    log('fallback_model_ok', { model: FALLBACK_MODEL, totalAttempts })
    return { ...result, attempts: totalAttempts }
  } catch (err) {
    log('fallback_model_failed', {
      model: FALLBACK_MODEL,
      error: String(err).slice(0, 200),
    })
    // Re-throw the original primary error if available — more informative for ops
    throw lastError ?? err
  }
}
