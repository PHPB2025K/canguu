import { useEffect, useRef } from "react";
import { MessageSquare, Bot, UserCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SentimentBadge } from "@/components/common/SentimentBadge";
import { LoadingState } from "@/components/common/LoadingState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formatPhone } from "@/lib/formatters";
import { useConversationMessages, useConversationDetail, useSendMessage, useUpdateAssignment } from "@/hooks/useConversations";
import { MessageBubble } from "./MessageBubble";
import { DateSeparator } from "./DateSeparator";
import { ChatInput } from "./ChatInput";
import { useState } from "react";

interface ConversationChatProps {
  conversationId: string | null;
  onBack?: () => void;
  showBackButton?: boolean;
}

export function ConversationChat({ conversationId, onBack, showBackButton }: ConversationChatProps) {
  const { data: conversation, isLoading: loadingDetail } = useConversationDetail(conversationId);
  const { data: messages = [], isLoading: loadingMessages } = useConversationMessages(conversationId);
  const sendMessage = useSendMessage();
  const updateAssignment = useUpdateAssignment();
  const [confirmDialog, setConfirmDialog] = useState<"assume" | "return" | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
        <MessageSquare className="h-16 w-16 text-muted-foreground/20" />
        <p className="text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  if (loadingDetail || loadingMessages) {
    return (
      <div className="flex-1 p-6">
        <LoadingState type="chat" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Conversa não encontrada
      </div>
    );
  }

  const isAgent = conversation.assigned_to === "agent";
  const customer = conversation.customers;

  const handleAssignment = () => {
    const newAssignment = isAgent ? "human_agent" : "agent";
    updateAssignment.mutate({ conversationId: conversation.id, assignedTo: newAssignment });
    setConfirmDialog(null);
  };

  // Group messages by date for separators
  let lastDate = "";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="h-16 border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {showBackButton && (
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm truncate">{customer?.name || (customer?.phone ? formatPhone(customer.phone) : "Sem identificação")}</p>
            <p className="text-xs text-muted-foreground">{customer?.phone ? formatPhone(customer.phone) : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {conversation.status && <StatusBadge status={conversation.status} />}
          {conversation.sentiment && <SentimentBadge sentiment={conversation.sentiment} />}
          <Button
            variant={isAgent ? "default" : "outline"}
            size="sm"
            onClick={() => setConfirmDialog(isAgent ? "assume" : "return")}
            className={isAgent ? "bg-primary hover:bg-primary/90" : ""}
          >
            {isAgent ? <UserCheck className="h-4 w-4 mr-1.5" /> : <Bot className="h-4 w-4 mr-1.5" />}
            {isAgent ? "Assumir" : "Devolver"}
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => {
            const msgDate = msg.created_at ? new Date(msg.created_at).toDateString() : "";
            const showSeparator = msgDate !== lastDate;
            lastDate = msgDate;

            return (
              <div key={msg.id}>
                {showSeparator && msg.created_at && <DateSeparator date={msg.created_at} />}
                <MessageBubble message={msg} />
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput
        onSend={(content) => sendMessage.mutate({ conversationId: conversation.id, content })}
        disabled={isAgent}
        isSending={sendMessage.isPending}
      />

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmDialog === "assume"}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        title="Assumir Atendimento"
        description="Deseja assumir este atendimento? O agente IA será pausado para esta conversa."
        confirmLabel="Assumir"
        onConfirm={handleAssignment}
      />
      <ConfirmDialog
        open={confirmDialog === "return"}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        title="Devolver ao Agente IA"
        description="Deseja devolver este atendimento ao agente IA?"
        confirmLabel="Devolver"
        onConfirm={handleAssignment}
      />
    </div>
  );
}
