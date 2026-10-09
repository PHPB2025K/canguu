import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (notes: string) => void;
  loading?: boolean;
  minLength?: number;
}

export function ResolveDialog({ open, onOpenChange, onConfirm, loading, minLength = 1 }: ResolveDialogProps) {
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (notes.trim().length < minLength) return;
    onConfirm(notes.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setNotes(""); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolver Escalonamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Notas de resolução *</Label>
          <Textarea
            rows={4}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Descreva como o escalonamento foi resolvido..."
          />
          {minLength > 1 && <p className="text-xs text-muted-foreground">Registre a ação realizada (mínimo de {minLength} caracteres). Esta nota é interna.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={notes.trim().length < minLength || loading}
            className="bg-success hover:bg-success/90 text-white"
          >
            Resolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
