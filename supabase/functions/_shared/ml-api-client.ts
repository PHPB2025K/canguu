// Mercado Livre API client
// Handles OAuth, questions, items, messages, and orders

import { supabase } from './supabase-client.ts'
import type {
  MLTokenResponse,
  MLQuestion,
  MLQuestionsResponse,
  MLItem,
  MLItemDescription,
  MLMessage,
  MLMessagesResponse,
  MLOrder,
  MLUser,
  MarketplaceToken,
} from './ml-types.ts'

// ------ Constants ------

const ML_API_BASE = 'https://api.mercadolibre.com'
const ML_AUTH_URL = 'https://auth.mercadolibre.com'
const MAX_RETRIES = 2
const RETRY_DELAYS = [1000, 2000]

// ------ Env vars (lazy) ------

const getAppId = () => Deno.env.get('ML_APP_ID') ?? ''
const getClientSecret = () => Deno.env.get('ML_CLIENT_SECRET') ?? ''
const getRedirectUri = () => Deno.env.get('ML_REDIRECT_URI') ?? ''

// ------ Internal fetch wrapper with retry ------

async function mlFetch<T>(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)

      if (res.ok) {
        const text = await res.text()
        return text ? JSON.parse(text) as T : ({} as T)
      }

      // 401 = token expired — don't retry here, caller handles refresh
      if (res.status === 401) {
        const errText = await res.text()
        throw new MLAuthError(`Token expired or invalid (401): ${errText}`)
      }

      // 429 = rate limited — retry with longer delay
      if (res.status === 429 && attempt < retries) {
        await sleep(RETRY_DELAYS[attempt] ?? 2000)
        continue
      }

      const errText = await res.text()
      lastError = new Error(`ML API error ${res.status}: ${errText}`)

      // Retry on 5xx
      if (res.status >= 500 && attempt < retries) {
        await sleep(RETRY_DELAYS[attempt] ?? 1000)
        continue
      }

      throw lastError
    } catch (error) {
      if (error instanceof MLAuthError) throw error
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < retries) {
        await sleep(RETRY_DELAYS[attempt] ?? 1000)
        continue
      }
    }
  }

  throw lastError ?? new Error('ML API request failed after retries')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

// ------ Custom error for auth failures ------

export class MLAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MLAuthError'
  }
}

// =================================================================
// OAUTH
// =================================================================

/** Build the authorization URL for ML OAuth flow */
export function getAuthorizationUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getAppId(),
    redirect_uri: getRedirectUri(),
  })
  return `${ML_AUTH_URL}/authorization?${params.toString()}`
}

/** Exchange authorization code for access + refresh tokens */
export async function exchangeCodeForToken(code: string): Promise<MLTokenResponse> {
  return mlFetch<MLTokenResponse>(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: getAppId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUri(),
    }),
  })
}

/** Refresh an expired access token */
export async function refreshAccessToken(refreshToken: string): Promise<MLTokenResponse> {
  return mlFetch<MLTokenResponse>(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: getAppId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
    }),
  })
}

// =================================================================
// TOKEN MANAGEMENT (DB-backed)
// =================================================================

/**
 * Get a valid access token for a seller.
 * Auto-refreshes if expired (with 5min buffer).
 */
export async function getValidToken(sellerId: string): Promise<string> {
  const { data, error } = await supabase
    .from('marketplace_tokens')
    .select('*')
    .eq('platform', 'mercado_livre')
    .eq('seller_id', sellerId)
    .eq('status', 'active')
    .single()

  if (error || !data) {
    throw new Error(`No active token found for seller ${sellerId}`)
  }

  const token = data as MarketplaceToken

  // Check if token expires within 5 minutes
  const expiresAt = token.token_expires_at ? new Date(token.token_expires_at).getTime() : 0
  const bufferMs = 5 * 60 * 1000
  const now = Date.now()

  if (expiresAt > now + bufferMs && token.access_token) {
    return token.access_token
  }

  // Token expired or about to expire — refresh
  if (!token.refresh_token) {
    // Mark as expired and throw
    await supabase
      .from('marketplace_tokens')
      .update({ status: 'expired' })
      .eq('id', token.id)
    throw new Error(`Token expired and no refresh_token for seller ${sellerId}`)
  }

  const newTokenData = await refreshAccessToken(token.refresh_token)

  const newExpiresAt = new Date(Date.now() + newTokenData.expires_in * 1000).toISOString()

  await supabase
    .from('marketplace_tokens')
    .update({
      access_token: newTokenData.access_token,
      refresh_token: newTokenData.refresh_token,
      token_expires_at: newExpiresAt,
      status: 'active',
    })
    .eq('id', token.id)

  return newTokenData.access_token
}

