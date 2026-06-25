import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

export function useCustomerList(search?: string) {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").order("last_contact_at", { ascending: false, nullsFirst: false });
      if (search) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
    staleTime: 60_000,
  });
}

export function useCustomer(id?: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id,
  });
}

export function useCustomerConversations(customerId?: string) {
  return useQuery({
    queryKey: ["customer-conversations", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", customerId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      // Fetch last message for each conversation
      const convIds = data.map((c) => c.id);
      if (convIds.length === 0) return [];

      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at, message_type")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      const lastMsgMap = new Map<string, { content: string; message_type: string | null }>();
      (messages ?? []).forEach((m) => {
        if (!lastMsgMap.has(m.conversation_id))
          lastMsgMap.set(m.conversation_id, { content: m.content, message_type: m.message_type });
      });

      return data.map((c) => ({ ...c, lastMessage: lastMsgMap.get(c.id) ?? null }));
    },
    enabled: !!customerId,
  });
}

export function useUpdateCustomerTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { error } = await supabase.from("customers").update({ tags }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomerNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("customers").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["customer", id] });
    },
  });
}

export function useCustomerSentimentStats(customerId?: string) {
  return useQuery({
    queryKey: ["customer-sentiment", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("sentiment")
        .eq("customer_id", customerId!);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((c) => {
        if (c.sentiment) counts[c.sentiment] = (counts[c.sentiment] || 0) + 1;
      });
      let predominant = "neutral";
      let max = 0;
      Object.entries(counts).forEach(([k, v]) => {
        if (v > max) { max = v; predominant = k; }
      });
      return { counts, predominant, total: data?.length ?? 0 };
    },
    enabled: !!customerId,
  });
}
