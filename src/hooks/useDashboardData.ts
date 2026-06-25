import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STALE_TIME = 60_000;

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

function yesterdayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

export function usePendingEscalations() {
  return useQuery({
    queryKey: ["dashboard", "pending-escalations"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("escalations")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: STALE_TIME,
  });
}

export function useConversationsToday() {
  return useQuery({
    queryKey: ["dashboard", "conversations-today"],
    queryFn: async () => {
      const today = todayRange();
      const yesterday = yesterdayRange();

      const [todayRes, yesterdayRes] = await Promise.all([
        supabase.from("conversations").select("*", { count: "exact", head: true })
          .gte("created_at", today.start).lt("created_at", today.end),
        supabase.from("conversations").select("*", { count: "exact", head: true })
          .gte("created_at", yesterday.start).lt("created_at", yesterday.end),
      ]);

      if (todayRes.error) throw todayRes.error;
      if (yesterdayRes.error) throw yesterdayRes.error;

      const todayCount = todayRes.count ?? 0;
      const yesterdayCount = yesterdayRes.count ?? 0;
      const trend = yesterdayCount > 0
        ? ((todayCount - yesterdayCount) / yesterdayCount) * 100
        : todayCount > 0 ? 100 : 0;

      return { today: todayCount, yesterday: yesterdayCount, trend };
    },
    staleTime: STALE_TIME,
  });
}

export function useTodayAnalytics() {
  return useQuery({
    queryKey: ["dashboard", "today-analytics"],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split("T")[0];

      // Try today first, fallback to latest available
      let { data, error } = await supabase
        .from("analytics_daily")
        .select("*")
        .eq("date", todayStr)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const fallback = await supabase
          .from("analytics_daily")
          .select("*")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallback.error) throw fallback.error;
        data = fallback.data;
      }

      return data;
    },
    staleTime: STALE_TIME,
  });
}

export function useConversationsByHour() {
  return useQuery({
    queryKey: ["dashboard", "conversations-by-hour"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("conversations")
        .select("created_at")
        .gte("created_at", since);

      if (error) throw error;

      // Group by hour
      const counts: Record<number, number> = {};
      for (let i = 0; i < 24; i++) counts[i] = 0;

      (data ?? []).forEach((c) => {
        const hour = new Date(c.created_at!).getHours();
        counts[hour] = (counts[hour] || 0) + 1;
      });

      return Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, "0")}h`,
        count: counts[i] || 0,
      }));
    },
    staleTime: STALE_TIME,
  });
}


export function useRecentConversations() {
  return useQuery({
    queryKey: ["dashboard", "recent-conversations"],
    queryFn: async () => {
      const { data: conversations, error } = await supabase
        .from("conversations")
        .select("id, status, sentiment, category, created_at, updated_at, customers(id, name, phone)")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!conversations || conversations.length === 0) return [];

      const ids = conversations.map((c) => c.id);

      // Fetch latest message per conversation
      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at, message_type")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });

      const lastMessageMap: Record<string, { content: string; message_type: string | null }> = {};
      (messages ?? []).forEach((m) => {
        if (!lastMessageMap[m.conversation_id]) {
          lastMessageMap[m.conversation_id] = { content: m.content, message_type: m.message_type };
        }
      });

      return conversations.map((c) => ({
        ...c,
        lastMessage: lastMessageMap[c.id] || null,
      }));
    },
    staleTime: STALE_TIME,
  });
}
