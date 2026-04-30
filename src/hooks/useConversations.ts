import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ConversationWithCustomer, Message } from "@/types/database";
import { toast } from "@/hooks/use-toast";

interface ConversationFilters {
  status?: string;
  category?: string;
  sentiment?: string;
  search?: string;
  /** customers.source — 'mercado_livre' | 'shopee' | 'amazon' | 'site' | 'whatsapp' */
  source?: string;
}

export function useConversationList(filters: ConversationFilters = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", filters],
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select("*, customers(*)")
        .order("updated_at", { ascending: false });

      if (filters.status) q = q.eq("status", filters.status);
      if (filters.category) q = q.eq("category", filters.category);
      if (filters.sentiment) q = q.eq("sentiment", filters.sentiment);

      const { data, error } = await q;
      if (error) throw error;

      let conversations = data as ConversationWithCustomer[];

      // Client-side search filter on joined customer fields
      if (filters.search) {
        const s = filters.search.toLowerCase();
        conversations = conversations.filter(
          (c) =>
            c.customers?.name?.toLowerCase().includes(s) ||
            c.customers?.phone?.toLowerCase().includes(s)
        );
      }

      // Source filter on the joined customer (Supabase doesn't filter joined
      // fields cleanly without a view, so we slice in memory).
      if (filters.source) {
        conversations = conversations.filter((c) => c.customers?.source === filters.source);
      }

      // Fetch last message for each conversation
      const ids = conversations.map((c) => c.id);
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, content, sender, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false });

        const lastMsgMap = new Map<string, { content: string; sender: string; created_at: string }>();
        msgs?.forEach((m) => {
          if (!lastMsgMap.has(m.conversation_id)) {
            lastMsgMap.set(m.conversation_id, m);
          }
        });

        return conversations.map((c) => ({
          ...c,
          lastMessage: lastMsgMap.get(c.id) || null,
        }));
      }

      return conversations.map((c) => ({ ...c, lastMessage: null }));
    },
    staleTime: 15_000,
    refetchInterval: 15_000, // Polling fallback: refetch every 15s if Realtime fails
  });

  // Realtime subscription for conversation changes
  useEffect(() => {
    const channel = supabase
      .channel("conversations-list-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        // New message in ANY conversation — refresh list to update last message preview
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
    staleTime: 5_000,
    refetchInterval: 10_000, // Polling fallback: refetch every 10s if Realtime fails
  });

  // Realtime for new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          queryClient.setQueryData<Message[]>(["messages", conversationId], (old) => {
            if (!old) return [payload.new as Message];
            const exists = old.some((m) => m.id === (payload.new as Message).id);
            if (exists) return old;
            return [...old, payload.new as Message];
          });
          // Also invalidate conversation list to update last message preview
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}

export function useConversationDetail(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation-detail", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from("conversations")
        .select("*, customers(*)")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data as ConversationWithCustomer;
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      // 1. Call send-human-message Edge Function (saves to DB + sends via WhatsApp)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const res = await fetch(
        "https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/send-human-message",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ conversationId, content }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const result = await res.json();

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });

      return result;
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao enviar mensagem", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, assignedTo }: { conversationId: string; assignedTo: string }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_to: assignedTo })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-detail", variables.conversationId] });
      const msg = variables.assignedTo === "human_agent"
        ? "Atendimento assumido com sucesso"
        : "Atendimento devolvido ao agente IA";
      toast({ title: msg });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar atendimento", variant: "destructive" });
    },
  });
}
