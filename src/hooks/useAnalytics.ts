import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsDaily } from "@/types/database";

export function useAnalyticsSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["analytics-summary", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics_daily")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      if (error) throw error;

      const rows = (data ?? []) as AnalyticsDaily[];
      const sum = (fn: (r: AnalyticsDaily) => number | null) =>
        rows.reduce((acc, r) => acc + (fn(r) ?? 0), 0);

      // Taxa de resolução PONDERADA pelo volume (resolvidas ÷ total no período),
      // não a média simples das taxas diárias — evita que um dia de 1 conversa pese
      // igual a um dia de 50. Reconstrói as resolvidas/dia a partir de rate × total.
      const totalConv = sum((r) => r.total_conversations);
      const resolvedApprox = rows.reduce(
        (acc, r) => acc + ((r.resolution_rate ?? 0) / 100) * (r.total_conversations ?? 0),
        0
      );

      return {
        totalConversations: totalConv,
        totalMessages: sum((r) => r.total_messages),
        avgResolutionRate: totalConv > 0 ? (resolvedApprox / totalConv) * 100 : 0,
        totalCostBRL: sum((r) => r.estimated_cost) * 5.0,
      };
    },
  });
}

export function useAnalyticsDaily(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["analytics-daily", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics_daily")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AnalyticsDaily[];
    },
  });
}
