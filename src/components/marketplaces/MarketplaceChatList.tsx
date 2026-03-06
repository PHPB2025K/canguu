import { MessageCircle, Package, ShoppingBag } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './PlatformBadge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { MarketplaceChat } from '@/types/database';

interface MarketplaceChatListProps {
  chats: MarketplaceChat[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (chat: MarketplaceChat) => void;
  platform: string;
  onPlatformChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
}

export function MarketplaceChatList({
  chats, isLoading, selectedId, onSelect,
  platform, onPlatformChange, status, onStatusChange,
}: MarketplaceChatListProps) {
  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Filters */}
      <div className="p-4 border-b border-border space-y-3">
        <ToggleGroup type="single" value={platform} onValueChange={(v) => v && onPlatformChange(v)} className="justify-start flex-wrap">
          <ToggleGroupItem value="all" className="text-xs h-8 px-3">Todas</ToggleGroupItem>
          <ToggleGroupItem value="shopee" className="text-xs h-8 px-3 gap-1">
            <span className="w-2 h-2 rounded-full bg-[#EE4D2D]" /> Shopee
          </ToggleGroupItem>
          <ToggleGroupItem value="amazon" className="text-xs h-8 px-3 gap-1">
            <span className="w-2 h-2 rounded-full bg-[#232F3E]" /> Amazon
          </ToggleGroupItem>
          <ToggleGroupItem value="mercado_livre" className="text-xs h-8 px-3 gap-1">
            <span className="w-2 h-2 rounded-full bg-[#FFE600]" /> ML
          </ToggleGroupItem>
        </ToggleGroup>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="resolved">Resolvidos</SelectItem>
            <SelectItem value="waiting">Aguardando</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 px-4 border-b border-border space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <MessageCircle className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelect(chat)}
              className={cn(
                'w-full text-left p-3 px-4 border-b border-border cursor-pointer hover:bg-porcelain transition-colors',
                selectedId === chat.id && 'bg-primary/10 border-l-[3px] border-l-primary',
              )}
            >
              {/* Row 1: badge + name + time */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <PlatformBadge platform={chat.platform} className="text-[10px] px-1.5 py-0" />
                  <span className="text-sm font-medium text-foreground truncate">{chat.buyer_nickname}</span>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {chat.updated_at
                    ? formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true, locale: ptBR })
                    : ''}
                </span>
              </div>

              {/* Row 2: preview */}
              <p className="text-[13px] text-muted-foreground truncate mb-1">
                {chat.last_message_preview?.slice(0, 50)}
              </p>

              {/* Row 3: product/order + unread */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                  {chat.product_name && (
                    <>
                      <Package className="h-3 w-3 shrink-0" />
                      <span className="truncate">{chat.product_name}</span>
                    </>
                  )}
                  {!chat.product_name && chat.order_id && (
                    <>
                      <ShoppingBag className="h-3 w-3 shrink-0" />
                      <span className="truncate">Pedido {chat.order_id}</span>
                    </>
                  )}
                </div>
                {(chat.unread_count ?? 0) > 0 && (
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-accent text-white text-[11px] font-bold shrink-0">
                    {chat.unread_count}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
