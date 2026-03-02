import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/formatters";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  format?: "number" | "currency" | "percent" | "time";
}

function formatValue(value: string | number, format?: string): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "currency": return formatCurrency(value);
    case "percent": return formatPercent(value);
    case "time": return `${value}ms`;
    default: return value.toLocaleString("pt-BR");
  }
}

export function KPICard({ title, value, icon: Icon, trend, format }: KPICardProps) {
  return (
    <Card className="border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{formatValue(value, format)}</p>
            {trend !== undefined && (
              <div className={`flex items-center gap-1 text-xs ${trend >= 0 ? "text-green-400" : "text-destructive"}`}>
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatPercent(Math.abs(trend))}
              </div>
            )}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground opacity-50" />
        </div>
      </CardContent>
    </Card>
  );
}
