import { useState, useEffect } from "react";
import { formatListTime } from "@/lib/formatters";

interface ListTimeProps {
  date: string;
  className?: string;
}

/** Hora (últimas 24h) ou data + hora (mais antigo); revisa a cada minuto para virar sozinho. */
export function ListTime({ date, className }: ListTimeProps) {
  const [text, setText] = useState(() => formatListTime(date));

  useEffect(() => {
    setText(formatListTime(date));
    const interval = setInterval(() => setText(formatListTime(date)), 60_000);
    return () => clearInterval(interval);
  }, [date]);

  return <span className={className}>{text}</span>;
}
