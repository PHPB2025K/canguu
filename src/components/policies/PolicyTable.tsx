import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { useTogglePolicyActive } from "@/hooks/usePolicies";
import type { Tables } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;

interface PolicyTableProps {
  policies: Policy[];
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
}

export function PolicyTable({ policies, onEdit, onDelete }: PolicyTableProps) {
  const toggleActive = useTogglePolicyActive();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Marketplace</TableHead>
          <TableHead>Prioridade</TableHead>
          <TableHead>Ativo</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((p) => (
          <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
            <TableCell className="font-medium text-foreground">{p.title}</TableCell>
            <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
            <TableCell className="text-muted-foreground">{p.marketplace || "—"}</TableCell>
            <TableCell>{p.priority}</TableCell>
            <TableCell>
              <Switch
                checked={p.is_active ?? true}
                onCheckedChange={(val) => toggleActive.mutate({ id: p.id, is_active: val })}
              />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
