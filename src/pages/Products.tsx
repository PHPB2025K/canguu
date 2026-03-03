import { useState } from "react";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ProductToolbar } from "@/components/products/ProductToolbar";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductCards } from "@/components/products/ProductCards";
import { ProductDialog } from "@/components/products/ProductDialog";
import { useProductList, useDeleteProduct } from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

export default function Products() {
  usePageTitle("Produtos");
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortColumn, setSortColumn] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const isActive = statusFilter === "active" ? true : statusFilter === "inactive" ? false : null;

  const { data: products, isLoading } = useProductList({
    search: search || undefined,
    productLine: lineFilter !== "all" ? lineFilter : undefined,
    isActive,
    sortColumn,
    sortDirection,
  });

  const deleteMutation = useDeleteProduct();

  const handleSort = (col: string) => {
    if (col === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Produto excluído com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos" description="Gerencie o catálogo de produtos" />

      <ProductToolbar
        search={search}
        onSearchChange={setSearch}
        lineFilter={lineFilter}
        onLineFilterChange={setLineFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={handleAdd}
      />

      {isLoading ? (
        <LoadingState type={viewMode === "table" ? "table" : "card"} />
      ) : !products?.length ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto cadastrado"
          description="Adicione seu primeiro produto ao catálogo."
          actionLabel="Adicionar primeiro produto"
          onAction={handleAdd}
        />
      ) : viewMode === "table" ? (
        <ProductTable
          products={products}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onEdit={handleEdit}
          onDelete={setDeleteTarget}
        />
      ) : (
        <ProductCards products={products} onEdit={handleEdit} onDelete={setDeleteTarget} />
      )}

      <ProductDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editingProduct} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Produto"
        description={`Tem certeza que deseja excluir o produto '${deleteTarget?.name}'? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDeleteConfirm}
        variant="destructive"
      />
    </div>
  );
}
