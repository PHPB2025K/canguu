import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/formatters";

export interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  format?: "number" | "currency" | "percent" | "time";
  iconClassName?: string;
  valueClassName?: string;
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

export function KPICard({ title, value, icon: Icon, trend, format, iconClassName, valueClassName }: KPICardProps) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold text-foreground ${valueClassName ?? ''}`}>{formatValue(value, format)}</p>
            {trend !== undefined && (
              <div className={`flex items-center gap-1 text-xs ${trend >= 0 ? "text-success" : "text-destructive"}`}>
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatPercent(Math.abs(trend))}
              </div>
            )}
          </div>
          <div className={`rounded-lg p-2 ${iconClassName ?? 'bg-primary/10'}`}>
            <Icon className={`h-5 w-5 ${iconClassName ? '' : 'text-primary'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
