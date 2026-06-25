import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Hash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ConversationChat } from "@/components/conversations/ConversationChat";
import { LearningList } from "@/components/marketplaces/LearningList";
import { usePageTitle } from "@/hooks/usePageTitle";

// Módulo Instagram — Direct (conversa) + Comentários (pergunta/comentário, em breve) + Aprendizados.
const InstagramPage = () => {
  usePageTitle("Instagram");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSelect = (id: string) => {
    if (window.innerWidth < 1024) navigate(`/conversations/${id}`);
    else setSelectedId(id);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6">
      <Tabs defaultValue="direct" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 self-start mx-4 mt-3">
          <TabsTrigger value="direct" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Direct</TabsTrigger>
          <TabsTrigger value="comentarios" className="gap-1.5"><Hash className="h-3.5 w-3.5" /> Comentários</TabsTrigger>
          <TabsTrigger value="aprendizados">Aprendizados</TabsTrigger>
        </TabsList>

        {/* Direct = conversa multi-turno (channel='instagram') */}
        <TabsContent value="direct" className="flex-1 min-h-0 data-[state=active]:flex mt-2">
          <div className="w-full lg:w-96 lg:border-r border-border flex flex-col">
            <ConversationList selectedId={selectedId} onSelect={handleSelect} channel="instagram" />
          </div>
          <div className="hidden lg:flex flex-1 flex-col">
            <ConversationChat conversationId={selectedId} />
          </div>
        </TabsContent>

        {/* Comentários em posts/anúncios = pergunta/comentário — ainda NÃO integrado */}
        <TabsContent value="comentarios" className="flex-1 min-h-0 overflow-y-auto mt-2">
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 mb-3">
              Em breve · não integrado
            </span>
            <Hash className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-base font-medium text-foreground">Comentários em posts e anúncios</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Aqui vão aparecer perguntas e comentários do Instagram (posts/anúncios). A integração ainda
              não está ligada — esta aba é um placeholder. Não é bug: a fonte de comentários não existe ainda.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="aprendizados" className="flex-1 min-h-0 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground mb-3">
            Aprendizados que se aplicam ao Instagram (específicos + transversais) — recorte da base central.
          </p>
          <LearningList channel="instagram" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InstagramPage;
