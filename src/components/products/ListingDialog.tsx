import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

type Listing = Tables<"product_listings">;

interface ListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing?: Listing | null;
  onSave: (data: {
    platform: string;
    listing_title: string;
    platform_item_id: string | null;
    listing_url: string | null;
    listing_type: string;
    kit_quantity: number;
    listing_price: number | null;
    is_active: boolean;
  }) => void;
  isPending?: boolean;
}

const PLATFORM_OPTIONS = [
  { value: "mercado_livre", label: "Mercado Livre" },
  { value: "shopee", label: "Shopee" },
  { value: "amazon", label: "Amazon" },
  { value: "site_proprio", label: "Site Próprio" },
];

const TYPE_OPTIONS = [
  { value: "single", label: "Unitário" },
  { value: "kit", label: "Kit" },
  { value: "combo", label: "Combo" },
  { value: "variation", label: "Variação" },
];

function getInitial(listing?: Listing | null) {
  return {
    platform: listing?.platform ?? "mercado_livre",
    listing_title: listing?.listing_title ?? "",
    platform_item_id: listing?.platform_item_id ?? "",
    listing_url: listing?.listing_url ?? "",
    listing_type: listing?.listing_type ?? "single",
    kit_quantity: listing?.kit_quantity != null ? String(listing.kit_quantity) : "1",
    listing_price: listing?.listing_price != null ? String(listing.listing_price) : "",
    is_active: listing?.is_active ?? true,
  };
}

export function ListingDialog({ open, onOpenChange, listing, onSave, isPending }: ListingDialogProps) {
  const isEdit = !!listing;
  const [form, setForm] = useState(getInitial(listing));

  useEffect(() => {
    if (open) setForm(getInitial(listing));
  }, [open, listing]);

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form.listing_title.trim()) return;
    onSave({
      platform: form.platform,
      listing_title: form.listing_title.trim(),
      platform_item_id: form.platform_item_id.trim() || null,
      listing_url: form.listing_url.trim() || null,
      listing_type: form.listing_type,
      kit_quantity: form.listing_type !== "single" ? parseInt(form.kit_quantity, 10) || 1 : 1,
      listing_price: form.listing_price ? parseFloat(form.listing_price) : null,
      is_active: form.is_active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Anúncio" : "Adicionar Anúncio"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize as informações do anúncio." : "Preencha as informações do novo anúncio."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label>Plataforma *</Label>
            <Select value={form.platform} onValueChange={(v) => set("platform", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título do Anúncio *</Label>
            <Input value={form.listing_title} onChange={(e) => set("listing_title", e.target.value)} placeholder="Nome do anúncio nesta plataforma" />
          </div>
          <div>
            <Label>ID na Plataforma</Label>
            <Input value={form.platform_item_id} onChange={(e) => set("platform_item_id", e.target.value)} placeholder="MLB12345, ASIN_XXX, etc." />
          </div>
          <div>
            <Label>URL do Anúncio</Label>
            <Input type="url" value={form.listing_url} onChange={(e) => set("listing_url", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.listing_type} onValueChange={(v) => set("listing_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.listing_type !== "single" && (
            <div>
              <Label>Quantidade neste anúncio</Label>
              <Input type="number" min="1" value={form.kit_quantity} onChange={(e) => set("kit_quantity", e.target.value)} />
            </div>
          )}
          <div>
            <Label>Preço neste anúncio R$</Label>
            <Input type="number" step="0.01" value={form.listing_price} onChange={(e) => set("listing_price", e.target.value)} placeholder="0,00" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            <Label>Ativo</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.listing_title.trim()}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