// =================================================================
// QUESTIONS (pre-sale)
// =================================================================

/** Get unanswered questions for a seller */
export async function getUnansweredQuestions(
  accessToken: string,
  sellerId: string,
): Promise<MLQuestion[]> {
  const params = new URLSearchParams({
    seller_id: sellerId,
    status: 'UNANSWERED',
    sort_fields: 'date_created',
    sort_types: 'DESC',
    api_version: '4',
  })

  const result = await mlFetch<MLQuestionsResponse>(
    `${ML_API_BASE}/questions/search?${params.toString()}`,
    { headers: authHeaders(accessToken) },
  )

  return result.questions ?? []
}

/** Get a single question by ID */
export async function getQuestionById(
  accessToken: string,
  questionId: number,
): Promise<MLQuestion> {
  return mlFetch<MLQuestion>(
    `${ML_API_BASE}/questions/${questionId}`,
    { headers: authHeaders(accessToken) },
  )
}

/** Answer a question */
export async function answerQuestion(
  accessToken: string,
  questionId: number,
  answerText: string,
): Promise<void> {
  await mlFetch<unknown>(
    `${ML_API_BASE}/answers`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        question_id: questionId,
        text: answerText,
      }),
    },
  )
}

// =================================================================
// ITEMS (products) — public endpoints, no token needed
// =================================================================

/** Get item details (public) */
export async function getItem(itemId: string): Promise<MLItem> {
  return mlFetch<MLItem>(`${ML_API_BASE}/items/${itemId}`)
}

/** Get item description (public) */
export async function getItemDescription(itemId: string): Promise<string> {
  const desc = await mlFetch<MLItemDescription>(
    `${ML_API_BASE}/items/${itemId}/description`,
  )
  return desc.plain_text || desc.text || ''
}

// =================================================================
// MESSAGES (post-sale)
// =================================================================

/** Get messages for a pack/order */
export async function getMessages(
  accessToken: string,
  packId: string,
): Promise<MLMessage[]> {
  const result = await mlFetch<MLMessagesResponse>(
    `${ML_API_BASE}/messages/packs/${packId}/sellers/${await getSellerIdFromToken(accessToken)}`,
    { headers: authHeaders(accessToken) },
  )
  return result.results ?? []
}

/** Send a message in a post-sale conversation */
export async function sendMessage(
  accessToken: string,
  packId: string,
  text: string,
  buyerId: number,
): Promise<void> {
  await mlFetch<unknown>(
    `${ML_API_BASE}/messages/packs/${packId}/sellers/${await getSellerIdFromToken(accessToken)}`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        from: { user_id: await getSellerIdFromToken(accessToken) },
        to: { user_id: buyerId },
        text,
      }),
    },
  )
}

// =================================================================
// ORDERS
// =================================================================

/** Get order details */
export async function getOrder(
  accessToken: string,
  orderId: string,
): Promise<MLOrder> {
  return mlFetch<MLOrder>(
    `${ML_API_BASE}/orders/${orderId}`,
    { headers: authHeaders(accessToken) },
  )
}

// =================================================================
// USER
// =================================================================

/** Get authenticated user info */
export async function getUser(accessToken: string): Promise<MLUser> {
  return mlFetch<MLUser>(
    `${ML_API_BASE}/users/me`,
    { headers: authHeaders(accessToken) },
  )
}

// =================================================================
// HELPERS
// =================================================================

/** Extract seller user_id from token endpoint (cached per request via /users/me) */
async function getSellerIdFromToken(accessToken: string): Promise<number> {
  const user = await getUser(accessToken)
  return user.id
}
