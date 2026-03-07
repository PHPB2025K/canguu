import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProductListings, useCreateListing, useUpdateListing, useDeleteListing } from "@/hooks/useProductListings";
import { ListingDialog } from "./ListingDialog";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Listing = Tables<"product_listings">;

const PLATFORM_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  mercado_livre: { bg: "bg-[#FFE600]", text: "text-[#333]", label: "ML" },
  shopee: { bg: "bg-[#EE4D2D]", text: "text-white", label: "Shopee" },
  amazon: { bg: "bg-[#FF9900]", text: "text-[#232F3E]", label: "Amazon" },
  site_proprio: { bg: "bg-primary", text: "text-primary-foreground", label: "Site" },
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  single: "Unitário", kit: "Kit", combo: "Combo", variation: "Variação",
};

interface Props {
  productId: string;
}

export function ProductListingsSection({ productId }: Props) {
  const { data: listings = [], isLoading } = useProductListings(productId);
  const createMutation = useCreateListing();
  const updateMutation = useUpdateListing();
  const deleteMutation = useDeleteListing();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSave = async (data: any) => {
    try {
      if (editingListing) {
        await updateMutation.mutateAsync({ id: editingListing.id, product_id: productId, ...data });
        toast({ title: "Anúncio atualizado" });
      } else {
        await createMutation.mutateAsync({ product_id: productId, ...data });
        toast({ title: "Anúncio criado" });
      }
      setDialogOpen(false);
      setEditingListing(null);
    } catch (err: any) {
      toast({ title: "Erro ao salvar anúncio", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingId, productId });
      toast({ title: "Anúncio removido" });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
    setDeletingId(null);
  };

  const openEdit = (listing: Listing) => {
    setEditingListing(listing);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingListing(null);
    setDialogOpen(true);
  };

  const badge = (platform: string) => {
    const b = PLATFORM_BADGES[platform] || { bg: "bg-muted", text: "text-muted-foreground", label: platform };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${b.bg} ${b.text}`}>
        {b.label}
      </span>
    );
  };

  return (
    <div className="sm:col-span-2 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-foreground">Anúncios deste Produto</span>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar Anúncio
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : listings.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhum anúncio cadastrado para este produto.</p>
          <p className="text-xs text-muted-foreground mt-1">A IA não poderá enviar links de compra para este produto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listings.map((l) => (
            <div key={l.id} className="flex items-start justify-between border rounded-lg p-3 gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  {badge(l.platform)}
                  <span className="text-sm font-medium text-foreground truncate">{l.listing_title}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {LISTING_TYPE_LABELS[l.listing_type ?? "single"] ?? l.listing_type}
                  {l.listing_type !== "single" && l.kit_quantity ? ` (${l.kit_quantity} und)` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.listing_price != null ? `R$ ${Number(l.listing_price).toFixed(2)}` : "Sem preço"}
                  {l.platform_item_id ? ` • ${l.platform_item_id}` : ""}
                </p>
                {l.listing_url && (
                  <a
                    href={l.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 truncate max-w-[300px]"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{l.listing_url}</span>
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`w-2 h-2 rounded-full ${l.is_active ? "bg-green-500" : "bg-gray-400"}`} />
                <Button variant="ghost" size="sm" onClick={() => openEdit(l)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeletingId(l.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ListingDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingListing(null); }}
        listing={editingListing}
        onSave={handleSave}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja remover este anúncio?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
