import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreatePolicy, useUpdatePolicy } from "@/hooks/usePolicies";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;

const CATEGORIES = ["Troca", "Entrega", "Garantia", "Pagamento", "Geral"];

interface PolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: Policy | null;
}

export function PolicyDialog({ open, onOpenChange, policy }: PolicyDialogProps) {
  const isEdit = !!policy;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const createMut = useCreatePolicy();
  const updateMut = useUpdatePolicy();

  useEffect(() => {
    if (open) {
      setTitle(policy?.title ?? "");
      setCategory(policy?.category ?? "");
      setMarketplace(policy?.marketplace ?? "");
      setContent(policy?.content ?? "");
      setSummary(policy?.summary ?? "");
      setPriority(policy?.priority ?? 0);
      setIsActive(policy?.is_active ?? true);
      setErrors({});
    }
  }, [open, policy]);

  const handleSave = async () => {
    const errs: Record<string, boolean> = {};
    if (!title.trim()) errs.title = true;
    if (!category) errs.category = true;
    if (!content.trim()) errs.content = true;
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload = { title: title.trim(), category, marketplace: marketplace || null, content: content.trim(), summary: summary.trim() || null, priority, is_active: isActive };

    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: policy!.id, ...payload });
        toast({ title: "Política atualizada com sucesso" });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: "Política criada com sucesso" });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar política", description: e.message, variant: "destructive" });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Política" : "Adicionar Política"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className={errors.title ? "border-destructive" : ""} />
            {errors.title && <p className="text-xs text-destructive mt-1">Título obrigatório</p>}
          </div>
          <div>
            <Label>Categoria *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={errors.category ? "border-destructive" : ""}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive mt-1">Categoria obrigatória</p>}
          </div>
          <div>
            <Label>Marketplace</Label>
            <Input value={marketplace} onChange={(e) => setMarketplace(e.target.value)} placeholder="Ex: Mercado Livre, Shopee" />
          </div>
          <div>
            <Label>Conteúdo *</Label>
            <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} className={errors.content ? "border-destructive" : ""} />
            {errors.content && <p className="text-xs text-destructive mt-1">Conteúdo obrigatório</p>}
          </div>
          <div>
            <Label>Resumo</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value.slice(0, 500))} />
            <p className="text-xs text-muted-foreground text-right mt-1">{summary.length}/500</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Prioridade</Label>
              <Input type="number" min={0} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Ativo</Label>
            </div>
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
