import { User, Bot, UserCheck, Mic, Image, FileText } from "lucide-react";
import { format } from "date-fns";
import type { Message } from "@/types/database";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

const senderConfig: Record<string, { label: string; icon: typeof User; bubbleClass: string; labelClass: string; timeClass: string }> = {
  customer: {
    label: "Cliente",
    icon: User,
    bubbleClass: "bg-muted/50 border border-border rounded-2xl rounded-bl-md",
    labelClass: "text-muted-foreground",
    timeClass: "text-muted-foreground/50",
  },
  agent: {
    label: "Agente IA",
    icon: Bot,
    bubbleClass: "bg-blue-600/20 border border-blue-500/20 rounded-2xl rounded-br-md",
    labelClass: "text-blue-400",
    timeClass: "text-blue-300/50",
  },
  human_agent: {
    label: "Atendente",
    icon: UserCheck,
    bubbleClass: "bg-green-600/20 border border-green-500/20 rounded-2xl rounded-br-md",
    labelClass: "text-green-400",
    timeClass: "text-green-300/50",
  },
};

function getTypeContent(type: string | null) {
  if (type === "audio") return { icon: Mic, text: "Mensagem de áudio" };
  if (type === "image") return { icon: Image, text: "Imagem enviada" };
  if (type === "document") return { icon: FileText, text: "Documento enviado" };
  return null;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const config = senderConfig[message.sender] ?? senderConfig.customer;
  const isCustomer = message.sender === "customer";
  const Icon = config.icon;
  const typeContent = getTypeContent(message.message_type);
  const time = message.created_at ? format(new Date(message.created_at), "HH:mm") : "";

  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[75%] p-3", config.bubbleClass)}>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={cn("h-3.5 w-3.5", config.labelClass)} />
          <span className={cn("text-xs font-medium", config.labelClass)}>{config.label}</span>
        </div>

        {typeContent ? (
          <div className="flex items-center gap-2 text-sm text-foreground italic">
            <typeContent.icon className="h-4 w-4" />
            {typeContent.text}
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{message.content}</p>
        )}

        <div className={cn("text-xs mt-1 text-right", config.timeClass)}>
          {time}
          {message.tokens_used && message.sender === "agent" && (
            <span className="ml-2">{message.tokens_used} tokens</span>
          )}
        </div>
      </div>
    </div>
  );
}
