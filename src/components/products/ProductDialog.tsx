import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Package } from "lucide-react";
import {
  useCreateProduct, useUpdateProduct, imagesToText, textToImages, dimensionsToText,
  extractAllMarketplacePrices, buildMarketplacePriceJson,
  extractAllMarketplaceLinks, buildMarketplaceLinkJson,
  MARKETPLACE_PLATFORMS, MARKETPLACE_LABELS, MARKETPLACE_LINK_PLACEHOLDERS,
} from "@/hooks/useProducts";
import {
  useBaseProduct, useKitCompositions,
  saveBaseProductContent, triggerReEmbedding,
} from "@/hooks/useBaseProducts";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

export function ProductDialog({ open, onOpenChange, product }: ProductDialogProps) {
  const isEdit = !!product;
  const { toast } = useToast();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [embeddingStatus, setEmbeddingStatus] = useState<"idle" | "updating">("idle");
  const initialContentRef = useRef<Record<string, string>>({});

  // Base product data (content-rich fields)
  const baseProductId = (product as any)?.base_product_id as string | null;
  const { data: baseProduct } = useBaseProduct(baseProductId);
  const { data: kitComps } = useKitCompositions(product?.sku);

  useEffect(() => {
    if (!open) return;
    const bp = baseProduct;
    const f: Record<string, any> = {
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      product_line: product?.product_line ?? "",
      material: product?.material ?? "",
      price_site: product?.price_site != null ? String(product.price_site) : "",
      mp_prices: extractAllMarketplacePrices(product?.price_marketplace),
      mp_links: extractAllMarketplaceLinks(product?.marketplace_links),
      site_link: product?.site_link ?? "",
      stock_quantity: product?.stock_quantity != null ? String(product.stock_quantity) : "0",
      dimensions: dimensionsToText(product?.dimensions),
      images: imagesToText(product?.images),
      is_active: product?.is_active ?? true,
      // Content-rich: prefer base_product if linked
      short_description: bp?.description_short ?? product?.short_description ?? "",
      full_description: bp?.description_full ?? product?.full_description ?? "",
      usage_suggestions: bp?.usage_suggestions ?? product?.usage_suggestions ?? "",
      differentials: bp?.differentials ?? product?.differentials ?? "",
      tags: bp?.tags ? bp.tags.join(", ") : "",
    };
    setForm(f);
    initialContentRef.current = {
      short_description: f.short_description,
      full_description: f.full_description,
      usage_suggestions: f.usage_suggestions,
      differentials: f.differentials,
      tags: f.tags,
    };
  }, [open, product, baseProduct]);

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.sku?.trim()) e.sku = "SKU é obrigatório";
    if (!form.name?.trim()) e.name = "Nome é obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const payload: Record<string, unknown> = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      product_line: form.product_line?.trim() || null,
      material: form.material?.trim() || null,
      price_site: form.price_site ? parseFloat(form.price_site) : null,
      price_marketplace: buildMarketplacePriceJson(form.mp_prices),
      marketplace_links: buildMarketplaceLinkJson(form.mp_links),
      site_link: form.site_link?.trim() || null,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity, 10) : 0,
      dimensions: form.dimensions?.trim() ? { raw: form.dimensions.trim() } : null,
      short_description: form.short_description?.trim() || null,
      full_description: form.full_description?.trim() || null,
      images: textToImages(form.images).length > 0 ? textToImages(form.images) : null,
      usage_suggestions: form.usage_suggestions?.trim() || null,
      differentials: form.differentials?.trim() || null,
      is_active: form.is_active,
    };

    try {
      // 1. Save commercial fields to products
      if (isEdit) {
        await updateMutation.mutateAsync({ id: product!.id, ...payload } as any);
      } else {
        await createMutation.mutateAsync(payload as any);
      }

      // 2. Save content-rich fields to base_products (if linked)
      let contentChanged = false;
      if (isEdit && baseProductId) {
        const contentFields = {
          description_short: form.short_description?.trim() || null,
          description_full: form.full_description?.trim() || null,
          usage_suggestions: form.usage_suggestions?.trim() || null,
          differentials: form.differentials?.trim() || null,
          tags: form.tags?.trim() ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : null,
        };

        const initial = initialContentRef.current;
        contentChanged = (
          (contentFields.description_short ?? "") !== (initial.short_description ?? "") ||
          (contentFields.description_full ?? "") !== (initial.full_description ?? "") ||
          (contentFields.usage_suggestions ?? "") !== (initial.usage_suggestions ?? "") ||
          (contentFields.differentials ?? "") !== (initial.differentials ?? "") ||
          (form.tags ?? "") !== (initial.tags ?? "")
        );

        await saveBaseProductContent(baseProductId, contentFields);

        // 3. Trigger re-embedding if content changed (async)
        if (contentChanged) {
          setEmbeddingStatus("updating");
          triggerReEmbedding();
          setTimeout(() => setEmbeddingStatus("idle"), 5000);
        }
      }

      toast({
        title: isEdit ? "Produto atualizado com sucesso" : "Produto criado com sucesso",
        description: contentChanged ? "Busca IA sendo atualizada..." : undefined,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar produto", description: err.message, variant: "destructive" });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isKit = (product as any)?.is_unit === false;
  const kitQty = (product as any)?.kit_quantity ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{isEdit ? "Editar Produto" : "Adicionar Produto"}</DialogTitle>
              <DialogDescription>
                {isEdit ? "Atualize as informações do produto." : "Preencha as informações do novo produto."}
              </DialogDescription>
            </div>
            {embeddingStatus === "updating" && (
              <span className="inline-flex items-center gap-1.5 text-xs animate-pulse" style={{ color: '#004D4D' }}>
                🎯 Busca IA atualizando...
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Kit composition info */}
        {isEdit && kitComps && kitComps.length > 0 && (
          <div className="bg-muted/50 border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">
                {isKit ? `Kit com ${kitQty} unidade${kitQty > 1 ? "s" : ""}` : "Produto unitário"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {kitComps.map((kc) => (
                <p key={kc.id}>
                  {kc.quantity}x {kc.base_product?.name ?? kc.base_product_id}
                  {kc.base_product?.capacity ? ` (${kc.base_product.capacity})` : ""}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* === Identification === */}
          <div>
            <Label htmlFor="sku">SKU *</Label>
            <Input id="sku" value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} disabled={isEdit} />
            {errors.sku && <p className="text-xs text-destructive mt-1">{errors.sku}</p>}
          </div>
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="product_line">Linha</Label>
            <Input id="product_line" value={form.product_line ?? ""} onChange={(e) => set("product_line", e.target.value)} placeholder="Ex: YW, CK, SPC" />
          </div>
          <div>
            <Label htmlFor="material">Material</Label>
            <Input id="material" value={form.material ?? ""} onChange={(e) => set("material", e.target.value)} placeholder="Ex: Aço Inox, Vidro" />
          </div>

          {/* === Prices === */}
          <div>
            <Label htmlFor="price_site">Preço Site R$</Label>
            <Input id="price_site" type="number" step="0.01" value={form.price_site ?? ""} onChange={(e) => set("price_site", e.target.value)} placeholder="0,00" />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label className="text-sm font-semibold">Preços por Plataforma</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MARKETPLACE_PLATFORMS.map((key) => (
                <div key={key}>
                  <Label htmlFor={`mp_${key}`} className="text-xs">{MARKETPLACE_LABELS[key]}</Label>
                  <Input id={`mp_${key}`} type="number" step="0.01" placeholder="R$ 0,00"
                    value={form.mp_prices?.[key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, mp_prices: { ...(prev.mp_prices ?? {}), [key]: e.target.value } }))} />
                </div>
              ))}
            </div>
          </div>

          {/* === Links === */}
          <div className="sm:col-span-2 space-y-2">
            <Label className="text-sm font-semibold">Links de Anúncios</Label>
            <div className="space-y-2">
              <div>
                <Label htmlFor="site_link" className="text-xs">Site Próprio</Label>
                <div className="flex gap-1.5">
                  <Input id="site_link" type="url" placeholder="https://importadoragb.com.br/produto/..." value={form.site_link ?? ""} onChange={(e) => set("site_link", e.target.value)} />
                  {form.site_link && (
                    <Button type="button" variant="ghost" size="icon" className="shrink-0" asChild>
                      <a href={form.site_link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  )}
                </div>
              </div>
              {MARKETPLACE_PLATFORMS.filter(k => k !== 'tiktok').map((key) => (
                <div key={key}>
                  <Label htmlFor={`ml_${key}`} className="text-xs">{MARKETPLACE_LABELS[key]}</Label>
                  <div className="flex gap-1.5">
                    <Input id={`ml_${key}`} type="url" placeholder={MARKETPLACE_LINK_PLACEHOLDERS[key] ?? "https://..."}
                      value={form.mp_links?.[key] ?? ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, mp_links: { ...(prev.mp_links ?? {}), [key]: e.target.value } }))} />
                    {form.mp_links?.[key] && (
                      <Button type="button" variant="ghost" size="icon" className="shrink-0" asChild>
                        <a href={form.mp_links[key]} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* === Stock === */}
          <div>
            <Label htmlFor="stock_quantity">Estoque</Label>
            <Input id="stock_quantity" type="number" min="0" value={form.stock_quantity ?? "0"} onChange={(e) => set("stock_quantity", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dimensions">Dimensões</Label>
            <Input id="dimensions" value={form.dimensions ?? ""} onChange={(e) => set("dimensions", e.target.value)} placeholder="Ex: 25x10x8cm" />
          </div>

          {/* ═══ Content-Rich Fields (feeds AI embeddings) ═══ */}
          <div
            className="sm:col-span-2 mt-2 py-5 px-5 rounded-xl"
            style={{ borderLeft: '4px solid #004D4D', backgroundColor: 'rgba(126, 173, 173, 0.06)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: '#004D4D' }}>🎯</span>
              <span className="text-sm font-semibold" style={{ color: '#004D4D' }}>Conteúdo para Busca Otimizada</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Estes campos alimentam a busca da Ana. Quanto mais detalhado, melhor a IA encontra o produto.
            </p>

            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Label htmlFor="short_description">Descrição Curta</Label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>🎯 Alimenta a IA</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Resumo em 1-2 frases do produto</p>
                <Textarea id="short_description" rows={2} className="bg-white" value={form.short_description ?? ""} onChange={(e) => set("short_description", e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Label htmlFor="full_description">Descrição Completa</Label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>🎯 Alimenta a IA</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Detalhes técnicos, dimensões, composição do kit</p>
                <Textarea id="full_description" rows={5} className="bg-white" value={form.full_description ?? ""} onChange={(e) => set("full_description", e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Label htmlFor="usage_suggestions">Sugestões de Uso</Label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>🎯 Alimenta a IA</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Cenários de uso: marmita, decoração, presente...</p>
                <Textarea id="usage_suggestions" rows={3} className="bg-white" value={form.usage_suggestions ?? ""} onChange={(e) => set("usage_suggestions", e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Label htmlFor="differentials">Diferenciais</Label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>🎯 Alimenta a IA</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Material, tecnologia, vedação, design</p>
                <Textarea id="differentials" rows={3} className="bg-white" value={form.differentials ?? ""} onChange={(e) => set("differentials", e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Label htmlFor="tags">Tags</Label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>🎯 Alimenta a IA</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Palavras-chave separadas por vírgula</p>
                <Input id="tags" className="bg-white" value={form.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="pote, vidro, hermético, marmita, fitness" />
              </div>
            </div>
          </div>

          {/* === Images === */}
          <div className="sm:col-span-2">
            <Label htmlFor="images">Imagens (URLs, uma por linha)</Label>
            <Textarea id="images" rows={3} value={form.images ?? ""} onChange={(e) => set("images", e.target.value)} placeholder="Cole URLs de imagens, uma por linha" />
          </div>

          {/* === Status === */}
          <div className="flex items-center gap-3 pt-6">
            <Switch id="is_active" checked={form.is_active ?? true} onCheckedChange={(v) => set("is_active", v)} />
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
