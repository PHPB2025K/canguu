// Context Builder — Assembles all data needed for Claude to generate a response
// Runs parallel DB queries for maximum speed

import { supabase } from './supabase-client.ts'
import { getConfig } from './config.ts'
import { searchProducts, searchProductsEnriched, formatEnrichedContext, searchCorrections } from './embeddings.ts'
import type { ContextBundle, ProductListingContext } from './types.ts'

// Keywords that indicate the customer is interested in products
const PRODUCT_KEYWORDS = [
  'produto', 'produtos', 'preço', 'preco', 'comprar', 'catálogo', 'catalogo',
  'opções', 'opcoes', 'disponível', 'disponivel', 'estoque', 'quanto custa',
  'quanto é', 'quanto e', 'valor', 'vender', 'vendem', 'vocês tem', 'voces tem',
  'tem pra vender', 'conhecer', 'novidades', 'lançamento', 'lancamento',
  'oferta', 'promoção', 'promocao', 'pote', 'jarra', 'caneca', 'copo',
  'balde', 'suporte', 'kit', 'conjunto',
]

/**
 * Build the complete context bundle for the AI pipeline.
 * Runs parallel queries to minimize latency.
 * Products are ONLY loaded when includeProducts is true (controlled by intent classifier).
 */
export async function buildContext(
  conversationId: string,
  customerId: string,
  messageContent: string,
  includeProducts = false,
): Promise<ContextBundle> {
  const config = await getConfig()

  // Core queries (always run) — history, customer, policies, FAQs, message count
  const [
    historyResult,
    customerResult,
    policiesResult,
    faqsData,
    messageCountResult,
  ] = await Promise.all([
    // Last 20 messages in conversation. Pull metadata so we can swap in
    // ai_description for media messages (image/video) — Ana sees the
    // background description; the admin UI never reads this column.
    supabase
      .from('messages')
      .select('sender, content, metadata, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20),

    // Customer data
    supabase
      .from('customers')
      .select('id, name, phone, tags, source, total_conversations, notes')
      .eq('id', customerId)
      .single(),

    // All active policies
    supabase
      .from('policies')
      .select('title, category, marketplace, summary, content')
      .eq('is_active', true)
      .order('priority', { ascending: false }),

    // FAQs with keyword matching
    loadRelevantFAQs(messageContent),

    // Message count for escalation tracking (customer messages only)
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender', 'customer'),
  ])

  // Product search — ONLY when classifier says needs_product_lookup = true
  // NEW PIPELINE (Phase 5): search base_products → enrich with offers + relations
  let enrichedProducts: Awaited<ReturnType<typeof searchProductsEnriched>> = []
  let enrichedContext = ''
  let productsData: Awaited<ReturnType<typeof searchProducts>> = []

  if (includeProducts) {
    try {
      enrichedProducts = await searchProductsEnriched(messageContent, 5, 0.3)

      // If message is too short/generic and returned no results, use last customer
      // message with product-related content as search query (context carry-over)
      if (enrichedProducts.length === 0 && messageContent.length < 20) {
        const customerMsgs = (historyResult.data ?? [])
          .filter(m => m.sender === 'customer' && m.content && m.content.length > 10)
          .map(m => m.content as string)
          .reverse()
        const productMsg = customerMsgs.find(c =>
          /pote|caneca|jarra|kit|hermético|hermetico|vidro|suporte|presente|marmita|comprar|preço|preco|catálogo|catalogo|promoção|promocao|jogo|conjunto/i.test(c)
        )
        if (productMsg) {
          // Retry with higher threshold (0.2) to catch abbreviated/misspelled queries
          enrichedProducts = await searchProductsEnriched(productMsg, 5, 0.2)
          if (enrichedProducts.length > 0) {
            console.log(`[context-builder] carry-over found ${enrichedProducts.length} products with query: "${productMsg}"`)
          }
        }
      }

      // FALLBACK: If enriched search still empty, try legacy search (products table, 0.3 threshold)
      // This catches cases where base_products embeddings miss but products embeddings hit
      if (enrichedProducts.length === 0 && messageContent.length >= 3) {
        console.log(`[context-builder] enriched search empty, trying legacy fallback for: "${messageContent}"`)
        productsData = await searchProducts(messageContent, 5, 0.3) ?? []
        // Also try carry-over query on legacy if current message fails
        if (productsData.length === 0 && messageContent.length < 20) {
          const customerMsgs = (historyResult.data ?? [])
            .filter(m => m.sender === 'customer' && m.content && m.content.length > 10)
            .map(m => m.content as string)
            .reverse()
          const productMsg = customerMsgs.find(c =>
            /pote|caneca|jarra|kit|hermético|hermetico|vidro|suporte|presente|marmita|comprar|preço|preco|catálogo|catalogo|promoção|promocao|jogo|conjunto/i.test(c)
          )
          if (productMsg) {
            productsData = await searchProducts(productMsg, 5, 0.3) ?? []
          }
        }
      }

      enrichedContext = formatEnrichedContext(enrichedProducts)
    } catch (err) {
      console.error('Enriched search failed, falling back to legacy:', String(err))
      productsData = await searchProducts(messageContent, 5, 0.5) ?? []
    }
  }

  const customer = customerResult.data
  if (!customer) {
    throw new Error(`Customer ${customerId} not found`)
  }

  // Search operator-verified corrections for this message (graceful degradation)
  let corrections: Awaited<ReturnType<typeof searchCorrections>> = []
  if (messageContent && messageContent.trim().length >= 3) {
    try {
      // Threshold lowered from 0.85 to 0.65 — same reasoning as
      // process-ml-question: customer questions vary too much in surface
      // form for 0.85 to catch operator-approved corrections, leading to
      // evasive boilerplate replies instead of using the verified answer.
      corrections = await searchCorrections(messageContent, 0.65, 3, 'whatsapp')
    } catch (err) {
      console.error('[context-builder] searchCorrections failed:', String(err))
    }
  }

  // Determine product source — prefer enriched pipeline, fallback to legacy
  let products: ContextBundle['relevantProducts'] = []
  let productSource: ContextBundle['productSource'] = 'none'
  let platformListings: ProductListingContext[] = []

  if (enrichedProducts.length > 0) {
    // NEW: enriched pipeline found results — use enrichedContext directly
    productSource = 'semantic'
    // Still populate relevantProducts for backward compat with response-generator
    // (but enrichedContext takes precedence when present)
    products = []  // Will use enrichedContext instead
  } else {
    // LEGACY fallback
    const resolved = await resolveProducts(productsData ?? [], messageContent)
    products = resolved.products
    productSource = resolved.productSource

    const productSkus = products.map(p => p.sku)
    platformListings = productSkus.length > 0
      ? await loadProductListings(productSkus)
      : []
  }

  return {
    systemPrompt: config.systemPrompt,
    agentName: config.agentName,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      tags: customer.tags,
      source: customer.source,
      totalConversations: customer.total_conversations,
      notes: customer.notes,
    },
    conversationHistory: (historyResult.data ?? []).map(m => ({
      role: m.sender as 'customer' | 'agent' | 'human_agent',
      // For media messages we keep '[Imagem recebida]'/'[Vídeo recebido]' as
      // the visible content and store the Gemini description in metadata.
      // Ana needs the description to reason about what the customer shared,
      // so we swap it in here (only customer-side; agent messages never have
      // ai_description). Caption was already merged into ai_description by
      // the webhook, so we don't lose it.
      content: enrichContentForAI(m.sender as string, m.content, (m as { metadata?: Record<string, unknown> }).metadata),
      timestamp: m.created_at,
    })),
    relevantProducts: products,
    relevantPolicies: (policiesResult.data ?? []).map(p => ({
      title: p.title,
      category: p.category,
      marketplace: p.marketplace,
      summary: p.summary,
      content: p.content,
    })),
    relevantFAQs: (faqsData ?? []).map(f => ({
      question: f.question,
      answer: f.answer,
      category: f.category,
    })),
    currentMessage: messageContent,
    messageCount: messageCountResult.count ?? 0,
    pendingMessageCount: 1,
    isWithinWorkingHours: true, // Ana operates 24/7
    productSource,
    platformListings,
    enrichedProductContext: enrichedContext || undefined,
    relevantCorrections: corrections.length > 0 ? corrections : undefined,
  }
}

