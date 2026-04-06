import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Sparkles, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/common/LoadingState";
import { useToast } from "@/hooks/use-toast";
import {
  useProduct, useUpdateProduct,
  imagesToText, textToImages, dimensionsToText,
  extractAllMarketplacePrices, buildMarketplacePriceJson,
  extractAllMarketplaceLinks, buildMarketplaceLinkJson,
  MARKETPLACE_PLATFORMS, MARKETPLACE_LABELS, MARKETPLACE_LINK_PLACEHOLDERS,
} from "@/hooks/useProducts";
import {
  useBaseProduct, useKitCompositions,
  saveBaseProductContent, triggerReEmbedding,
  CONTENT_RICH_FIELDS,
} from "@/hooks/useBaseProducts";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ProductListingsSection } from "@/components/products/ProductListingsSection";

export default function ProductDetail() {
  usePageTitle("Editar Produto");
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: product, isLoading } = useProduct(id);
  const updateMutation = useUpdateProduct();

  // Base product data (content-rich fields)
  const baseProductId = (product as any)?.base_product_id as string | null;
  const { data: baseProduct } = useBaseProduct(baseProductId);
  const { data: kitComps } = useKitCompositions(product?.sku);

  const [form, setForm] = useState<Record<string, any>>({});
  const [embeddingStatus, setEmbeddingStatus] = useState<"idle" | "updating">("idle");
  const initialContentRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!product) return;

    // Merge: commercial from products, content-rich from base_products (if linked)
    const bp = baseProduct;
    const f: Record<string, any> = {
      sku: product.sku,
      name: product.name,
      product_line: product.product_line ?? "",
      material: product.material ?? "",
      price_site: product.price_site != null ? String(product.price_site) : "",
      mp_prices: extractAllMarketplacePrices(product.price_marketplace),
      mp_links: extractAllMarketplaceLinks(product.marketplace_links),
      site_link: product.site_link ?? "",
      stock_quantity: product.stock_quantity != null ? String(product.stock_quantity) : "0",
      dimensions: dimensionsToText(product.dimensions),
      images: imagesToText(product.images),
      is_active: product.is_active ?? true,
      // Content-rich: prefer base_product if linked, else fall back to products
      short_description: bp?.description_short ?? product.short_description ?? "",
      full_description: bp?.description_full ?? product.full_description ?? "",
      usage_suggestions: bp?.usage_suggestions ?? product.usage_suggestions ?? "",
      differentials: bp?.differentials ?? product.differentials ?? "",
      tags: bp?.tags ? bp.tags.join(", ") : "",
    };

    setForm(f);

    // Snapshot content-rich fields for change detection
    initialContentRef.current = {
      description_short: f.short_description,
      description_full: f.full_description,
      usage_suggestions: f.usage_suggestions,
      differentials: f.differentials,
      tags: f.tags,
    };
  }, [product, baseProduct]);

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.sku?.trim() || !form.name?.trim()) {
      toast({ title: "SKU e Nome são obrigatórios", variant: "destructive" });
      return;
    }

    try {
      // 1. Save commercial fields to products
      await updateMutation.mutateAsync({
        id: id!,
        name: form.name.trim(),
        product_line: form.product_line.trim() || null,
        material: form.material.trim() || null,
        price_site: form.price_site ? parseFloat(form.price_site) : null,
        price_marketplace: buildMarketplacePriceJson(form.mp_prices),
        marketplace_links: buildMarketplaceLinkJson(form.mp_links),
        site_link: form.site_link?.trim() || null,
        stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity, 10) : 0,
        dimensions: form.dimensions.trim() ? { raw: form.dimensions.trim() } : null,
        short_description: form.short_description.trim() || null,
        full_description: form.full_description.trim() || null,
        images: textToImages(form.images).length > 0 ? textToImages(form.images) : null,
        usage_suggestions: form.usage_suggestions.trim() || null,
        differentials: form.differentials.trim() || null,
        is_active: form.is_active,
      } as any);

      // 2. Save content-rich fields to base_products (if linked)
      let contentChanged = false;
      if (baseProductId) {
        const contentFields = {
          description_short: form.short_description.trim() || null,
          description_full: form.full_description.trim() || null,
          usage_suggestions: form.usage_suggestions.trim() || null,
          differentials: form.differentials.trim() || null,
          tags: form.tags?.trim() ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : null,
        };

        // Detect if content-rich fields changed
        const initial = initialContentRef.current;
        contentChanged = (
          contentFields.description_short !== (initial.description_short || null) ||
          contentFields.description_full !== (initial.description_full || null) ||
          contentFields.usage_suggestions !== (initial.usage_suggestions || null) ||
          contentFields.differentials !== (initial.differentials || null) ||
          (form.tags ?? "") !== (initial.tags ?? "")
        );

        await saveBaseProductContent(baseProductId, contentFields);

        // 3. Trigger re-embedding if content changed (async, non-blocking)
        if (contentChanged) {
          setEmbeddingStatus("updating");
          triggerReEmbedding();
          // Clear status after a delay
          setTimeout(() => setEmbeddingStatus("idle"), 5000);
        }
      }

      toast({
        title: "Produto atualizado com sucesso",
        description: contentChanged ? "Busca IA sendo atualizada..." : undefined,
      });
      navigate("/products");
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <LoadingState type="table" />;
  if (!product) return <p className="text-muted-foreground p-8">Produto não encontrado.</p>;

  const isKit = (product as any)?.is_unit === false;
  const kitQty = (product as any)?.kit_quantity ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/products")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para produtos
        </Button>
        {embeddingStatus === "updating" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-primary animate-pulse">
            <Sparkles className="h-3.5 w-3.5" />
            Busca IA atualizando...
          </span>
        )}
      </div>

      <h1 className="text-2xl font-bold">Editar Produto</h1>

      {/* Kit composition info */}
      {kitComps && kitComps.length > 0 && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {/* === Identification === */}
        <div>
          <Label>SKU</Label>
          <Input value={form.sku ?? ""} disabled />
        </div>
        <div>
          <Label>Nome *</Label>
          <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label>Linha</Label>
          <Input value={form.product_line ?? ""} onChange={(e) => set("product_line", e.target.value)} placeholder="Ex: YW, CK, SPC" />
        </div>
        <div>
          <Label>Material</Label>
          <Input value={form.material ?? ""} onChange={(e) => set("material", e.target.value)} />
        </div>

        {/* === Prices === */}
        <div>
          <Label>Preço Site R$</Label>
          <Input type="number" step="0.01" value={form.price_site ?? ""} onChange={(e) => set("price_site", e.target.value)} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label className="text-sm font-semibold">Preços por Plataforma</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MARKETPLACE_PLATFORMS.map((key) => (
              <div key={key}>
                <Label className="text-xs">{MARKETPLACE_LABELS[key]}</Label>
                <Input
                  type="number" step="0.01" placeholder="R$ 0,00"
                  value={form.mp_prices?.[key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, mp_prices: { ...prev.mp_prices, [key]: e.target.value } }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* === Links === */}
        <div className="sm:col-span-2 space-y-2">
          <Label className="text-sm font-semibold">Links de Anúncios</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Site Próprio</Label>
              <div className="flex gap-1.5">
                <Input type="url" placeholder="https://importadoragb.com.br/produto/..." value={form.site_link ?? ""} onChange={(e) => set("site_link", e.target.value)} />
                {form.site_link && (
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" asChild>
                    <a href={form.site_link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                )}
              </div>
            </div>
            {MARKETPLACE_PLATFORMS.filter(k => k !== 'tiktok').map((key) => (
              <div key={key}>
                <Label className="text-xs">{MARKETPLACE_LABELS[key]}</Label>
                <div className="flex gap-1.5">
                  <Input type="url" placeholder={MARKETPLACE_LINK_PLACEHOLDERS[key] ?? "https://..."} value={form.mp_links?.[key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, mp_links: { ...prev.mp_links, [key]: e.target.value } }))} />
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

        {/* === Stock & Physical === */}
        <div>
          <Label>Estoque</Label>
          <Input type="number" min="0" value={form.stock_quantity ?? "0"} onChange={(e) => set("stock_quantity", e.target.value)} />
        </div>
        <div>
          <Label>Dimensões</Label>
          <Input value={form.dimensions ?? ""} onChange={(e) => set("dimensions", e.target.value)} placeholder="Ex: 22x17x8cm" />
        </div>

        {/* === Content-Rich Fields (feeds AI embeddings) === */}
        <div
          className="sm:col-span-2 mt-3 py-5 px-5 rounded-xl border-l-4"
          style={{ borderLeftColor: '#004D4D', backgroundColor: 'rgba(126, 173, 173, 0.06)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4" style={{ color: '#004D4D' }} />
            <span className="text-sm font-semibold" style={{ color: '#004D4D' }}>Conteúdo para Busca Inteligente</span>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Estes campos alimentam a busca da Ana. Quanto mais detalhado, melhor a IA encontra e descreve o produto.
          </p>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Label>Descrição Curta</Label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>✨ Alimenta a IA</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">Resumo em 1-2 frases do que é o produto</p>
              <Textarea rows={2} className="bg-white" value={form.short_description ?? ""} onChange={(e) => set("short_description", e.target.value)} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Label>Descrição Completa</Label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>✨ Alimenta a IA</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">Detalhes técnicos, dimensões, composição do kit, compatibilidades</p>
              <Textarea rows={5} className="bg-white" value={form.full_description ?? ""} onChange={(e) => set("full_description", e.target.value)} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Label>Sugestões de Uso</Label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>✨ Alimenta a IA</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">Cenários de uso: marmita, meal prep, decoração, presente... Mais cenários = mais fácil a IA encontrar</p>
              <Textarea rows={3} className="bg-white" value={form.usage_suggestions ?? ""} onChange={(e) => set("usage_suggestions", e.target.value)} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Label>Diferenciais</Label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>✨ Alimenta a IA</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">O que diferencia: material, tecnologia, vedação, design</p>
              <Textarea rows={3} className="bg-white" value={form.differentials ?? ""} onChange={(e) => set("differentials", e.target.value)} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Label>Tags</Label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(126,173,173,0.12)', color: '#004D4D', border: '1px solid rgba(126,173,173,0.25)' }}>✨ Alimenta a IA</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">Palavras-chave separadas por vírgula: pote, vidro, hermético, marmita, fitness</p>
              <Input className="bg-white" value={form.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="pote, vidro, hermético, marmita, fitness, geladeira" />
            </div>
          </div>
        </div>

        {/* === Images === */}
        <div className="sm:col-span-2">
          <Label>Imagens (URLs, uma por linha)</Label>
          <Textarea rows={3} value={form.images ?? ""} onChange={(e) => set("images", e.target.value)} placeholder="Cole URLs de imagens, uma por linha" />
        </div>

        <ProductListingsSection productId={id!} />

        {/* === Status === */}
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.is_active ?? true} onCheckedChange={(v) => set("is_active", v)} />
          <Label>Produto ativo</Label>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/products")}>Cancelar</Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>
    </div>
  );
}
