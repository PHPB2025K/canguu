import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MarketplaceQuestion, MarketplaceChat, MarketplaceChatMessage } from '@/types/database';

/** Realtime hook — call once at module level (e.g. in Marketplaces page) */
export function useMarketplaceRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('marketplace-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_questions' }, () => {
        qc.invalidateQueries({ queryKey: ['marketplace-questions'] });
        qc.invalidateQueries({ queryKey: ['marketplace-question-counts'] });
        qc.invalidateQueries({ queryKey: ['marketplace-unanswered-count'] });
        qc.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_chats' }, () => {
        qc.invalidateQueries({ queryKey: ['marketplace-chats'] });
        qc.invalidateQueries({ queryKey: ['marketplace-active-chats'] });
        qc.invalidateQueries({ queryKey: ['marketplace-total-unread'] });
        qc.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}

export function useMarketplaceQuestions(platform?: string, status?: string, search?: string) {
  return useQuery({
    queryKey: ['marketplace-questions', platform, status, search],
    queryFn: async () => {
      let query = supabase
        .from('marketplace_questions')
        .select('*')
        .not('seller_id', 'is', null)
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

      const priority: Record<string, number> = {
        unanswered: 0,
        failed: 1,
        ai_suggested: 2,
        skipped: 3,
        answered: 4,
      };
      return (data as MarketplaceQuestion[]).sort((a, b) => {
        const pa = priority[a.status] ?? 5;
        const pb = priority[b.status] ?? 5;
        if (pa !== pb) return pa - pb;
        const dateA = a.external_created_at ?? a.created_at ?? '';
        const dateB = b.external_created_at ?? b.created_at ?? '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
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
        .eq('status', 'unanswered')
        .not('seller_id', 'is', null);
      const { count: aiSuggested } = await supabase
        .from('marketplace_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ai_suggested')
        .not('seller_id', 'is', null);
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
        .eq('status', 'unanswered')
        .not('seller_id', 'is', null);
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

export function useMarketplaceChats(platform?: string, status?: string) {
  return useQuery({
    queryKey: ['marketplace-chats', platform, status],
    queryFn: async () => {
      let query = supabase
        .from('marketplace_chats')
        .select('*')
        .order('updated_at', { ascending: false });

      if (platform && platform !== 'all') {
        query = query.eq('platform', platform);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data as MarketplaceChat[]).sort((a, b) => {
        const ua = (a.unread_count ?? 0) > 0 ? 0 : 1;
        const ub = (b.unread_count ?? 0) > 0 ? 0 : 1;
        if (ua !== ub) return ua - ub;
        return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      });
    },
  });
}

export function useMarketplaceChatMessages(chatId: string | null) {
  return useQuery({
    queryKey: ['marketplace-chat-messages', chatId],
    enabled: !!chatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_chat_messages')
        .select('*')
        .eq('chat_id', chatId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as MarketplaceChatMessage[];
    },
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, content }: { chatId: string; content: string }) => {
      const { error: msgError } = await supabase
        .from('marketplace_chat_messages')
        .insert({ chat_id: chatId, role: 'seller', content, message_type: 'text' });
      if (msgError) throw msgError;

      const { error: chatError } = await supabase
        .from('marketplace_chats')
        .update({ last_message_preview: content, updated_at: new Date().toISOString() })
        .eq('id', chatId);
      if (chatError) throw chatError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-chat-messages'] });
      qc.invalidateQueries({ queryKey: ['marketplace-chats'] });
      qc.invalidateQueries({ queryKey: ['marketplace-total-unread'] });
    },
  });
}

export function useResolveChatMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase
        .from('marketplace_chats')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', chatId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-chats'] });
      qc.invalidateQueries({ queryKey: ['marketplace-active-chats'] });
      qc.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
    },
  });
}

export function useApproveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('marketplace_chat_messages')
        .update({ ai_suggested: false })
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-chat-messages'] });
    },
  });
}

export function useDiscardSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('marketplace_chat_messages')
        .delete()
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-chat-messages'] });
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

// ─── Feedback & Corrections ─────────────────────────────────────

export function useFeedbackQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ questionId, feedback }: { questionId: string; feedback: 'good' | 'bad' }) => {
      const { error } = await supabase
        .from('marketplace_questions' as any)
        .update({ feedback, feedback_at: new Date().toISOString() } as any)
        .eq('id', questionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-questions'] });
    },
  });
}

export function useSubmitCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (correction: {
      questionId: string;
      productSku: string | null;
      originalQuestion: string;
      aiResponse: string | null;
      recommendedResponse: string;
    }) => {
      const { error: corrError } = await supabase
        .from('response_corrections' as any)
        .insert({
          question_id: correction.questionId,
          product_sku: correction.productSku,
          original_question: correction.originalQuestion,
          ai_response: correction.aiResponse,
          recommended_response: correction.recommendedResponse,
          corrected_by: 'admin',
          status: 'pending',
        } as any);
      if (corrError) throw corrError;

      await supabase
        .from('marketplace_questions' as any)
        .update({ feedback: 'bad', feedback_at: new Date().toISOString() } as any)
        .eq('id', correction.questionId);

      // Fire-and-forget: trigger embedding generation
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch('https://jpacmloqsfiebvagfomt.supabase.co/functions/v1/process-correction-embedding', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-questions'] });
    },
  });
}
