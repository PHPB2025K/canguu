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

  useEffect(() => {
    const channel = supabase
      .channel('sidebar-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sidebar-escalation-count'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sidebar-conversation-count'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return { pendingEscalations, activeConversations };
}
