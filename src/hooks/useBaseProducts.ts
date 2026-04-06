import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BaseProduct {
  id: string;
  sku_base: string;
  name: string;
  category: string | null;
  line: string | null;
  material: string | null;
  color: string | null;
  capacity: string | null;
  description_short: string | null;
  description_full: string | null;
  usage_suggestions: string | null;
  differentials: string | null;
  tags: string[] | null;
  image_urls: string[] | null;
  faq_product: string | null;
  is_active: boolean;
}

export interface KitComposition {
  id: string;
  product_sku: string;
  base_product_id: string;
  quantity: number;
  base_product?: { sku_base: string; name: string; capacity: string | null };
}

/** Fetch base_product by ID (linked from products.base_product_id) */
export function useBaseProduct(baseProductId: string | null | undefined) {
  return useQuery({
    queryKey: ["base_product", baseProductId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("base_products" as any)
        .select("*")
        .eq("id", baseProductId!)
        .single();
      if (error) throw error;
      return data as unknown as BaseProduct;
    },
    enabled: !!baseProductId,
  });
}

/** Fetch kit_compositions for a product SKU */
export function useKitCompositions(productSku: string | undefined) {
  return useQuery({
    queryKey: ["kit_compositions", productSku],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kit_compositions" as any)
        .select("id, product_sku, base_product_id, quantity")
        .eq("product_sku", productSku!);
      if (error) throw error;

      // Fetch base_product names for each composition
      const baseIds = (data as any[]).map((d: any) => d.base_product_id);
      if (baseIds.length === 0) return [];

      const { data: bases } = await supabase
        .from("base_products" as any)
        .select("id, sku_base, name, capacity")
        .in("id", baseIds);

      const baseMap = new Map((bases as any[] ?? []).map((b: any) => [b.id, b]));

      return (data as any[]).map((d: any) => ({
        ...d,
        base_product: baseMap.get(d.base_product_id) ?? null,
      })) as KitComposition[];
    },
    enabled: !!productSku,
  });
}

/** Save content-rich fields to base_products + trigger re-embedding */
export async function saveBaseProductContent(
  baseProductId: string,
  fields: {
    description_short?: string | null;
    description_full?: string | null;
    usage_suggestions?: string | null;
    differentials?: string | null;
    tags?: string[] | null;
    image_urls?: string[] | null;
  }
) {
  const { error } = await supabase
    .from("base_products" as any)
    .update({ ...fields, updated_at: new Date().toISOString() } as any)
    .eq("id", baseProductId);

  if (error) throw error;
}

/** Trigger re-embedding for a base_product (async, fire-and-forget) */
export function triggerReEmbedding() {
  // Call the Edge Function — fire and forget
  const url = "https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/sync-base-product-embedding";

  supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (!token) return;

    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }).catch(() => {
      // Silent fail — embedding will be regenerated on next sync
    });
  });
}

// Content-rich field names that trigger re-embedding when changed
export const CONTENT_RICH_FIELDS = [
  "description_short",
  "description_full",
  "usage_suggestions",
  "differentials",
  "tags",
] as const;
