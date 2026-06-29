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
  // Seleção SEPARADA por aba (Direct vs Comentários) — senão o chat "vaza" de uma aba pra outra.
  const [selDirect, setSelDirect] = useState<string | null>(null);
  const [selComment, setSelComment] = useState<string | null>(null);
  const navigate = useNavigate();

  const makeSelect = (setter: (id: string | null) => void) => (id: string) => {
    if (window.innerWidth < 1024) navigate(`/conversations/${id}`);
    else setter(id);
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
            <ConversationList selectedId={selDirect} onSelect={makeSelect(setSelDirect)} channel="instagram" />
          </div>
          <div className="hidden lg:flex flex-1 flex-col">
            <ConversationChat conversationId={selDirect} />
          </div>
        </TabsContent>

        {/* Comentários em posts/anúncios = conversa separada (channel='instagram_comment') */}
        <TabsContent value="comentarios" className="flex-1 min-h-0 data-[state=active]:flex mt-2">
          <div className="w-full lg:w-96 lg:border-r border-border flex flex-col">
            <ConversationList selectedId={selComment} onSelect={makeSelect(setSelComment)} channel="instagram_comment" />
          </div>
          <div className="hidden lg:flex flex-1 flex-col">
            <ConversationChat conversationId={selComment} />
          </div>
        </TabsContent>

        <TabsContent value="aprendizados" className="flex-1 min-h-0 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground mb-3">
            Aprendizados que surgiram no Instagram, aguardando sua revisão. O histórico completo e a gestão por escopo ficam no módulo Aprendizados.
          </p>
          <LearningList channel="instagram" statuses={['auto_review']} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InstagramPage;
