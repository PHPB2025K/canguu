import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MarketplaceTokenStatus } from '@/types/database';

export function useMarketplaceTokenStatus() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['marketplace-token-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_token_status' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceTokenStatus[];
    },
  });

  // Realtime subscription to invalidate on changes
  useEffect(() => {
    const channel = supabase
      .channel('marketplace-tokens-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketplace_tokens' },
        () => {
          qc.invalidateQueries({ queryKey: ['marketplace-token-status'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export function usePlatformAnsweredCount(platform: string) {
  return useQuery({
    queryKey: ['platform-answered-count', platform],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('marketplace_questions')
        .select('id', { count: 'exact', head: true })
        .eq('platform', platform)
        .eq('status', 'answered');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function usePlatformAvgResponseTime(platform: string) {
  return useQuery({
    queryKey: ['platform-avg-response', platform],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_questions')
        .select('created_at, answered_at')
        .eq('platform', platform)
        .eq('status', 'answered')
        .not('answered_at', 'is', null);
      if (error) throw error;
      if (!data || data.length === 0) return null;

      const totalMs = data.reduce((sum, q) => {
        const diff = new Date(q.answered_at!).getTime() - new Date(q.created_at!).getTime();
        return sum + diff;
      }, 0);
      const avgMin = Math.round(totalMs / data.length / 60000);
      return avgMin;
    },
  });
}
