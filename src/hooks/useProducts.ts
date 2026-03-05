import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type ProductInsert = TablesInsert<"products">;
type ProductUpdate = TablesUpdate<"products">;

interface ProductFilters {
  search?: string;
  productLine?: string;
  isActive?: boolean | null;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
}

export function useProductList(filters: ProductFilters = {}) {
  const { search, productLine, isActive, sortColumn = "name", sortDirection = "asc" } = filters;

  return useQuery({
    queryKey: ["products", { search, productLine, isActive, sortColumn, sortDirection }],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*")
        .order(sortColumn, { ascending: sortDirection === "asc" });

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      }
      if (productLine) {
        query = query.eq("product_line", productLine);
      }
      if (isActive !== null && isActive !== undefined) {
        query = query.eq("is_active", isActive);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 60_000,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Product;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: ProductInsert) => {
      const { data, error } = await supabase.from("products").insert(product).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProductUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("products")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useToggleProductActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useProductLines() {
  return useQuery({
    queryKey: ["product-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("product_line")
        .not("product_line", "is", null);
      if (error) throw error;
      const lines = [...new Set(data.map((d) => d.product_line as string))].sort();
      return lines;
    },
    staleTime: 300_000,
  });
}

// Helper: extract first image URL from jsonb images field
export function getFirstImage(images: unknown): string | null {
  if (!images) return null;
  if (Array.isArray(images)) {
    const first = images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in (first as Record<string, unknown>))
      return (first as Record<string, string>).url;
  }
  return null;
}

// Helper: convert images jsonb to newline-separated string for textarea
export function imagesToText(images: unknown): string {
  if (!images) return "";
  if (Array.isArray(images)) {
    return images
      .map((img) => (typeof img === "string" ? img : (img as Record<string, string>)?.url ?? ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

// Helper: convert textarea text to images array for saving
export function textToImages(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Helper: extract dimension string from jsonb
export function dimensionsToText(dim: unknown): string {
  if (!dim) return "";
  if (typeof dim === "string") return dim;
  if (typeof dim === "object" && dim !== null && "raw" in (dim as Record<string, unknown>))
    return String((dim as Record<string, string>).raw);
  return JSON.stringify(dim);
}

// Marketplace platform keys
export const MARKETPLACE_PLATFORMS = ["mercadolivre", "shopee", "amazon", "tiktok", "site", "whatsapp"] as const;

export const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
  tiktok: "TikTok Shop",
  site: "Site Próprio",
  whatsapp: "WhatsApp Direto",
};

// Helper: extract marketplace price number from jsonb (with optional platform key)
export function extractMarketplacePrice(pm: unknown, platform?: string): number | null {
  if (!pm) return null;
  if (typeof pm === "number") return pm;
  if (typeof pm === "object" && pm !== null) {
    const obj = pm as Record<string, unknown>;
    if (platform && platform in obj && typeof obj[platform] === "number") return obj[platform] as number;
    if ("default" in obj && typeof obj.default === "number") return obj.default;
    const vals = Object.values(obj).filter((v) => typeof v === "number");
    if (vals.length > 0) return vals[0] as number;
  }
  return null;
}

// Helper: extract all platform prices as strings for form state
export function extractAllMarketplacePrices(pm: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of MARKETPLACE_PLATFORMS) {
    const val = pm && typeof pm === "object" ? (pm as Record<string, unknown>)[key] : undefined;
    result[key] = typeof val === "number" ? String(val) : "";
  }
  return result;
}

// Helper: build jsonb from form prices (only non-empty, positive values)
export function buildMarketplacePriceJson(prices: Record<string, string>): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(prices)) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) result[key] = num;
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Helper: extract marketplace link string from jsonb
export function extractMarketplaceLink(ml: unknown): string {
  if (!ml) return "";
  if (typeof ml === "string") return ml;
  if (typeof ml === "object" && ml !== null) {
    const obj = ml as Record<string, unknown>;
    if ("url" in obj) return String(obj.url);
    const vals = Object.values(obj).filter((v) => typeof v === "string");
    if (vals.length > 0) return vals[0] as string;
  }
  return "";
}
