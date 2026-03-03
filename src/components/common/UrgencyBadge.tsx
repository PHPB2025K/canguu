import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const urgencyMap: Record<string, { label: string; className: string }> = {
  low: { label: "Baixa", className: "bg-muted text-muted-foreground border-muted" },
  normal: { label: "Normal", className: "bg-primary/10 text-primary border-primary/20" },
  medium: { label: "Média", className: "bg-primary/10 text-primary border-primary/20" },
  high: { label: "Alta", className: "bg-accent/15 text-accent border-accent/20" },
  critical: { label: "Crítica", className: "bg-destructive/15 text-destructive border-destructive/20 animate-pulse" },
};

interface UrgencyBadgeProps {
  urgency: string;
  className?: string;
}

export function UrgencyBadge({ urgency, className }: UrgencyBadgeProps) {
  const config = urgencyMap[urgency] ?? urgencyMap.normal!;
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
