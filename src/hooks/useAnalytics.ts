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
      const avg = (fn: (r: AnalyticsDaily) => number | null) => {
        const vals = rows.map(fn).filter((v): v is number => v != null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };

      return {
        totalConversations: sum((r) => r.total_conversations),
        totalMessages: sum((r) => r.total_messages),
        avgResolutionRate: avg((r) => r.resolution_rate),
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
