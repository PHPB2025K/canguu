import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProductListings(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-listings", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_listings")
        .select("*")
        .eq("product_id", productId)
        .order("platform", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listing: {
      product_id: string;
      platform: string;
      listing_title: string;
      platform_item_id?: string | null;
      listing_url?: string | null;
      listing_type?: string;
      kit_quantity?: number;
      listing_price?: number | null;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("product_listings")
        .insert(listing)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-listings", data.product_id] });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      product_id: string;
      platform?: string;
      listing_title?: string;
      platform_item_id?: string | null;
      listing_url?: string | null;
      listing_type?: string;
      kit_quantity?: number;
      listing_price?: number | null;
      is_active?: boolean;
    }) => {
      const { product_id, ...rest } = updates;
      const { data, error } = await supabase
        .from("product_listings")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { ...data, product_id: product_id || data.product_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-listings", data.product_id] });
    },
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await supabase
        .from("product_listings")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-listings", data.productId] });
    },
  });
}
