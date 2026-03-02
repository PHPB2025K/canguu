import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type AgentConfig = Record<string, string>;

export function useAgentConfig() {
  return useQuery({
    queryKey: ['agent-config'],
    queryFn: async (): Promise<AgentConfig> => {
      const { data, error } = await supabase
        .from('agent_config')
        .select('config_key, config_value');
      if (error) throw error;
      const record: AgentConfig = {};
      for (const row of data ?? []) {
        record[row.config_key] = row.config_value;
      }
      return record;
    },
  });
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: AgentConfig) => {
      const entries = Object.entries(updates);
      if (entries.length === 0) return;

      // Upsert each key individually (agent_config uses config_key as unique)
      for (const [key, value] of entries) {
        const { error } = await supabase
          .from('agent_config')
          .update({ config_value: value, updated_at: new Date().toISOString() })
          .eq('config_key', key);

        if (error) {
          // Key might not exist, try insert
          const { error: insertError } = await supabase
            .from('agent_config')
            .insert({ config_key: key, config_value: value });
          if (insertError) throw insertError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-config'] });
      toast({ title: 'Configurações salvas com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar configurações', description: error.message, variant: 'destructive' });
    },
  });
}

export function useIntegrationStats() {
  return useQuery({
    queryKey: ['integration-stats'],
    queryFn: async () => {
      const [products, customers, conversations] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
      ]);
      return {
        products: products.count ?? 0,
        customers: customers.count ?? 0,
        conversations: conversations.count ?? 0,
      };
    },
  });
}
