import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — Budamix AI Agent`;
    return () => {
      document.title = "Budamix AI Agent";
    };
  }, [title]);
}