/**
 * Resolve which products to include in context.
 * 1. Semantic search returned results → use them (source: 'semantic')
 * 2. Semantic search empty + message has product keywords → fallback to full catalog (source: 'catalog')
 * 3. Otherwise → no products (source: 'none')
 */
async function resolveProducts(
  semanticResults: Array<Record<string, unknown>>,
  messageContent: string,
): Promise<{ products: ContextBundle['relevantProducts']; productSource: ContextBundle['productSource'] }> {
  // Semantic search returned results — use them
  if (semanticResults.length > 0) {
    return {
      products: semanticResults.map(mapSemanticProduct),
      productSource: 'semantic',
    }
  }

  // Semantic search empty — check if message mentions products
  if (messageHasProductIntent(messageContent)) {
    const catalogProducts = await getAllActiveProducts()
    if (catalogProducts.length > 0) {
      return {
        products: catalogProducts,
        productSource: 'catalog',
      }
    }
  }

  return { products: [], productSource: 'none' }
}

function mapSemanticProduct(p: Record<string, unknown>): ContextBundle['relevantProducts'][0] {
  return {
    sku: p.sku as string,
    name: p.name as string,
    priceSite: p.price_site as number | null,
    priceMarketplace: p.price_marketplace as Record<string, number> | null,
    stockStatus: p.stock_status as string,
    stockQuantity: p.stock_quantity as number,
    shortDescription: p.short_description as string | null,
    fullDescription: p.full_description as string | null,
    differentials: p.differentials as string | null,
    usageSuggestions: p.usage_suggestions as string | null,
    material: p.material as string | null,
    siteLink: p.site_link as string | null,
    marketplaceLinks: p.marketplace_links as Record<string, string> | null,
  }
}

