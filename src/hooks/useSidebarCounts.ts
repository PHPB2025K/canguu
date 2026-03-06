import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useSidebarCounts() {
  const queryClient = useQueryClient();

  const { data: pendingEscalations = 0 } = useQuery({
    queryKey: ['sidebar-escalation-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('escalations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count ?? 0;
    },
  });

  const { data: activeConversations = 0 } = useQuery({
    queryKey: ['sidebar-conversation-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      return count ?? 0;
    },
  });

  const { data: marketplacePending = 0 } = useQuery({
    queryKey: ['sidebar-marketplace-count'],
    queryFn: async () => {
      const { count: unanswered } = await supabase
        .from('marketplace_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'unanswered');

      const { data: chats } = await supabase
        .from('marketplace_chats')
        .select('unread_count');

      const totalUnread = (chats ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      return (unanswered ?? 0) + totalUnread;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('sidebar-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sidebar-escalation-count'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sidebar-conversation-count'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_questions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_chats' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sidebar-marketplace-count'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return { pendingEscalations, activeConversations, marketplacePending };
}
