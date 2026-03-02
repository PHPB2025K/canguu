import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface AlertBannerProps {
  count: number;
}

export function AlertBanner({ count }: AlertBannerProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
      <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
      <p className="text-sm text-yellow-200 flex-1">
        Você tem <strong>{count}</strong> escalonamento{count > 1 ? "s" : ""} pendente{count > 1 ? "s" : ""}
      </p>
      <Link to="/escalations" className="text-sm font-medium text-yellow-400 hover:text-yellow-300 whitespace-nowrap">
        Ver escalonamentos →
      </Link>
    </div>
  );
}
