import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCreateProduct, useUpdateProduct, imagesToText, textToImages, dimensionsToText, extractMarketplacePrice, extractMarketplaceLink } from "@/hooks/useProducts";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

function getInitial(product?: Product | null) {
  return {
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    product_line: product?.product_line ?? "",
    material: product?.material ?? "",
    price_site: product?.price_site != null ? String(product.price_site) : "",
    price_marketplace: extractMarketplacePrice(product?.price_marketplace) != null
      ? String(extractMarketplacePrice(product?.price_marketplace))
      : "",
    stock_quantity: product?.stock_quantity != null ? String(product.stock_quantity) : "0",
    dimensions: dimensionsToText(product?.dimensions),
    short_description: product?.short_description ?? "",
    full_description: product?.full_description ?? "",
    images: imagesToText(product?.images),
    usage_suggestions: product?.usage_suggestions ?? "",
    differentials: product?.differentials ?? "",
    site_link: product?.site_link ?? "",
    marketplace_links: extractMarketplaceLink(product?.marketplace_links),
    is_active: product?.is_active ?? true,
  };
}

export function ProductDialog({ open, onOpenChange, product }: ProductDialogProps) {
  const isEdit = !!product;
  const { toast } = useToast();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const [form, setForm] = useState(getInitial(product));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setForm(getInitial(product));
  }, [open, product]);

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.sku.trim()) e.sku = "SKU é obrigatório";
    if (!form.name.trim()) e.name = "Nome é obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const payload: Record<string, unknown> = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      product_line: form.product_line.trim() || null,
      material: form.material.trim() || null,
      price_site: form.price_site ? parseFloat(form.price_site) : null,
      price_marketplace: form.price_marketplace
        ? { default: parseFloat(form.price_marketplace) }
        : null,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity, 10) : 0,
      dimensions: form.dimensions.trim() ? { raw: form.dimensions.trim() } : null,
      short_description: form.short_description.trim() || null,
      full_description: form.full_description.trim() || null,
      images: textToImages(form.images).length > 0 ? textToImages(form.images) : null,
      usage_suggestions: form.usage_suggestions.trim() || null,
      differentials: form.differentials.trim() || null,
      site_link: form.site_link.trim() || null,
      marketplace_links: form.marketplace_links.trim()
        ? { url: form.marketplace_links.trim() }
        : null,
      is_active: form.is_active,
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: product!.id, ...payload } as any);
        toast({ title: "Produto atualizado com sucesso" });
      } else {
        await createMutation.mutateAsync(payload as any);
        toast({ title: "Produto criado com sucesso" });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar produto", description: err.message, variant: "destructive" });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Produto" : "Adicionar Produto"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize as informações do produto." : "Preencha as informações do novo produto."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sku">SKU *</Label>
            <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} disabled={isEdit} />
            {errors.sku && <p className="text-xs text-destructive mt-1">{errors.sku}</p>}
          </div>
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="product_line">Linha</Label>
            <Input id="product_line" value={form.product_line} onChange={(e) => set("product_line", e.target.value)} placeholder="Ex: BGL, CQT" />
          </div>
          <div>
            <Label htmlFor="material">Material</Label>
            <Input id="material" value={form.material} onChange={(e) => set("material", e.target.value)} placeholder="Ex: Aço Inox, Vidro" />
          </div>
          <div>
            <Label htmlFor="price_site">Preço Site R$</Label>
            <Input id="price_site" type="number" step="0.01" value={form.price_site} onChange={(e) => set("price_site", e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label htmlFor="price_marketplace">Preço Marketplace R$</Label>
            <Input id="price_marketplace" type="number" step="0.01" value={form.price_marketplace} onChange={(e) => set("price_marketplace", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="stock_quantity">Estoque</Label>
            <Input id="stock_quantity" type="number" min="0" value={form.stock_quantity} onChange={(e) => set("stock_quantity", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dimensions">Dimensões</Label>
            <Input id="dimensions" value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} placeholder="Ex: 25x10x8cm" />
          </div>
          <div>
            <Label htmlFor="short_description">Descrição Curta</Label>
            <Textarea id="short_description" rows={2} value={form.short_description} onChange={(e) => set("short_description", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="site_link">Link Site</Label>
            <Input id="site_link" type="url" value={form.site_link} onChange={(e) => set("site_link", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="full_description">Descrição Completa</Label>
            <Textarea id="full_description" rows={4} value={form.full_description} onChange={(e) => set("full_description", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="images">Imagens (URLs, uma por linha)</Label>
            <Textarea id="images" rows={3} value={form.images} onChange={(e) => set("images", e.target.value)} placeholder="Cole URLs de imagens, uma por linha" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="usage_suggestions">Sugestões de Uso</Label>
            <Textarea id="usage_suggestions" rows={2} value={form.usage_suggestions} onChange={(e) => set("usage_suggestions", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="differentials">Diferenciais</Label>
            <Textarea id="differentials" rows={2} value={form.differentials} onChange={(e) => set("differentials", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="marketplace_links">Link Marketplace</Label>
            <Input id="marketplace_links" type="url" value={form.marketplace_links} onChange={(e) => set("marketplace_links", e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            <Label htmlFor="is_active">Produto ativo</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando..." : isEdit ? "Atualizar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
