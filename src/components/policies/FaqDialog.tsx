import { useState, useEffect, type KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useCreateFaq, useUpdateFaq } from "@/hooks/usePolicies";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Faq = Tables<"faq">;

interface FaqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faq?: Faq | null;
}

export function FaqDialog({ open, onOpenChange, faq }: FaqDialogProps) {
  const isEdit = !!faq;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const createMut = useCreateFaq();
  const updateMut = useUpdateFaq();

  useEffect(() => {
    if (open) {
      setQuestion(faq?.question ?? "");
      setAnswer(faq?.answer ?? "");
      setCategory(faq?.category ?? "");
      setKeywords(faq?.keywords ?? []);
      setKwInput("");
      setIsActive(faq?.is_active ?? true);
      setErrors({});
    }
  }, [open, faq]);

  const handleKwKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const kw = kwInput.trim();
      if (kw && !keywords.includes(kw)) setKeywords([...keywords, kw]);
      setKwInput("");
    }
  };

  const removeKw = (kw: string) => setKeywords(keywords.filter((k) => k !== kw));

  const handleSave = async () => {
    const errs: Record<string, boolean> = {};
    if (!question.trim()) errs.question = true;
    if (!answer.trim()) errs.answer = true;
    if (!category.trim()) errs.category = true;
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload = { question: question.trim(), answer: answer.trim(), category: category.trim(), keywords, is_active: isActive };

    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: faq!.id, ...payload });
        toast({ title: "Pergunta atualizada com sucesso" });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: "Pergunta criada com sucesso" });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar FAQ", description: e.message, variant: "destructive" });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Pergunta" : "Adicionar Pergunta"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isEdit && faq?.usage_count != null && (
            <p className="text-sm text-muted-foreground">Utilizado {faq.usage_count} vezes</p>
          )}
          <div>
            <Label>Pergunta *</Label>
            <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} className={errors.question ? "border-destructive" : ""} />
            {errors.question && <p className="text-xs text-destructive mt-1">Pergunta obrigatória</p>}
          </div>
          <div>
            <Label>Resposta *</Label>
            <Textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} className={errors.answer ? "border-destructive" : ""} />
            {errors.answer && <p className="text-xs text-destructive mt-1">Resposta obrigatória</p>}
          </div>
          <div>
            <Label>Categoria *</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} className={errors.category ? "border-destructive" : ""} />
            {errors.category && <p className="text-xs text-destructive mt-1">Categoria obrigatória</p>}
          </div>
          <div>
            <Label>Keywords</Label>
            <Input
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={handleKwKeyDown}
              placeholder="Digite e pressione Enter"
            />
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="gap-1">
                    {kw}
                    <button onClick={() => removeKw(kw)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>{isEdit ? "Atualizar" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
