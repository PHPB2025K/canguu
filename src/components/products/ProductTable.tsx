import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useToggleProductActive } from "@/hooks/useProducts";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface ProductTableProps {
  products: Product[];
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function StockBadge({ qty }: { qty: number | null }) {
  const v = qty ?? 0;
  const cls =
    v > 10
      ? "bg-success/15 text-success"
      : v > 0
        ? "bg-warning/15 text-warning"
        : "bg-destructive/15 text-destructive";
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{v}</span>;
}

function SortIcon({ column, sortColumn, sortDirection }: { column: string; sortColumn: string; sortDirection: string }) {
  if (column !== sortColumn) return null;
  return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 inline ml-1" /> : <ArrowDown className="h-3 w-3 inline ml-1" />;
}

export function ProductTable({ products, sortColumn, sortDirection, onSort, onEdit, onDelete }: ProductTableProps) {
  const toggleActive = useToggleProductActive();

  const sortable = (col: string, label: string) => (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(col)}>
      {label}
      <SortIcon column={col} sortColumn={sortColumn} sortDirection={sortDirection} />
    </TableHead>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {sortable("sku", "SKU")}
          {sortable("name", "Nome")}
          <TableHead>Linha</TableHead>
          <TableHead>Material</TableHead>
          {sortable("price_site", "Preço Site")}
          {sortable("stock_quantity", "Estoque")}
          <TableHead>Ativo</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p.id} className="hover:bg-porcelain transition-colors">
            <TableCell className="text-sm font-mono text-muted-foreground">{p.sku}</TableCell>
            <TableCell className="font-medium">{p.name}</TableCell>
            <TableCell>
              {p.product_line ? (
                <span className="inline-flex px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs">{p.product_line}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{p.material ?? "—"}</TableCell>
            <TableCell>{p.price_site != null ? formatCurrency(Number(p.price_site)) : "—"}</TableCell>
            <TableCell><StockBadge qty={p.stock_quantity} /></TableCell>
            <TableCell>
              <Switch
                checked={p.is_active ?? true}
                onCheckedChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })}
              />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
