// Product Matcher — Maps platform item IDs to internal products
// Uses product_listings table (replaces marketplace_product_mapping)
// 1. Direct lookup by platform + platform_item_id
// 2. Semantic search fallback via pgvector embeddings

import { supabase } from './supabase-client.ts'
import { searchProducts } from './embeddings.ts'

export interface ListingInfo {
  id: string
  platform: string
  platformItemId: string | null
  listingTitle: string
  listingUrl: string | null
  listingType: string
  kitQuantity: number
  listingPrice: number | null
}

export interface ProductInfo {
  productId: string
  sku: string
  name: string
  listing: ListingInfo
}

export interface MatchResult {
  products: ProductInfo[]
  relatedListings: ListingInfo[]
  source: 'listing' | 'semantic' | 'none'
  isKit: boolean
}

/**
 * Match a platform item to internal product(s).
 * Returns matched products + related listings on the same platform (for cross-sell).
 */
export async function matchMLItemToProduct(
  itemId: string,
  itemTitle: string,
  platform = 'mercado_livre',
): Promise<MatchResult> {
  // Step 1: Direct lookup in product_listings
  const { data: listings } = await supabase
    .from('product_listings')
    .select('id, product_id, platform, platform_item_id, listing_title, listing_url, listing_type, kit_quantity, listing_price')
    .eq('platform', platform)
    .eq('platform_item_id', itemId)
    .eq('is_active', true)

  if (listings && listings.length > 0) {
    // Load product details for matched listings
    const productIds = [...new Set(listings.map(l => l.product_id))]
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name')
      .in('id', productIds)

    const productMap = new Map((products || []).map(p => [p.id, p]))
    const isKit = listings.some(l => l.listing_type === 'kit' || l.listing_type === 'combo')

    const matched: ProductInfo[] = listings
      .map(l => {
        const p = productMap.get(l.product_id)
        if (!p) return null
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          listing: mapListing(l),
        }
      })
      .filter(Boolean) as ProductInfo[]

    // Load related listings on the same platform for cross-selling
    const relatedListings = await getRelatedListings(productIds, platform, itemId)

    return { products: matched, relatedListings, source: 'listing', isKit }
  }

  // Step 2: Semantic search fallback (single product only)
  if (!itemTitle) return { products: [], relatedListings: [], source: 'none', isKit: false }

  // Threshold raised 0.4 -> 0.62 (audit 2026-06-24): 0.4 was too permissive and caused
  // wrong-product grounding (e.g. "Kit 6 Potes Fit" described as "5 Potes Redondos Tampa Preta").
  // A weak match now returns 'none' so the agent answers from the listing title instead of
  // confidently describing the wrong product.
  const results = await searchProducts(itemTitle, 3, 0.62)
  if (results.length === 0) return { products: [], relatedListings: [], source: 'none', isKit: false }

  const bestMatch = results[0]
  const { data: product } = await supabase
    .from('products')
    .select('id, sku, name')
    .eq('sku', bestMatch.sku)
    .single()

  if (!product?.id) return { products: [], relatedListings: [], source: 'none', isKit: false }

  // Load related listings for the matched product
  const relatedListings = await getRelatedListings([product.id], platform, null)

  return {
    products: [{
      productId: product.id,
      sku: product.sku,
      name: product.name,
      listing: {
        id: '',
        platform,
        platformItemId: null,
        listingTitle: itemTitle,
        listingUrl: null,
        listingType: 'single',
        kitQuantity: 1,
        listingPrice: null,
      },
    }],
    relatedListings,
    source: 'semantic',
    isKit: false,
  }
}

/**
 * Get all active listings for given products on a platform, excluding a specific item.
 * Used for cross-selling context.
 */
async function getRelatedListings(
  productIds: string[],
  platform: string,
  excludeItemId: string | null,
): Promise<ListingInfo[]> {
  let query = supabase
    .from('product_listings')
    .select('id, platform, platform_item_id, listing_title, listing_url, listing_type, kit_quantity, listing_price')
    .eq('platform', platform)
    .in('product_id', productIds)
    .eq('is_active', true)
    .order('listing_type')

  if (excludeItemId) {
    query = query.neq('platform_item_id', excludeItemId)
  }

  const { data } = await query
  return (data || []).map(mapListing)
}

function mapListing(l: Record<string, unknown>): ListingInfo {
  return {
    id: l.id as string,
    platform: l.platform as string,
    platformItemId: l.platform_item_id as string | null,
    listingTitle: l.listing_title as string,
    listingUrl: l.listing_url as string | null,
    listingType: l.listing_type as string,
    kitQuantity: (l.kit_quantity as number) || 1,
    listingPrice: l.listing_price as number | null,
  }
}

/**
 * Create or update a listing in product_listings.
 */
export async function syncProductListing(
  productId: string,
  platform: string,
  platformItemId: string,
  data: {
    listingTitle: string
    listingUrl?: string | null
    listingType?: string
    kitQuantity?: number
    listingPrice?: number | null
  },
): Promise<void> {
  await supabase
    .from('product_listings')
    .upsert(
      {
        product_id: productId,
        platform,
        platform_item_id: platformItemId,
        listing_title: data.listingTitle,
        listing_url: data.listingUrl ?? null,
        listing_type: data.listingType ?? 'single',
        kit_quantity: data.kitQuantity ?? 1,
        listing_price: data.listingPrice ?? null,
        is_active: true,
      },
      { onConflict: 'product_id,platform,platform_item_id' },
    )
}
