// =================================================================
// Embeddings module — OpenAI text-embedding-3-small + pgvector search
// =================================================================
// Shared module for generating embeddings and searching products
// by semantic similarity via Supabase's match_products RPC function.
// =================================================================

import { supabase } from './supabase-client.ts'

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

function getOpenAIKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY not set')
  return key
}

/**
 * Generate an embedding vector for the given text using OpenAI.
 * Returns array of 1536 floats.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getOpenAIKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI embedding failed (${response.status}): ${err}`)
  }

  const data = await response.json()
  const embedding: number[] = data.data?.[0]?.embedding

  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding dimensions: ${embedding?.length ?? 'null'}`)
  }

  return embedding
}

/**
 * Build the search text for a product from its fields.
 * This is the EXACT text used to generate the embedding.
 * Only includes fields the user actually filled in the dashboard.
 */
export function buildProductSearchText(product: {
  name?: string | null
  sku?: string | null
  short_description?: string | null
  full_description?: string | null
  product_line?: string | null
  material?: string | null
  dimensions?: Record<string, string> | null
  usage_suggestions?: string | null
  differentials?: string | null
  price_site?: number | null
  price_marketplace?: Record<string, number> | null
  stock_quantity?: number | null
  stock_status?: string | null
}): string {
  const parts: string[] = []

  if (product.name) parts.push(`Produto: ${product.name}`)
  if (product.sku) parts.push(`SKU: ${product.sku}`)
  if (product.product_line) parts.push(`Linha: ${product.product_line}`)
  if (product.short_description) parts.push(`Descrição: ${product.short_description}`)
  if (product.full_description) parts.push(product.full_description)
  if (product.material) parts.push(`Material: ${product.material}`)

  if (product.dimensions && typeof product.dimensions === 'object') {
    const dims = Object.entries(product.dimensions)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    if (dims) parts.push(`Dimensões: ${dims}`)
  }

  if (product.differentials) parts.push(`Diferenciais: ${product.differentials}`)
  if (product.usage_suggestions) parts.push(`Sugestões de uso: ${product.usage_suggestions}`)

  if (product.price_site) parts.push(`Preço site: R$ ${product.price_site}`)
  if (product.price_marketplace && typeof product.price_marketplace === 'object') {
    const prices = Object.entries(product.price_marketplace)
      .map(([k, v]) => `${k}: R$ ${v}`)
      .join(', ')
    if (prices) parts.push(`Preço marketplace: ${prices}`)
  }

  if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
    parts.push(`Estoque: ${product.stock_quantity > 0 ? `${product.stock_quantity} unidades disponíveis` : 'indisponível'}`)
  }

  return parts.join('. ')
}

// =================================================================
// Enriched product context — 3-layer search (base_products → products → listings + relations)
// =================================================================

export interface EnrichedBaseProduct {
  skuBase: string
  name: string
  category: string | null
  material: string | null
  capacity: string | null
  descriptionShort: string | null
  differentials: string | null
  usageSuggestions: string | null
  similarity: number
  offers: EnrichedOffer[]
  variants: EnrichedVariant[]
}

interface EnrichedOffer {
  sku: string
  name: string
  isUnit: boolean
  kitQuantity: number
  priceSite: number | null
  priceMarketplace: Record<string, number> | null
  stockQuantity: number
  stockStatus: string
  marketplaceLinks: Record<string, string> | null
  siteLink: string | null
}

interface EnrichedVariant {
  sku: string
  name: string
  relationType: string
}

/**
 * Search base_products by semantic similarity, then enrich with offers, listings, and relations.
 * This is the NEW pipeline (Phase 5) — uses base_products embeddings instead of products.
 */
