import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { MarketplaceKPICards } from '@/components/marketplaces/MarketplaceKPICards';
import { QuestionsTab } from '@/components/marketplaces/QuestionsTab';
import { ChatsTab } from '@/components/marketplaces/ChatsTab';
import { ConfigTab } from '@/components/marketplaces/ConfigTab';
import { useUnansweredCount, useTotalUnreadCount } from '@/hooks/useMarketplaces';

const Marketplaces = () => {
  const { data: unanswered = 0 } = useUnansweredCount();
  const { data: totalUnread = 0 } = useTotalUnreadCount();

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] overflow-hidden gap-6">
      <div className="shrink-0">
        <PageHeader
          title="Integrações Marketplaces"
          description="Gerencie perguntas e chats do Mercado Livre, Shopee e Amazon"
        />
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
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-4">
          <QuestionsTab />
        </TabsContent>
        <TabsContent value="chats" className="flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col mt-4">
          <ChatsTab />
        </TabsContent>
        <TabsContent value="config" className="flex-1 min-h-0 overflow-y-auto mt-4">
          <ConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Marketplaces;
