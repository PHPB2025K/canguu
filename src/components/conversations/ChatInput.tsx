import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  isSending?: boolean;
}

export function ChatInput({ onSend, disabled = false, isSending = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, isSending, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="border-t border-border p-4">
      {disabled && (
        <div className="flex items-center gap-2 mb-3 text-sm text-yellow-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Assuma o atendimento para enviar mensagens</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Digite sua mensagem..."
          disabled={disabled || isSending}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "min-h-[40px] max-h-[120px]"
          )}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || isSending || !value.trim()}
          className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
