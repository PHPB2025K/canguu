import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MarketplaceQuestion } from '@/types/database';

export function useMarketplaceQuestions(platform?: string, status?: string, search?: string) {
  return useQuery({
    queryKey: ['marketplace-questions', platform, status, search],
    queryFn: async () => {
      let query = supabase
        .from('marketplace_questions')
        .select('*')
        .order('status', { ascending: true }) // unanswered first alphabetically
        .order('created_at', { ascending: false });

      if (platform && platform !== 'all') {
        query = query.eq('platform', platform);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      if (search) {
        query = query.or(`question_text.ilike.%${search}%,product_name.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Sort: unanswered first, then ai_suggested, then answered
      const priority: Record<string, number> = { unanswered: 0, ai_suggested: 1, answered: 2 };
      return (data as MarketplaceQuestion[]).sort((a, b) => {
        const pa = priority[a.status] ?? 3;
        const pb = priority[b.status] ?? 3;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      });
    },
  });
}

export function useMarketplaceQuestionCounts() {
  return useQuery({
    queryKey: ['marketplace-question-counts'],
    queryFn: async () => {
      const { count: unanswered } = await supabase
        .from('marketplace_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'unanswered');
      const { count: aiSuggested } = await supabase
        .from('marketplace_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ai_suggested');
      return { unanswered: unanswered ?? 0, aiSuggested: aiSuggested ?? 0 };
    },
  });
}

export function useUnansweredCount() {
  return useQuery({
    queryKey: ['marketplace-unanswered-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('marketplace_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'unanswered');
      return count ?? 0;
    },
  });
}

export function useActiveChatCount() {
  return useQuery({
    queryKey: ['marketplace-active-chats'],
    queryFn: async () => {
      const { count } = await supabase
        .from('marketplace_chats')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      return count ?? 0;
    },
  });
}

export function useTotalUnreadCount() {
  return useQuery({
    queryKey: ['marketplace-total-unread'],
    queryFn: async () => {
      const { data } = await supabase
        .from('marketplace_chats')
        .select('unread_count');
      return (data ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    },
  });
}

export function useAnswerQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, answer_text, answered_by }: { id: string; answer_text: string; answered_by: string }) => {
      const { error } = await supabase
        .from('marketplace_questions')
        .update({
          answer_text,
          status: 'answered',
          answered_by,
          answered_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-questions'] });
      qc.invalidateQueries({ queryKey: ['marketplace-question-counts'] });
      qc.invalidateQueries({ queryKey: ['marketplace-unanswered-count'] });
      qc.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
    },
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('marketplace_questions')
        .update({
          ai_suggested_answer: null,
          status: 'unanswered',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-questions'] });
      qc.invalidateQueries({ queryKey: ['marketplace-question-counts'] });
      qc.invalidateQueries({ queryKey: ['marketplace-unanswered-count'] });
      qc.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
    },
  });
}
