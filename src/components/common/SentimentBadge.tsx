import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sentimentMap: Record<string, { label: string; emoji: string; className: string }> = {
  positive: { label: "Positivo", emoji: "😊", className: "bg-green-500/10 text-green-400 border-green-500/20" },
  negative: { label: "Negativo", emoji: "😞", className: "bg-destructive/10 text-destructive border-destructive/20" },
  neutral: { label: "Neutro", emoji: "😐", className: "bg-muted text-muted-foreground border-muted" },
};

interface SentimentBadgeProps {
  sentiment: string;
  className?: string;
}

export function SentimentBadge({ sentiment, className }: SentimentBadgeProps) {
  const config = sentimentMap[sentiment] ?? sentimentMap.neutral!;
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.emoji} {config.label}
    </Badge>
  );
}
