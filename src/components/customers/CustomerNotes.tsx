import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useUpdateCustomerNotes } from "@/hooks/useCustomers";
import { toast } from "@/hooks/use-toast";

interface CustomerNotesProps {
  customerId: string;
  notes: string;
}

export function CustomerNotes({ customerId, notes }: CustomerNotesProps) {
  const [value, setValue] = useState(notes);
  const mutation = useUpdateCustomerNotes();

  useEffect(() => { setValue(notes); }, [notes]);

  const handleSave = () => {
    mutation.mutate({ id: customerId, notes: value }, {
      onSuccess: () => toast({ title: "Notas salvas com sucesso" }),
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Notas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Sem notas"
          rows={4}
        />
        <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
          Salvar Notas
        </Button>
      </CardContent>
    </Card>
  );
}
