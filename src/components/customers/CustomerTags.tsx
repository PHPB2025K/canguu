import { useState, type KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useUpdateCustomerTags } from "@/hooks/useCustomers";
import { toast } from "@/hooks/use-toast";

interface CustomerTagsProps {
  customerId: string;
  tags: string[];
}

export function CustomerTags({ customerId, tags }: CustomerTagsProps) {
  const [input, setInput] = useState("");
  const mutation = useUpdateCustomerTags();

  const handleAdd = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const tag = input.trim();
    if (!tag || tags.includes(tag)) return;
    const next = [...tags, tag];
    mutation.mutate({ id: customerId, tags: next }, {
      onSuccess: () => toast({ title: "Tag adicionada" }),
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
    setInput("");
  };

  const handleRemove = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    mutation.mutate({ id: customerId, tags: next }, {
      onSuccess: () => toast({ title: "Tag removida" }),
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button onClick={() => handleRemove(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleAdd}
          placeholder="Adicionar tag + Enter"
          className="text-sm"
        />
      </CardContent>
    </Card>
  );
}
