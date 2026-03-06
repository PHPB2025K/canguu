import { useEffect, useRef, useState } from 'react';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './PlatformBadge';
import { MarketplaceChatBubble } from './MarketplaceChatBubble';
import { ChatInput } from '@/components/conversations/ChatInput';
import {
  useMarketplaceChatMessages,
  useSendChatMessage,
  useResolveChatMutation,
  useApproveSuggestion,
  useDiscardSuggestion,
} from '@/hooks/useMarketplaces';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { MarketplaceChat } from '@/types/database';

const statusMap: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-success/15 text-success border-transparent' },
  resolved: { label: 'Resolvido', className: 'bg-muted text-muted-foreground border-transparent' },
  waiting: { label: 'Aguardando', className: 'bg-warning/15 text-warning border-transparent' },
};

interface MarketplaceChatViewProps {
  chat: MarketplaceChat | null;
  onBack?: () => void;
  showBack?: boolean;
}

export function MarketplaceChatView({ chat, onBack, showBack }: MarketplaceChatViewProps) {
  const { data: messages, isLoading } = useMarketplaceChatMessages(chat?.id ?? null);
  const sendMessage = useSendChatMessage();
  const resolveChat = useResolveChatMutation();
  const approveSuggestion = useApproveSuggestion();
  const discardSuggestion = useDiscardSuggestion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editDraft, setEditDraft] = useState('');

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background">
        <MessageCircle className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-base font-medium text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  const statusStyle = statusMap[chat.status] ?? statusMap.active;

  const handleSend = (content: string) => {
    sendMessage.mutate({ chatId: chat.id, content }, {
      onSuccess: () => toast({ title: 'Mensagem enviada!' }),
    });
  };

  const handleResolve = () => {
    resolveChat.mutate(chat.id, {
      onSuccess: () => toast({ title: 'Conversa resolvida!' }),
    });
  };

  const handleApprove = (messageId: string) => {
    approveSuggestion.mutate(messageId, {
      onSuccess: () => toast({ title: 'Resposta enviada!' }),
    });
  };

  const handleDiscard = (messageId: string) => {
    discardSuggestion.mutate(messageId, {
      onSuccess: () => toast({ title: 'Sugestão descartada' }),
    });
  };

  const handleEdit = (content: string) => {
    setEditDraft(content);
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      {/* Header */}
      <div className="h-16 bg-card border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <PlatformBadge platform={chat.platform} />
          <span className="text-[15px] font-semibold text-foreground truncate">{chat.buyer_nickname}</span>
          {chat.product_name && (
            <span className="text-[13px] text-muted-foreground truncate hidden sm:inline"> • {chat.product_name}</span>
          )}
          {!chat.product_name && chat.order_id && (
            <span className="text-[13px] text-muted-foreground truncate hidden sm:inline"> • Pedido {chat.order_id}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn('text-xs', statusStyle.className)}>
            {statusStyle.label}
          </Badge>
          {chat.status !== 'resolved' && (
            <Button variant="outline" size="sm" onClick={handleResolve} disabled={resolveChat.isPending}>
              Resolver
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
              <Skeleton className="h-16 w-56 rounded-xl" />
            </div>
          ))
        ) : (
          messages?.map((msg) => (
            <MarketplaceChatBubble
              key={msg.id}
              message={msg}
              onApprove={handleApprove}
              onEdit={handleEdit}
              onDiscard={handleDiscard}
            />
          ))
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isSending={sendMessage.isPending}
        disabled={chat.status === 'resolved'}
      />
    </div>
  );
}
