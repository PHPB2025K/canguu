import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap: Record<string, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-success/15 text-success border-success/20" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-muted" },
  escalated: { label: "Escalonado", className: "bg-destructive/15 text-destructive border-destructive/20" },
  pending: { label: "Pendente", className: "bg-warning/15 text-warning border-warning/20" },
  in_progress: { label: "Em Andamento", className: "bg-primary/10 text-primary border-primary/20" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusMap[status] ?? { label: status, className: "bg-muted text-muted-foreground border-muted" };
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
