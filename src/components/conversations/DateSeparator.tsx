import { format, isToday, isYesterday } from "date-fns";

interface DateSeparatorProps {
  date: string;
}

function getLabel(date: string): string {
  const d = new Date(date);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM/yyyy");
}

export function DateSeparator({ date }: DateSeparatorProps) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground px-2">{getLabel(date)}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
