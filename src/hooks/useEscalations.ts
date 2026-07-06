import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EscalationWithDetails, Message } from "@/types/database";

export type EscalationWithMessages = EscalationWithDetails & {
  recentMessages: Message[];
};

export function useEscalationList(statusFilter?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("escalations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["escalations"] });
        queryClient.invalidateQueries({ queryKey: ["escalation-counts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["escalations", statusFilter],
    queryFn: async (): Promise<EscalationWithMessages[]> => {
      let q = supabase
        .from("escalations")
        .select("*, conversations(*, customers(*))")
        .order("escalated_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data, error } = await q;
      if (error) throw error;

      const escalations = (data ?? []) as unknown as EscalationWithDetails[];
      const convIds = [...new Set(escalations.map((e) => e.conversation_id))];

      let messagesMap: Record<string, Message[]> = {};
      if (convIds.length > 0) {
        // Fetch last 2 messages per conversation in batch
        const { data: msgs } = await supabase
          .from("messages")
          .select("*")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false });

        if (msgs) {
          const grouped: Record<string, Message[]> = {};
          for (const m of msgs as Message[]) {
            if (!grouped[m.conversation_id]) grouped[m.conversation_id] = [];
            if (grouped[m.conversation_id].length < 2) {
              grouped[m.conversation_id].push(m);
            }
          }
          messagesMap = grouped;
        }
      }

      return escalations.map((e) => ({
        ...e,
        recentMessages: messagesMap[e.conversation_id] ?? [],
      }));
    },
  });
}

export function useEscalationCounts() {
  return useQuery({
    queryKey: ["escalation-counts"],
    queryFn: async () => {
      const [pending, inProgress, resolved] = await Promise.all([
        supabase.from("escalations").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("escalations").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("escalations").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      ]);
      return {
        pending: pending.count ?? 0,
        in_progress: inProgress.count ?? 0,
        resolved: resolved.count ?? 0,
        total: (pending.count ?? 0) + (inProgress.count ?? 0) + (resolved.count ?? 0),
      };
    },
  });
}

export function useAssignEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const { error } = await supabase
        .from("escalations")
        .update({ status: "in_progress", resolved_by: email })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalations"] });
      qc.invalidateQueries({ queryKey: ["escalation-counts"] });
    },
  });
}

export function useResolveEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data, error } = await supabase
        .from("escalations")
        .update({ status: "resolved", notes, resolved_at: new Date().toISOString() })
        .eq("id", id)
        .select("conversation_id")
        .single();
      if (error) throw error;
      // Devolve a conversa pra Ana: sem isso o status fica 'escalated' pra sempre
      // e a Ana permanece muda com esse cliente (a conversa é única por cliente).
      if (data?.conversation_id) {
        const { error: convError } = await supabase
          .from("conversations")
          .update({ status: "active", assigned_to: "agent" })
          .eq("id", data.conversation_id);
        if (convError) throw convError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalations"] });
      qc.invalidateQueries({ queryKey: ["escalation-counts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
