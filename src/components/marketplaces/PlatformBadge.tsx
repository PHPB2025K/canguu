import { cn } from '@/lib/utils';

const platformStyles: Record<string, { bg: string; text: string; label: string }> = {
  mercado_livre: { bg: 'bg-[#FFE600]', text: 'text-[#333333]', label: 'ML' },
  shopee: { bg: 'bg-[#EE4D2D]', text: 'text-white', label: 'Shopee' },
  amazon: { bg: 'bg-[#FF9900]', text: 'text-[#232F3E]', label: 'Amazon' },
};

interface PlatformBadgeProps {
  platform: string;
  className?: string;
}

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const style = platformStyles[platform] ?? { bg: 'bg-muted', text: 'text-muted-foreground', label: platform };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold', style.bg, style.text, className)}>
      {style.label}
    </span>
  );
}
