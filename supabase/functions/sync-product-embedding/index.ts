// =================================================================
// SYNC-PRODUCT-EMBEDDING — Generate/update product embeddings
// =================================================================
// Modes:
//   1. Single product: { productId: uuid }
//   2. From DB webhook: { type: 'INSERT'|'UPDATE', record: {...} }
//   3. Batch sync all: { action: 'sync-all' }
//
// Uses OpenAI text-embedding-3-small (1536 dims) to generate
// embeddings from product data. Embeddings enable semantic search
// so "quero algo pra fazer drinks" matches coqueteleiras.
// =================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { generateEmbedding, buildProductSearchText } from '../_shared/embeddings.ts'

function log(step: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'sync-product-embedding', step, ts: new Date().toISOString(), ...data }))
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'method_not_allowed' })
    }

    const body = await req.json()

    // ─── MODE 1: Batch sync all products ──────────────────────
    if (body.action === 'sync-all') {
      return await syncAllProducts()
    }

    // ─── MODE 2: DB webhook (INSERT/UPDATE trigger) ───────────
    if (body.type && body.record) {
      const productId = body.record.id as string
      if (!productId) {
        return jsonResponse({ success: false, error: 'no_product_id_in_record' })
      }
      return await syncSingleProduct(productId)
    }

    // ─── MODE 3: Manual single product sync ───────────────────
    if (body.productId) {
      return await syncSingleProduct(body.productId as string)
    }

    return jsonResponse({ success: false, error: 'invalid_request', hint: 'Use { productId }, { action: "sync-all" }, or DB webhook format' })

  } catch (err) {
    log('error', { step: 'unhandled', error: String(err), stack: (err as Error).stack })
    return jsonResponse({ success: false, error: 'internal_error' })
  }
})

async function syncSingleProduct(productId: string): Promise<Response> {
  log('sync_start', { productId })

  // Load product from DB (source of truth)
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single()

  if (fetchError || !product) {
    log('error', { step: 'fetch_product', productId, error: fetchError?.message ?? 'not_found' })
    return jsonResponse({ success: false, error: 'product_not_found', productId })
  }

  // Build search text from EXACT product data (no additions)
  const searchText = buildProductSearchText(product)

  if (!searchText || searchText.trim().length === 0) {
    log('skip', { productId, reason: 'empty_search_text' })
    return jsonResponse({ success: true, productId, skipped: true, reason: 'empty_search_text' })
  }

  // Generate embedding via OpenAI
  const embedding = await generateEmbedding(searchText)

  // Save embedding + search_text to DB
  const { error: updateError } = await supabase
    .from('products')
    .update({
      embedding: JSON.stringify(embedding),
      search_text: searchText,
    })
    .eq('id', productId)

  if (updateError) {
    log('error', { step: 'save_embedding', productId, error: updateError.message })
    return jsonResponse({ success: false, error: 'save_failed', productId })
  }

  log('sync_done', { productId, searchTextLength: searchText.length, embeddingDims: embedding.length })

  return jsonResponse({
    success: true,
    productId,
    searchTextLength: searchText.length,
    embeddingDimensions: embedding.length,
  })
}

async function syncAllProducts(): Promise<Response> {
  log('batch_start', {})

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)

  if (error) {
    log('error', { step: 'fetch_all', error: error.message })
    return jsonResponse({ success: false, error: 'fetch_failed' })
  }

  if (!products || products.length === 0) {
    return jsonResponse({ success: true, synced: 0, total: 0, errors: [] })
  }

  let synced = 0
  const errors: Array<{ productId: string; error: string }> = []

  for (const product of products) {
    try {
      const searchText = buildProductSearchText(product)

      if (!searchText || searchText.trim().length === 0) {
        log('skip', { productId: product.id, reason: 'empty_search_text' })
        continue
      }

      const embedding = await generateEmbedding(searchText)

      const { error: updateError } = await supabase
        .from('products')
        .update({
          embedding: JSON.stringify(embedding),
          search_text: searchText,
        })
        .eq('id', product.id)

      if (updateError) {
        errors.push({ productId: product.id, error: updateError.message })
        log('error', { step: 'save_embedding', productId: product.id, error: updateError.message })
      } else {
        synced++
        log('synced', { productId: product.id, name: product.name })
      }

      // Rate limit: 200ms between OpenAI calls
      await new Promise(resolve => setTimeout(resolve, 200))

    } catch (err) {
      errors.push({ productId: product.id, error: String(err) })
      log('error', { step: 'sync_product', productId: product.id, error: String(err) })
    }
  }

  log('batch_done', { synced, total: products.length, errorCount: errors.length })

  return jsonResponse({
    success: true,
    synced,
    total: products.length,
    errors,
  })
}
