import { Package, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/formatters";
import { getFirstImage, useToggleProductActive } from "@/hooks/useProducts";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface ProductCardsProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function StockBadge({ qty }: { qty: number | null }) {
  const v = qty ?? 0;
  const cls =
    v > 10
      ? "bg-green-500/10 text-green-400"
      : v > 0
        ? "bg-yellow-500/10 text-yellow-400"
        : "bg-red-500/10 text-red-400";
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{v} em estoque</span>;
}

export function ProductCards({ products, onEdit, onDelete }: ProductCardsProps) {
  const toggleActive = useToggleProductActive();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((p) => {
        const img = getFirstImage(p.images);
        return (
          <div key={p.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {img ? (
              <img src={img} alt={p.name} className="h-48 w-full object-cover" />
            ) : (
              <div className="h-48 w-full bg-muted flex items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-4 space-y-2">
              <p className="text-xs font-mono text-muted-foreground">{p.sku}</p>
              <p className="font-medium">{p.name}</p>
              {p.product_line && <p className="text-sm text-muted-foreground">{p.product_line}</p>}
              <p className="text-lg font-bold text-primary">
                {p.price_site != null ? formatCurrency(Number(p.price_site)) : "—"}
              </p>
              <StockBadge qty={p.stock_quantity} />
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.is_active ?? true}
                    onCheckedChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })}
                  />
                  <span className="text-xs text-muted-foreground">{p.is_active ? "Ativo" : "Inativo"}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
