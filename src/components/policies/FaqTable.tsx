import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { useToggleFaqActive } from "@/hooks/usePolicies";
import { truncateText } from "@/lib/formatters";
import type { Tables } from "@/integrations/supabase/types";

type Faq = Tables<"faq">;

interface FaqTableProps {
  faqs: Faq[];
  onEdit: (faq: Faq) => void;
  onDelete: (faq: Faq) => void;
}

export function FaqTable({ faqs, onEdit, onDelete }: FaqTableProps) {
  const toggleActive = useToggleFaqActive();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pergunta</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Keywords</TableHead>
          <TableHead>Uso</TableHead>
          <TableHead>Ativo</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {faqs.map((f) => {
          const kws = f.keywords ?? [];
          const visibleKws = kws.slice(0, 3);
          const extra = kws.length - 3;
          return (
            <TableRow key={f.id} className="hover:bg-porcelain transition-colors">
              <TableCell className="font-medium text-foreground max-w-[300px]">{truncateText(f.question, 80)}</TableCell>
              <TableCell>{f.category ? <Badge variant="secondary">{f.category}</Badge> : "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {visibleKws.map((kw) => <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>)}
                  {extra > 0 && <Badge variant="outline" className="text-xs">+{extra}</Badge>}
                </div>
              </TableCell>
              <TableCell><Badge variant="secondary">{f.usage_count ?? 0}</Badge></TableCell>
              <TableCell>
                <Switch
                  checked={f.is_active ?? true}
                  onCheckedChange={(val) => toggleActive.mutate({ id: f.id, is_active: val })}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(f)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(f)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
