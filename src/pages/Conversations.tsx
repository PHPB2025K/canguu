import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ConversationChat } from "@/components/conversations/ConversationChat";
import { LearningList } from "@/components/marketplaces/LearningList";
import { usePageTitle } from "@/hooks/usePageTitle";

// Módulo WhatsApp — exclusivamente conversas (multi-turno) do WhatsApp + recorte de aprendizados.
const Conversations = () => {
  usePageTitle("WhatsApp");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSelect = (id: string) => {
    if (window.innerWidth < 1024) navigate(`/conversations/${id}`);
    else setSelectedId(id);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6">
      <Tabs defaultValue="conversas" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 self-start mx-4 mt-3">
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="aprendizados">Aprendizados</TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="flex-1 min-h-0 data-[state=active]:flex mt-2">
          <div className="w-full lg:w-96 lg:border-r border-border flex flex-col">
            <ConversationList selectedId={selectedId} onSelect={handleSelect} channel="whatsapp" />
          </div>
          <div className="hidden lg:flex flex-1 flex-col">
            <ConversationChat conversationId={selectedId} />
          </div>
        </TabsContent>

        <TabsContent value="aprendizados" className="flex-1 min-h-0 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground mb-3">
            Aprendizados que se aplicam ao WhatsApp (específicos + transversais) — recorte da base central.
          </p>
          <LearningList channel="whatsapp" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Conversations;
