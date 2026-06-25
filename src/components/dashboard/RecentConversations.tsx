import { Link, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { displayName, displayInitials, lastMessagePreview } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SentimentBadge } from "@/components/common/SentimentBadge";
import { RelativeTime } from "@/components/common/RelativeTime";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";

interface ConversationItem {
  id: string;
  status: string | null;
  sentiment: string | null;
  updated_at: string | null;
  customers: { id: string; name: string | null; phone: string } | null;
  lastMessage: { content: string; message_type: string | null } | null;
}

interface RecentConversationsProps {
  conversations: ConversationItem[] | undefined;
  isLoading: boolean;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function RecentConversations({ conversations, isLoading }: RecentConversationsProps) {
  const navigate = useNavigate();

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Conversas Recentes</CardTitle>
        <Link to="/conversations" className="text-sm text-primary hover:text-primary/80">
          Ver todas →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState type="list" />
        ) : !conversations || conversations.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Nenhuma conversa ainda" />
        ) : (
          <div className="space-y-1">
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/conversations/${c.id}`)}
                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                    {displayInitials(c.customers?.name, c.customers?.phone)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground truncate">
                      {displayName(c.customers?.name, c.customers?.phone)}
                    </span>
                    {c.updated_at && (
                      <RelativeTime date={c.updated_at} className="text-xs text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {lastMessagePreview(c.lastMessage)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.status && <StatusBadge status={c.status} />}
                  {c.sentiment && <SentimentBadge sentiment={c.sentiment} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