export async function searchProductsEnriched(
  query: string,
  maxResults = 5,
  threshold = 0.3,
): Promise<EnrichedBaseProduct[]> {
  // Step 1: Generate embedding for the query
  const embedding = await generateEmbedding(query)

  // Step 2: Semantic search in base_products
  const { data: baseHits, error: searchError } = await supabase.rpc('search_products_semantic', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: maxResults,
  })

  if (searchError || !baseHits || baseHits.length === 0) {
    if (searchError) console.error('search_products_semantic error:', searchError.message)
    return []
  }

  const baseIds = baseHits.map((h: Record<string, unknown>) => h.id as string)

  // Step 3: Fetch full base_product details
  const { data: baseProducts } = await supabase
    .from('base_products')
    .select('id, sku_base, name, category, material, capacity, description_short, differentials, usage_suggestions')
    .in('id', baseIds)

  if (!baseProducts) return []

  // Step 4: Fetch all active products (offers/kits) linked to these base_products
  const { data: offers } = await supabase
    .from('products')
    .select('sku, name, base_product_id, is_unit, kit_quantity, price_site, price_marketplace, stock_quantity, stock_status, marketplace_links, site_link')
    .in('base_product_id', baseIds)
    .eq('is_active', true)
    .order('sales_60d', { ascending: false })

  // Step 5: Fetch product_relations for variant info
  const baseSKUs = baseProducts.map(bp => bp.sku_base)
  // Get all product SKUs linked to these base_products to find their relations
  const offerSKUs = (offers ?? []).map(o => o.sku)
  const { data: relations } = await supabase
    .from('product_relations')
    .select('parent_sku, child_sku, relation_type')
    .or(`parent_sku.in.(${offerSKUs.join(',')}),child_sku.in.(${offerSKUs.join(',')})`)

  // Build similarity map from search results
  const simMap = new Map<string, number>()
  for (const h of baseHits) {
    simMap.set(h.id as string, h.similarity as number)
  }

  // Build product name map for relations
  const productNameMap = new Map<string, string>()
  for (const o of (offers ?? [])) {
    productNameMap.set(o.sku, o.name)
  }

  // Step 6: Assemble enriched results
  const results: EnrichedBaseProduct[] = baseProducts.map(bp => {
    // Offers for this base_product
    const bpOffers: EnrichedOffer[] = (offers ?? [])
      .filter(o => o.base_product_id === bp.id)
      .map(o => ({
        sku: o.sku,
        name: o.name,
        isUnit: o.is_unit ?? false,
        kitQuantity: o.kit_quantity ?? 1,
        priceSite: o.price_site,
        priceMarketplace: o.price_marketplace as Record<string, number> | null,
        stockQuantity: o.stock_quantity ?? 0,
        stockStatus: o.stock_status ?? 'unknown',
        marketplaceLinks: o.marketplace_links as Record<string, string> | null,
        siteLink: o.site_link,
      }))

    // Variants (from product_relations for any SKU in this base_product's offers)
    const mySkus = new Set(bpOffers.map(o => o.sku))
    const variants: EnrichedVariant[] = []
    for (const rel of (relations ?? [])) {
      if (mySkus.has(rel.parent_sku) && !mySkus.has(rel.child_sku)) {
        variants.push({ sku: rel.child_sku, name: productNameMap.get(rel.child_sku) ?? rel.child_sku, relationType: rel.relation_type })
      } else if (mySkus.has(rel.child_sku) && !mySkus.has(rel.parent_sku)) {
        variants.push({ sku: rel.parent_sku, name: productNameMap.get(rel.parent_sku) ?? rel.parent_sku, relationType: rel.relation_type })
      }
    }

    return {
      skuBase: bp.sku_base,
      name: bp.name,
      category: bp.category,
      material: bp.material,
      capacity: bp.capacity,
      descriptionShort: bp.description_short,
      differentials: bp.differentials,
      usageSuggestions: bp.usage_suggestions,
      similarity: simMap.get(bp.id) ?? 0,
      offers: bpOffers,
      variants,
    }
  })

  // Sort by similarity (highest first)
  results.sort((a, b) => b.similarity - a.similarity)
  return results
}

/**
 * Format enriched products into context text for the AI prompt.
 */
