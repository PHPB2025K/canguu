import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap: Record<string, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-green-500/10 text-green-400 border-green-500/20" },
  resolved: { label: "Resolvido", className: "bg-muted text-muted-foreground border-muted" },
  escalated: { label: "Escalonado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  pending: { label: "Pendente", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  in_progress: { label: "Em Andamento", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
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
