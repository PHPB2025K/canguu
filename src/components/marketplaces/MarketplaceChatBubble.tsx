import { format } from 'date-fns';
import { User, UserCheck, Bot, Sparkles, Send, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MarketplaceChatMessage } from '@/types/database';

interface MarketplaceChatBubbleProps {
  message: MarketplaceChatMessage;
  onApprove?: (id: string) => void;
  onEdit?: (content: string) => void;
  onDiscard?: (id: string) => void;
}

export function MarketplaceChatBubble({ message, onApprove, onEdit, onDiscard }: MarketplaceChatBubbleProps) {
  const isBuyer = message.role === 'buyer';
  const isSeller = message.role === 'seller';
  const isAi = message.role === 'ai_agent';
  const isSuggestion = isAi && message.ai_suggested === true;
  const isRight = isSeller || isAi;

  const time = message.created_at ? format(new Date(message.created_at), 'HH:mm') : '';

  return (
    <div className={cn('flex', isRight ? 'justify-end' : 'justify-start')}>
      <div className="flex flex-col gap-1 max-w-[75%]">
        {/* Role icon + label */}
        <div className={cn('flex items-center gap-1.5', isRight && 'justify-end')}>
          {isBuyer && <User className="h-3.5 w-3.5 text-muted-foreground" />}
          {isSeller && <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />}
          {isAi && !isSuggestion && <Bot className="h-3.5 w-3.5 text-primary" />}
          {isSuggestion && <Sparkles className="h-3.5 w-3.5 text-primary" />}

          {isBuyer && <span className="text-xs text-muted-foreground">Comprador</span>}
          {isSeller && <span className="text-xs text-muted-foreground">Atendente</span>}
          {isAi && !isSuggestion && <span className="text-xs font-medium text-primary">Giovana (IA)</span>}
          {isSuggestion && <span className="text-xs font-medium text-primary">Sugestão da Giovana</span>}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-3 text-sm text-foreground',
            isBuyer && 'bg-muted rounded-xl rounded-bl-sm',
            isSeller && 'bg-primary/[0.12] rounded-xl rounded-br-sm',
            isAi && !isSuggestion && 'bg-porcelain rounded-xl rounded-br-sm',
            isSuggestion && 'bg-porcelain border-[1.5px] border-dashed border-primary rounded-xl rounded-br-sm',
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* AI suggestion action buttons */}
        {isSuggestion && (
          <div className="flex items-center gap-2 mt-1">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onApprove?.(message.id)}>
              <Send className="h-3 w-3" /> Enviar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onEdit?.(message.content)}>
              <Pencil className="h-3 w-3" /> Editar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => onDiscard?.(message.id)}>
              <Trash2 className="h-3 w-3" /> Descartar
            </Button>
          </div>
        )}

        {/* Timestamp */}
        <span className={cn('text-[11px] text-muted-foreground', isRight && 'text-right')}>{time}</span>
      </div>
    </div>
  );
}
