import { cn } from "@/lib/utils";

interface SourceBadgeProps {
  source: string | null | undefined;
  className?: string;
}

const sourceConfig: Record<string, { label: string; className: string }> = {
  mercado_livre: {
    label: "Mercado Livre",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  },
  shopee: {
    label: "Shopee",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  },
  amazon: {
    label: "Amazon",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  },
  site: {
    label: "Site Budamix",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  whatsapp: {
    label: "WhatsApp",
    className: "bg-muted text-muted-foreground",
  },
};

/**
 * Compact pill that shows the channel a customer originally came from.
 * Renders nothing for unknown / empty sources so the layout doesn't
 * sprout meaningless tags.
 */
export function SourceBadge({ source, className }: SourceBadgeProps) {
  if (!source) return null;
  const config = sourceConfig[source];
  if (!config) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
