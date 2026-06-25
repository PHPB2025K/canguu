import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { MarketplaceKPICards } from '@/components/marketplaces/MarketplaceKPICards';
import { QuestionsTab } from '@/components/marketplaces/QuestionsTab';
import { ChatsTab } from '@/components/marketplaces/ChatsTab';
import { ConfigTab } from '@/components/marketplaces/ConfigTab';
import { LearningTab } from '@/components/marketplaces/LearningTab';
import { useUnansweredCount, useTotalUnreadCount, useMarketplaceRealtime, useLearningQueueCount } from '@/hooks/useMarketplaces';
import { useMarketplaceTokenStatus } from '@/hooks/useMarketplaceTokens';

function ConnectionIndicators() {
  const { data: tokens } = useMarketplaceTokenStatus();
  const mlToken = tokens?.find(t => t.platform === 'mercado_livre');

  const mlConnected = mlToken?.connection_status === 'connected';
  const mlLabel = mlConnected
    ? `Conectado (${mlToken?.seller_nickname ?? ''})`
    : mlToken?.connection_status === 'expired'
      ? 'Expirado'
      : 'Não configurado';
  const mlDot = mlConnected ? 'bg-success' : mlToken ? 'bg-destructive' : 'bg-muted-foreground';

  return (
    <div className="flex items-center gap-4 text-[13px] text-muted-foreground flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${mlDot}`} />
        Mercado Livre: {mlLabel}
      </span>
      <span className="text-border">•</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-warning" />
        Shopee: Aguardando
      </span>
      <span className="text-border">•</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground" />
        Amazon: Em breve
      </span>
    </div>
  );
}

const Marketplaces = () => {
  useMarketplaceRealtime();
  const { data: unanswered = 0 } = useUnansweredCount();
  const { data: totalUnread = 0 } = useTotalUnreadCount();
  const { data: learningCount = 0 } = useLearningQueueCount();

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] overflow-hidden gap-6">
      <div className="shrink-0 space-y-2">
        <PageHeader
          title="Integrações Marketplaces"
          description="Gerencie perguntas e chats do Mercado Livre, Shopee e Amazon"
        />
        <ConnectionIndicators />
      </div>

      <div className="shrink-0">
        <MarketplaceKPICards />
      </div>

      <Tabs defaultValue="questions" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="shrink-0">
          <TabsTrigger value="questions" className="gap-1.5">
            Perguntas
            {unanswered > 0 && (
              <span className="bg-warning/20 text-warning text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">
                {unanswered}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="chats" className="gap-1.5">
            Chats
            {totalUnread > 0 && (
              <span className="bg-destructive/20 text-destructive text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">
                {totalUnread}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-1.5">
            Aprendizados
            {learningCount > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">
                {learningCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-4">
          <QuestionsTab />
        </TabsContent>
        <TabsContent value="chats" className="flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-4">
          <ChatsTab />
        </TabsContent>
        <TabsContent value="learning" className="flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-4">
          <LearningTab />
        </TabsContent>
        <TabsContent value="config" className="flex-1 min-h-0 overflow-y-auto mt-4">
          <ConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Marketplaces;
