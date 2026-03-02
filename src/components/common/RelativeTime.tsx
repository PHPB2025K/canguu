import { useState, useEffect } from "react";
import { getRelativeTime } from "@/lib/formatters";

interface RelativeTimeProps {
  date: string;
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [text, setText] = useState(() => getRelativeTime(date));

  useEffect(() => {
    const interval = setInterval(() => {
      setText(getRelativeTime(date));
    }, 60_000);
    return () => clearInterval(interval);
  }, [date]);

  return <span className={className}>{text}</span>;
}
