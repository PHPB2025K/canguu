import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — Canggu.ai`;
    return () => {
      document.title = "Canggu.ai";
    };
  }, [title]);
}
