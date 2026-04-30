// Google Gemini — Image understanding for WhatsApp image messages.
//
// Mirrors gemini-video.ts: invoked ONLY when an image arrives. Returns a
// short Portuguese factual description that goes into metadata.ai_description
// (Ana reads it via context-builder) and never into message.content (so the
// admin only sees the actual image rendered by MessageBubble).
//
// Reuses the same retry + model-fallback strategy as the video helper, since
// gemini-2.5-flash also throws 503 under peak load.

const PRIMARY_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.0-flash'

const PRIMARY_MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [1000, 2000, 4000]
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

// Inline upload limit. Images are typically well below this, but we cap
// defensively so we don't ship a 10MB base64 in a JSON request.
const MAX_INLINE_BYTES = 15 * 1024 * 1024

const ANALYSIS_PROMPT = `Você está analisando uma imagem enviada por um cliente da Budamix \
(loja de utensílios domésticos: vidro, cerâmica, porcelana) pelo WhatsApp.

Sua tarefa é descrever, em português brasileiro, o que aparece na imagem para \
que uma atendente possa entender a situação sem ver a foto.

Regras:
- Escreva em texto corrido, no máximo 3 frases.
- Foque no PRODUTO mostrado (cor, formato, material aparente, quantidade) e \
em PROBLEMAS visíveis (rachadura, lasca, mancha, embalagem amassada, peça \
quebrada, item errado, defeito).
- Se houver texto legível na imagem (etiqueta, nota, conversa de outro app, \
print de pedido), transcreva os trechos relevantes.
- Não invente detalhes; descreva apenas o que vê.
- Não responda ao cliente nem dê opinião; só descreva.
- Não use colchetes, hashtags ou prefixos; texto corrido apenas.`

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

export interface ImageAnalysis {
  description: string
  tokensUsed: number
  model: string
  attempts: number
}

class GeminiHttpError extends Error {
  status: number
  retryable: boolean
  constructor(status: number, body: string) {
    super(`Gemini Vision API error ${status}: ${body}`)
    this.status = status
    this.retryable = RETRYABLE_STATUSES.has(status)
  }
}

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'gemini-vision', step, ts: new Date().toISOString(), ...data }))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callGeminiOnce(
  model: string,
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<ImageAnalysis> {
  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: ANALYSIS_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 400,
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
    attempts: 1,
  }
}

/**
 * Send an image to Gemini with retry + model fallback. Same strategy as
 * analyzeVideo: 3 attempts on 2.5-flash with exponential backoff, then 1
 * attempt on 2.0-flash, then throw (caller falls back to caption-only).
 */
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
): Promise<ImageAnalysis> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const approxBytes = Math.floor(imageBase64.length * 0.75)
  if (approxBytes > MAX_INLINE_BYTES) {
    throw new Error(`image too large for inline upload (${approxBytes} > ${MAX_INLINE_BYTES})`)
  }

  const normalizedMime = (mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg'

  let lastError: unknown
  let totalAttempts = 0

  for (let attempt = 1; attempt <= PRIMARY_MAX_ATTEMPTS; attempt++) {
    totalAttempts++
    try {
      const result = await callGeminiOnce(PRIMARY_MODEL, apiKey, imageBase64, normalizedMime)
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
      if (!retryable) break
      if (attempt < PRIMARY_MAX_ATTEMPTS) {
        await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 4000)
      }
    }
  }

  totalAttempts++
  try {
    const result = await callGeminiOnce(FALLBACK_MODEL, apiKey, imageBase64, normalizedMime)
    log('fallback_model_ok', { model: FALLBACK_MODEL, totalAttempts })
    return { ...result, attempts: totalAttempts }
  } catch (err) {
    log('fallback_model_failed', {
      model: FALLBACK_MODEL,
      error: String(err).slice(0, 200),
    })
    throw lastError ?? err
  }
}
