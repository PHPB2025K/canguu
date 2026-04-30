// ML OAuth Edge Function
// Routes: ?action=authorize | callback | refresh | status

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse, corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUser,
} from '../_shared/ml-api-client.ts'

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'ml-oauth', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') ?? ''

    switch (action) {
      case 'authorize':
        return handleAuthorize()

      case 'callback':
        return await handleCallback(url)

      case 'refresh':
        return await handleRefresh(req)

      case 'status':
        return await handleStatus()

      default:
        return jsonResponse({
          error: 'Invalid action. Use: authorize, callback, refresh, status',
        }, 400)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log('error', { error: message })
    return jsonResponse({ success: false, error: message }, 500)
  }
})

// =================================================================
// AUTHORIZE — Redirect to ML login page
// =================================================================

function handleAuthorize(): Response {
  const authUrl = getAuthorizationUrl()
  log('authorize', { url: authUrl })

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': authUrl,
    },
  })
}

// =================================================================
// CALLBACK — Receive auth code, exchange for token, save to DB
// =================================================================

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    log('callback_error', { error: errorParam })
    return htmlResponse(`
      <h1>Erro na autorização</h1>
      <p>${errorParam}</p>
      <p>Feche esta aba e tente novamente.</p>
    `, 400)
  }

  if (!code) {
    return htmlResponse(`
      <h1>Erro</h1>
      <p>Código de autorização não recebido.</p>
    `, 400)
  }

  log('callback', { code: code.substring(0, 10) + '...' })

  // Exchange code for tokens
  const tokenData = await exchangeCodeForToken(code)
  log('token_exchanged', { user_id: tokenData.user_id, expires_in: tokenData.expires_in })

  // Get user info
  const user = await getUser(tokenData.access_token)
  log('user_info', { id: user.id, nickname: user.nickname })

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
  const sellerId = String(tokenData.user_id)

  // Upsert token record
  const { error: upsertError } = await supabase
    .from('marketplace_tokens')
    .upsert(
      {
        platform: 'mercado_livre',
        seller_id: sellerId,
        app_id: Deno.env.get('ML_APP_ID') ?? '',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        seller_nickname: user.nickname,
        status: 'active',
        metadata: {
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          country_id: user.country_id,
        },
      },
      { onConflict: 'platform,seller_id' },
    )

  if (upsertError) {
    log('upsert_error', { error: upsertError.message })
    return htmlResponse(`
      <h1>Erro ao salvar token</h1>
      <p>${upsertError.message}</p>
    `, 500)
  }

  log('token_saved', { seller_id: sellerId, nickname: user.nickname })

  return htmlResponse(`
    <h1>Conectado com sucesso!</h1>
    <p>Conta Mercado Livre: <strong>${user.nickname}</strong></p>
    <p>Seller ID: ${sellerId}</p>
    <p>Token expira em: ${Math.round(tokenData.expires_in / 3600)} horas</p>
    <p>Pode fechar esta aba.</p>
  `)
}

// =================================================================
// REFRESH — Manually refresh token(s)
// =================================================================

async function handleRefresh(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Use POST for refresh' }, 405)
  }

  let sellerId: string | null = null
  try {
    const body = await req.json()
    sellerId = body.sellerId ?? null
  } catch {
    // No body = refresh all
  }

  // Build query
  let query = supabase
    .from('marketplace_tokens')
    .select('*')
    .eq('platform', 'mercado_livre')
    .in('status', ['active', 'expired'])

  if (sellerId) {
    query = query.eq('seller_id', sellerId)
  }

  const { data: tokens, error } = await query

  if (error || !tokens || tokens.length === 0) {
    return jsonResponse({ success: false, error: 'No tokens found to refresh', count: 0 })
  }

  const results: Array<{ sellerId: string; success: boolean; error?: string }> = []

  for (const token of tokens) {
    try {
      if (!token.refresh_token) {
        results.push({ sellerId: token.seller_id, success: false, error: 'No refresh_token' })
        continue
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

      results.push({ sellerId: token.seller_id, success: true })
      log('token_refreshed', { seller_id: token.seller_id })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ sellerId: token.seller_id, success: false, error: message })

      // Mark as expired if refresh failed
      await supabase
        .from('marketplace_tokens')
        .update({ status: 'expired' })
        .eq('id', token.id)

      log('refresh_failed', { seller_id: token.seller_id, error: message })
    }
  }

  return jsonResponse({ success: true, results })
}

// =================================================================
// STATUS — Show connected accounts
// =================================================================

async function handleStatus(): Promise<Response> {
  const { data: tokens, error } = await supabase
    .from('marketplace_tokens')
    .select('seller_id, seller_nickname, status, token_expires_at, created_at, updated_at')
    .eq('platform', 'mercado_livre')
    .order('created_at', { ascending: false })

  if (error) {
    return jsonResponse({ success: false, error: error.message }, 500)
  }

  const sellers = (tokens ?? []).map(t => ({
    sellerId: t.seller_id,
    nickname: t.seller_nickname,
    status: t.status,
    tokenExpiresAt: t.token_expires_at,
    isExpired: t.token_expires_at ? new Date(t.token_expires_at) < new Date() : true,
    connectedAt: t.created_at,
    lastUpdated: t.updated_at,
  }))

  return jsonResponse({
    success: true,
    platform: 'mercado_livre',
    connectedSellers: sellers.filter(s => s.status === 'active').length,
    sellers,
  })
}

// =================================================================
// HELPERS
// =================================================================

function htmlResponse(body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Budamix — Mercado Livre</title>
<style>body{font-family:system-ui,sans-serif;max-width:500px;margin:60px auto;padding:20px;text-align:center}
h1{color:#333}p{color:#666;line-height:1.6}strong{color:#2d3277}</style>
</head><body>${body}</body></html>`,
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  )
}
