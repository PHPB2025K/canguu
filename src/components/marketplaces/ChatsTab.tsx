import { useState } from 'react';
import { useMarketplaceChats } from '@/hooks/useMarketplaces';
import { MarketplaceChatList } from './MarketplaceChatList';
import { MarketplaceChatView } from './MarketplaceChatView';
import { useIsMobile } from '@/hooks/use-mobile';
import type { MarketplaceChat } from '@/types/database';

export function ChatsTab() {
  const [platform, setPlatform] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedChat, setSelectedChat] = useState<MarketplaceChat | null>(null);
  const { data: chats = [], isLoading } = useMarketplaceChats(platform, status);
  const isMobile = useIsMobile();

  const showList = !isMobile || !selectedChat;
  const showChat = !isMobile || !!selectedChat;

  return (
    <div className="flex h-full rounded-lg border border-border overflow-hidden bg-background">
      {showList && (
        <div className={isMobile ? 'w-full' : 'w-96 shrink-0'}>
          <MarketplaceChatList
            chats={chats}
            isLoading={isLoading}
            selectedId={selectedChat?.id ?? null}
            onSelect={(chat) => setSelectedChat(chat)}
            platform={platform}
            onPlatformChange={setPlatform}
            status={status}
            onStatusChange={setStatus}
          />
        </div>
      )}
      {showChat && (
        <MarketplaceChatView
          chat={selectedChat}
          showBack={isMobile}
          onBack={() => setSelectedChat(null)}
        />
      )}
    </div>
  );
}
