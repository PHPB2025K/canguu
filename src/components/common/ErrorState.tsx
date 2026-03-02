import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Ocorreu um erro ao carregar os dados.", onRetry }: ErrorStateProps) {
  return (
    <Card className="border-destructive/20">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground text-center">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar Novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
