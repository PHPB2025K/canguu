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
        .eq('status', 'answered')
        .not('seller_id', 'is', null);
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
        .select('ai_response_time_ms')
        .eq('platform', platform)
        .eq('status', 'answered')
        .not('seller_id', 'is', null)
        .not('ai_response_time_ms', 'is', null);
      if (error) throw error;
      if (!data || data.length === 0) return null;

      const totalMs = data.reduce((sum, q) => sum + (q.ai_response_time_ms ?? 0), 0);
      const avgSeconds = Math.round(totalMs / data.length / 100) / 10; // e.g. 4.1
      return avgSeconds;
    },
  });
}
