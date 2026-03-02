import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/common/SearchBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SentimentBadge } from "@/components/common/SentimentBadge";
import { RelativeTime } from "@/components/common/RelativeTime";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { useConversationList } from "@/hooks/useConversations";
import { truncateText } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function getInitials(name: string | null): string {
  if (!name) return "??";
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [sentiment, setSentiment] = useState<string>("");

  const hasFilters = !!status || !!category || !!sentiment || !!search;

  const { data: conversations, isLoading } = useConversationList({
    status: status || undefined,
    category: category || undefined,
    sentiment: sentiment || undefined,
    search: search || undefined,
  });

  const clearFilters = () => {
    setStatus("");
    setCategory("");
    setSentiment("");
    setSearch("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 space-y-2 border-b border-border shrink-0">
        <SearchBar
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={setSearch}
        />
        <div className="flex gap-1.5 items-center flex-wrap">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs w-[100px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="escalated">Escalonado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs w-[120px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="duvida_produto">Dúvida Produto</SelectItem>
              <SelectItem value="reclamacao">Reclamação</SelectItem>
              <SelectItem value="troca">Troca</SelectItem>
              <SelectItem value="rastreamento">Rastreamento</SelectItem>
              <SelectItem value="elogio">Elogio</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sentiment} onValueChange={setSentiment}>
            <SelectTrigger className="h-8 text-xs w-[110px]">
              <SelectValue placeholder="Sentimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="positivo">Positivo</SelectItem>
              <SelectItem value="negativo">Negativo</SelectItem>
              <SelectItem value="neutro">Neutro</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground px-2">
              <X className="h-3 w-3 mr-1" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3">
            <LoadingState type="list" />
          </div>
        ) : !conversations?.length ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa encontrada"
            description="Tente ajustar os filtros"
          />
        ) : (
          <div>
            {conversations.map((conv) => {
              const isSelected = conv.id === selectedId;
              const isUnread = conv.lastMessage?.sender === "customer";

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50",
                    isSelected && "bg-blue-500/10 border-l-2 border-blue-400",
                    !isSelected && "border-l-2 border-transparent"
                  )}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground shrink-0">
                    {getInitials(conv.customers?.name)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground text-sm truncate">
                        {conv.customers?.name || "Sem nome"}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isUnread && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                        {conv.updated_at && (
                          <RelativeTime date={conv.updated_at} className="text-xs text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.lastMessage ? truncateText(conv.lastMessage.content, 60) : "Sem mensagens"}
                    </p>
                    <div className="flex gap-1 mt-1">
                      {conv.status && <StatusBadge status={conv.status} className="text-[10px] px-1.5 py-0" />}
                      {conv.sentiment && <SentimentBadge sentiment={conv.sentiment} className="text-[10px] px-1.5 py-0" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