export function formatEnrichedContext(products: EnrichedBaseProduct[]): string {
  if (products.length === 0) return ''

  const blocks = products.map(bp => {
    const lines: string[] = []
    lines.push(`═══════════════════════════════════════`)
    lines.push(`PRODUTO: ${bp.name}`)

    const meta: string[] = []
    if (bp.material) meta.push(`Material: ${bp.material}`)
    if (bp.capacity) meta.push(`Capacidade: ${bp.capacity}`)
    if (meta.length) lines.push(meta.join(' | '))

    if (bp.descriptionShort) lines.push(bp.descriptionShort)
    if (bp.differentials) lines.push(`Diferenciais: ${bp.differentials}`)
    if (bp.usageSuggestions) lines.push(`Sugestões de uso: ${bp.usageSuggestions}`)

    if (bp.offers.length > 0) {
      lines.push('')
      lines.push('OFERTAS DISPONÍVEIS:')
      for (const o of bp.offers) {
        const type = o.isUnit ? 'Unitário' : `Kit ${o.kitQuantity}un`
        lines.push(`  • ${o.name} (SKU: ${o.sku}) — ${type}`)

        const prices: string[] = []
        if (o.priceSite) prices.push(`Site R$${o.priceSite.toFixed(2)}`)
        const pm = o.priceMarketplace ?? {}
        if (pm.mercadolivre) prices.push(`ML R$${pm.mercadolivre.toFixed(2)}`)
        if (pm.shopee) prices.push(`Shopee R$${pm.shopee.toFixed(2)}`)
        if (pm.amazon) prices.push(`Amazon R$${pm.amazon.toFixed(2)}`)
        if (prices.length) lines.push(`    Preços: ${prices.join(' | ')}`)

        lines.push(`    Estoque: ${o.stockQuantity > 0 ? o.stockQuantity + 'un' : 'Indisponível'}`)

        const links: string[] = []
        const ml = o.marketplaceLinks ?? {}
        if (ml.mercadolivre) links.push(`ML: ${ml.mercadolivre}`)
        if (ml.shopee) links.push(`Shopee: ${ml.shopee}`)
        if (ml.amazon) links.push(`Amazon: ${ml.amazon}`)
        if (o.siteLink && o.siteLink !== 'https://importadoragb.com.br/') links.push(`Site: ${o.siteLink}`)
        if (links.length) lines.push(`    Links: ${links.join(' | ')}`)
      }
    }

    if (bp.variants.length > 0) {
      lines.push('')
      lines.push('VARIANTES:')
      const byType = new Map<string, string[]>()
      for (const v of bp.variants) {
        const arr = byType.get(v.relationType) ?? []
        arr.push(v.name)
        byType.set(v.relationType, arr)
      }
      if (byType.has('color_variant')) lines.push(`  • Outras cores: ${byType.get('color_variant')!.join(', ')}`)
      if (byType.has('size_variant')) lines.push(`  • Outros tamanhos: ${byType.get('size_variant')!.join(', ')}`)
      if (byType.has('kit_variant')) lines.push(`  • Kits relacionados: ${byType.get('kit_variant')!.join(', ')}`)
    }

    lines.push(`═══════════════════════════════════════`)
    return lines.join('\n')
  })

  return blocks.join('\n\n')
}

// =================================================================
// Legacy search — kept as fallback (searches `products` table directly)
// =================================================================

/**
 * Search products by semantic similarity using pgvector.
 * Generates embedding for the query and calls match_products RPC.
 */
export async function searchProducts(
  query: string,
  maxResults = 5,
  threshold = 0.3,
): Promise<Array<{
  sku: string
  name: string
  price_site: number | null
  price_marketplace: Record<string, number> | null
  stock_status: string
  stock_quantity: number
  short_description: string | null
  full_description: string | null
  differentials: string | null
  usage_suggestions: string | null
  material: string | null
  site_link: string | null
  marketplace_links: Record<string, string> | null
  similarity: number
}>> {
  const embedding = await generateEmbedding(query)

  const { data, error } = await supabase.rpc('match_products', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: maxResults,
  })

  if (error) {
    console.error('match_products RPC error:', error.message)
    return []
  }

  return (data ?? []).map((p: Record<string, unknown>) => ({
    sku: p.sku as string,
    name: p.name as string,
    price_site: p.price_site as number | null,
    price_marketplace: p.price_marketplace as Record<string, number> | null,
    stock_status: p.stock_status as string,
    stock_quantity: p.stock_quantity as number,
    short_description: p.short_description as string | null,
    full_description: p.full_description as string | null,
    differentials: p.differentials as string | null,
    usage_suggestions: p.usage_suggestions as string | null,
    material: p.material as string | null,
    site_link: p.site_link as string | null,
    marketplace_links: p.marketplace_links as Record<string, string> | null,
    similarity: p.similarity as number,
  }))
}

// =================================================================
// Feedback loop — search operator-verified corrections
// =================================================================

export interface CorrectionHit {
  originalQuestion: string
  recommendedResponse: string
  similarity: number
}

/**
 * Search response_corrections by semantic similarity to the customer message.
 * Returns top matches above threshold (default 0.85). Used by both WhatsApp
 * (process-message) and ML (process-ml-question) pipelines so operator-verified
 * answers influence future generations.
 */
export async function searchCorrections(
  query: string,
  threshold = 0.85,
  maxResults = 3,
  channel?: string,
): Promise<CorrectionHit[]> {
  const embedding = await generateEmbedding(query)

  const { data, error } = await supabase.rpc('search_corrections', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: maxResults,
    p_channel: channel ?? null,
  })

  if (error) {
    console.error('search_corrections RPC error:', error.message)
    return []
  }

  return (data ?? []).map((c: Record<string, unknown>) => ({
    originalQuestion: (c.original_question as string) ?? '',
    recommendedResponse: (c.recommended_response as string) ?? '',
    similarity: (c.similarity as number) ?? 0,
  }))
}
