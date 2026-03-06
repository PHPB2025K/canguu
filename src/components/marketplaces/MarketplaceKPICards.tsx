import { HelpCircle, MessageCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnansweredCount, useActiveChatCount } from '@/hooks/useMarketplaces';

export function MarketplaceKPICards() {
  const { data: unanswered, isLoading: l1 } = useUnansweredCount();
  const { data: activeChats, isLoading: l2 } = useActiveChatCount();

  const cards = [
    {
      label: 'Perguntas Pendentes',
      value: unanswered ?? 0,
      icon: HelpCircle,
      iconBg: 'bg-warning/15',
      iconColor: 'text-warning',
      valueColor: (unanswered ?? 0) > 0 ? 'text-warning' : 'text-success',
      loading: l1,
    },
    {
      label: 'Chats Ativos',
      value: activeChats ?? 0,
      icon: MessageCircle,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      valueColor: 'text-primary',
      loading: l2,
    },
    {
      label: 'Tempo Médio Resposta',
      value: '12min',
      icon: Clock,
      iconBg: 'bg-secondary/15',
      iconColor: 'text-secondary',
      valueColor: 'text-foreground',
      loading: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((c) => (
        <Card key={c.label} className="border-border shadow-sm rounded-xl">
          <CardContent className="p-6">
            {c.loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className={`text-2xl font-bold ${c.valueColor}`}>{c.value}</p>
                </div>
                <div className={`${c.iconBg} rounded-lg p-2`}>
                  <c.icon className={`h-5 w-5 ${c.iconColor}`} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
