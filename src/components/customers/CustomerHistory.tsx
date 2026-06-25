import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RelativeTime } from "@/components/common/RelativeTime";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { MessageSquare } from "lucide-react";
import { lastMessagePreview } from "@/lib/formatters";
import { useCustomerConversations } from "@/hooks/useCustomers";

interface CustomerHistoryProps {
  customerId: string;
}

export function CustomerHistory({ customerId }: CustomerHistoryProps) {
  const navigate = useNavigate();
  const { data: conversations, isLoading } = useCustomerConversations(customerId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Histórico de Conversas</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingState type="list" />}
        {!isLoading && (conversations?.length ?? 0) === 0 && (
          <EmptyState icon={MessageSquare} title="Nenhuma conversa encontrada" />
        )}
        {!isLoading && conversations && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/conversations/${c.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={c.status ?? "active"} />
                    {c.category && <span className="text-xs text-muted-foreground">{c.category}</span>}
                  </div>
                  {c.lastMessage && (
                    <p className="text-sm text-muted-foreground truncate">{lastMessagePreview(c.lastMessage, 80)}</p>
                  )}
                </div>
                {c.updated_at && <RelativeTime date={c.updated_at} className="text-xs text-muted-foreground whitespace-nowrap" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
