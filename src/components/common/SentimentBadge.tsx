import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sentimentConfig = { label: "Positivo", emoji: "😊", className: "bg-success/15 text-success border-success/20" };
const sentimentNeg = { label: "Negativo", emoji: "😞", className: "bg-destructive/15 text-destructive border-destructive/20" };
const sentimentNeu = { label: "Neutro", emoji: "😐", className: "bg-muted text-muted-foreground border-muted" };
const sentimentCrit = { label: "Crítico", emoji: "🔴", className: "bg-destructive/25 text-destructive border-destructive/50 font-semibold" };

const sentimentMap: Record<string, { label: string; emoji: string; className: string }> = {
  positive: sentimentConfig,
  positivo: sentimentConfig,
  negative: sentimentNeg,
  negativo: sentimentNeg,
  neutral: sentimentNeu,
  neutro: sentimentNeu,
  critical: sentimentCrit,
  critico: sentimentCrit,
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
