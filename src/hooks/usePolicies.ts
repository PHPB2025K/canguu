import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;
type Faq = Tables<"faq">;

export function usePolicyList(categoryFilter?: string) {
  return useQuery({
    queryKey: ["policies", categoryFilter],
    queryFn: async () => {
      let q = supabase.from("policies").select("*").order("priority", { ascending: false });
      if (categoryFilter) q = q.eq("category", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Policy[];
    },
    staleTime: 60_000,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (policy: TablesInsert<"policies">) => {
      const { error } = await supabase.from("policies").insert(policy);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"policies"> & { id: string }) => {
      const { error } = await supabase.from("policies").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useTogglePolicyActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("policies").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

// FAQ hooks

export function useFaqList(categoryFilter?: string) {
  return useQuery({
    queryKey: ["faq", categoryFilter],
    queryFn: async () => {
      let q = supabase.from("faq").select("*").order("usage_count", { ascending: false });
      if (categoryFilter) q = q.eq("category", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Faq[];
    },
    staleTime: 60_000,
  });
}

export function useFaqCategories() {
  return useQuery({
    queryKey: ["faq-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("faq").select("category");
      if (error) throw error;
      const cats = [...new Set((data ?? []).map((r) => r.category).filter(Boolean))] as string[];
      return cats.sort();
    },
    staleTime: 120_000,
  });
}

export function useCreateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (faq: TablesInsert<"faq">) => {
      const { error } = await supabase.from("faq").insert(faq);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["faq-categories"] });
    },
  });
}

export function useUpdateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"faq"> & { id: string }) => {
      const { error } = await supabase.from("faq").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["faq-categories"] });
    },
  });
}

export function useDeleteFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faq").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faq"] });
      qc.invalidateQueries({ queryKey: ["faq-categories"] });
    },
  });
}

export function useToggleFaqActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("faq").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faq"] }),
  });
}
