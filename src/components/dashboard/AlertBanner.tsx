import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface AlertBannerProps {
  count: number;
}

export function AlertBanner({ count }: AlertBannerProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning/10 p-4">
      <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
      <p className="text-sm text-foreground/80 flex-1">
        Você tem <strong>{count}</strong> escalonamento{count > 1 ? "s" : ""} pendente{count > 1 ? "s" : ""}
      </p>
      <Link to="/escalations" className="text-sm font-medium text-warning hover:text-warning/80 whitespace-nowrap">
        Ver escalonamentos →
      </Link>
    </div>
  );
}