/**
 * Check if the customer message indicates interest in products.
 */
function messageHasProductIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return PRODUCT_KEYWORDS.some(kw => lower.includes(kw))
}

/**
 * Fallback: load ALL active products with minimal fields.
 * Used when semantic search returns empty but client wants products.
 */
async function getAllActiveProducts(): Promise<ContextBundle['relevantProducts']> {
  const { data, error } = await supabase
    .from('products')
    .select('name, sku, price_site, stock_status, stock_quantity')
    .eq('is_active', true)
    .order('name')

  if (error || !data) return []

  return data.map(p => ({
    sku: p.sku,
    name: p.name,
    priceSite: p.price_site,
    priceMarketplace: null,
    stockStatus: p.stock_status,
    stockQuantity: p.stock_quantity,
    shortDescription: null,
    fullDescription: null,
    differentials: null,
    usageSuggestions: null,
    material: null,
    siteLink: null,
    marketplaceLinks: null,
  }))
}

/**
 * Load product listings for the given product SKUs.
 * Used to provide platform-aware links in the WhatsApp context.
 */
async function loadProductListings(productSkus: string[]): Promise<ProductListingContext[]> {
  // First get product IDs from SKUs
  const { data: products } = await supabase
    .from('products')
    .select('id, sku')
    .in('sku', productSkus)

  if (!products || products.length === 0) return []

  const skuById = new Map(products.map(p => [p.id, p.sku]))
  const productIds = products.map(p => p.id)

  const { data, error } = await supabase
    .from('product_listings')
    .select('platform, platform_item_id, listing_title, listing_url, listing_type, product_id')
    .in('product_id', productIds)
    .eq('is_active', true)

  if (error || !data) return []

  return data.map((l: Record<string, unknown>) => ({
    platform: l.platform as string,
    platformItemId: l.platform_item_id as string | null,
    listingTitle: l.listing_title as string,
    listingUrl: l.listing_url as string | null,
    listingType: l.listing_type as string,
    productSku: skuById.get(l.product_id as string) ?? '',
  }))
}

/**
 * Load FAQs relevant to the message content.
 * First tries keyword overlap, falls back to top 10 most used.
 */
async function loadRelevantFAQs(messageContent: string) {
  // Extract meaningful words (>3 chars) for keyword matching
  const words = messageContent
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 10)

  if (words.length > 0) {
    const { data } = await supabase
      .from('faq')
      .select('question, answer, category')
      .eq('is_active', true)
      .overlaps('keywords', words)
      .limit(5)

    if (data && data.length > 0) return data
  }

  // Fallback: top 10 most used FAQs
  const { data } = await supabase
    .from('faq')
    .select('question, answer, category')
    .eq('is_active', true)
    .order('usage_count', { ascending: false })
    .limit(10)

  return data ?? []
}

/**
 * For customer-side media messages, the visible content is a placeholder
 * (e.g. '[Imagem recebida]'). The Gemini-generated description lives in
 * metadata.ai_description so it never leaks into the admin UI. This helper
 * swaps it in for Ana's context only.
 *
 * Pattern matches '[Imagem recebida]' / '[Vídeo recebido]' as the marker —
 * any other content (text, sticker text, location, contact, button reply,
 * audio transcription) goes through unchanged.
 */
function enrichContentForAI(
  sender: string,
  content: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (sender !== 'customer') return content
  const aiDescription = metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>).ai_description
    : null
  if (typeof aiDescription !== 'string' || aiDescription.trim().length === 0) {
    return content
  }
  const trimmed = content.trim()
  // Only override the standard media placeholders. Captions like
  // '[Imagem recebida] meu pedido chegou rachado' get the description
  // appended so neither the caption nor the analysis is lost.
  if (/^\[Imagem recebida\]$/i.test(trimmed)) return `[Imagem recebida] ${aiDescription}`
  if (/^\[V[ií]deo recebido\]$/i.test(trimmed)) return `[Vídeo recebido] ${aiDescription}`
  if (/^\[Imagem recebida\] /i.test(trimmed)) return `${trimmed} — ${aiDescription}`
  if (/^\[V[ií]deo recebido\] /i.test(trimmed)) return `${trimmed} — ${aiDescription}`
  return content
}
