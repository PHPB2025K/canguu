import { MessageCircle, Wrench } from 'lucide-react';

export function ChatsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold text-foreground">Módulo de Chats</h3>
      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5" />
        Em construção — disponível no próximo sprint
      </p>
    </div>
  );
}
