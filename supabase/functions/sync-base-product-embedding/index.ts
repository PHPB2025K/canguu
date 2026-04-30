// Generate embeddings for base_products table
// Uses OpenAI text-embedding-3-small (1536 dims)
// Idempotent: only processes records where embedding IS NULL

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
const MODEL = 'text-embedding-3-small'

function getKey(): string {
  const k = Deno.env.get('OPENAI_API_KEY')
  if (!k) throw new Error('OPENAI_API_KEY not set')
  return k
}

function buildSearchText(bp: Record<string, unknown>): string {
  const parts: string[] = []
  if (bp.name) parts.push(`Produto: ${bp.name}`)
  if (bp.sku_base) parts.push(`SKU: ${bp.sku_base}`)

  const meta: string[] = []
  if (bp.category) meta.push(`Categoria: ${bp.category}`)
  if (bp.line) meta.push(`Linha: ${bp.line}`)
  if (bp.material) meta.push(`Material: ${bp.material}`)
  if (meta.length) parts.push(meta.join(' | '))

  const attrs: string[] = []
  if (bp.color) attrs.push(`Cor: ${bp.color}`)
  if (bp.capacity) attrs.push(`Capacidade: ${bp.capacity}`)
  if (attrs.length) parts.push(attrs.join(' | '))

  if (bp.description_short) parts.push(`Descrição: ${bp.description_short}`)
  if (bp.description_full) parts.push(String(bp.description_full))
  if (bp.usage_suggestions) parts.push(`Sugestões de uso: ${bp.usage_suggestions}`)
  if (bp.differentials) parts.push(`Diferenciais: ${bp.differentials}`)

  const tags = bp.tags as string[] | null
  if (tags?.length) parts.push(`Tags: ${tags.join(', ')}`)

  return parts.join('\n')
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input: text }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data[0].embedding
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Targeted mode: { baseProductId } forces re-embedding of a single row
    // (triggered by notify_base_product_embedding after content changes).
    // Batch mode: no body → fills every row where embedding IS NULL.
    let targetId: string | null = null
    if (req.method === 'POST') {
      try {
        const body = await req.json().catch(() => null) as { baseProductId?: string } | null
        if (body?.baseProductId) targetId = body.baseProductId
      } catch (_) { /* no body → batch mode */ }
    }

    const query = supabase.from('base_products').select('*').eq('is_active', true)
    const { data: products, error } = targetId
      ? await query.eq('id', targetId)
      : await query.is('embedding', null)

    if (error) throw new Error(error.message)
    if (!products || products.length === 0) {
      return jsonResponse({ success: true, synced: 0, total: 0, message: 'All embeddings up to date' })
    }

    let synced = 0
    const errors: string[] = []

    for (const bp of products) {
      try {
        const text = buildSearchText(bp)
        const embedding = await generateEmbedding(text)

        const { error: updateError } = await supabase
          .from('base_products')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', bp.id)

        if (updateError) throw new Error(updateError.message)
        synced++
        console.log(`[${synced}/${products.length}] ${bp.sku_base} — ${bp.name} ✅`)

        // Rate limit courtesy
        await new Promise(r => setTimeout(r, 100))
      } catch (err) {
        errors.push(`${bp.sku_base}: ${String(err)}`)
        console.error(`[ERR] ${bp.sku_base}: ${err}`)
      }
    }

    return jsonResponse({ success: true, synced, total: products.length, errors })
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) })
  }
})
