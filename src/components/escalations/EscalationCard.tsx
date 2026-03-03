import { useNavigate } from "react-router-dom";
import { MessageSquare, UserCheck, CheckCircle, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UrgencyBadge } from "@/components/common/UrgencyBadge";
import { RelativeTime } from "@/components/common/RelativeTime";
import { formatPhone, truncateText } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { EscalationWithMessages } from "@/hooks/useEscalations";

const borderByUrgency: Record<string, string> = {
  critical: "border-l-4 border-l-destructive",
  high: "border-l-4 border-l-accent",
  medium: "border-l-4 border-l-primary",
  low: "border-l-4 border-l-border",
};

const senderIcon: Record<string, typeof User> = {
  customer: User,
  agent: Bot,
  human_agent: UserCheck,
};

interface EscalationCardProps {
  escalation: EscalationWithMessages;
  onAssign: () => void;
  onResolve: () => void;
}

export function EscalationCard({ escalation, onAssign, onResolve }: EscalationCardProps) {
  const navigate = useNavigate();
  const customer = escalation.conversations?.customers;
  const isResolved = escalation.status === "resolved";

  return (
    <Card className={cn("p-5 border-border shadow-sm transition-colors", borderByUrgency[escalation.urgency ?? "medium"] ?? borderByUrgency.medium)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UrgencyBadge urgency={escalation.urgency ?? "medium"} />
          <span className="text-sm font-medium text-foreground">
            #{escalation.id.slice(0, 4).toUpperCase()}
          </span>
        </div>
        {escalation.escalated_at && (
          <RelativeTime date={escalation.escalated_at} className="text-xs text-muted-foreground" />
        )}
      </div>

      {/* Body */}
      <div className="mt-3">
        {customer && (
          <p className="text-sm text-muted-foreground">
            {customer.name ?? "Sem nome"} · {formatPhone(customer.phone)}
          </p>
        )}
        <p className="text-foreground mt-2">{escalation.reason}</p>

        {/* Message preview */}
        {escalation.recentMessages.length > 0 && (
          <div className="bg-porcelain rounded-md p-2 mt-2 space-y-1">
            {escalation.recentMessages.map((msg) => {
              const Icon = senderIcon[msg.sender] ?? User;
              return (
                <div key={msg.id} className="flex items-start gap-2 text-xs">
                  <Icon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{truncateText(msg.content, 80)}</span>
                </div>
              );
            })}
          </div>
        )}

        {escalation.resolved_by && !isResolved && (
          <p className="text-sm text-primary mt-2">Atribuído a: {escalation.resolved_by}</p>
        )}

        {isResolved && escalation.resolved_at && (
          <div className="mt-2 text-sm">
            <p className="text-muted-foreground">
              Resolvido em: {new Date(escalation.resolved_at).toLocaleDateString("pt-BR")}
            </p>
            {escalation.notes && (
              <p className="text-muted-foreground mt-1 italic">{escalation.notes}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/conversations/${escalation.conversation_id}`)}
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1" />
          Ver Conversa
        </Button>
        {!isResolved && (
          <>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={onAssign}>
              <UserCheck className="h-3.5 w-3.5 mr-1" />
              Assumir
            </Button>
            <Button size="sm" className="bg-success hover:bg-success/90 text-white" onClick={onResolve}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Resolver
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
