import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
  extractMarketplacePrice, extractMarketplaceLink,
} from "@/hooks/useProducts";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: product, isLoading } = useProduct(id);
  const updateMutation = useUpdateProduct();

  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku,
        name: product.name,
        product_line: product.product_line ?? "",
        material: product.material ?? "",
        price_site: product.price_site != null ? String(product.price_site) : "",
        price_marketplace: extractMarketplacePrice(product.price_marketplace) != null
          ? String(extractMarketplacePrice(product.price_marketplace)) : "",
        stock_quantity: product.stock_quantity != null ? String(product.stock_quantity) : "0",
        dimensions: dimensionsToText(product.dimensions),
        short_description: product.short_description ?? "",
        full_description: product.full_description ?? "",
        images: imagesToText(product.images),
        usage_suggestions: product.usage_suggestions ?? "",
        differentials: product.differentials ?? "",
        site_link: product.site_link ?? "",
        marketplace_links: extractMarketplaceLink(product.marketplace_links),
        is_active: product.is_active ?? true,
      });
    }
  }, [product]);

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.sku?.trim() || !form.name?.trim()) {
      toast({ title: "SKU e Nome são obrigatórios", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: id!,
        name: form.name.trim(),
        product_line: form.product_line.trim() || null,
        material: form.material.trim() || null,
        price_site: form.price_site ? parseFloat(form.price_site) : null,
        price_marketplace: form.price_marketplace ? { default: parseFloat(form.price_marketplace) } : null,
        stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity, 10) : 0,
        dimensions: form.dimensions.trim() ? { raw: form.dimensions.trim() } : null,
        short_description: form.short_description.trim() || null,
        full_description: form.full_description.trim() || null,
        images: textToImages(form.images).length > 0 ? textToImages(form.images) : null,
        usage_suggestions: form.usage_suggestions.trim() || null,
        differentials: form.differentials.trim() || null,
        site_link: form.site_link.trim() || null,
        marketplace_links: form.marketplace_links.trim() ? { url: form.marketplace_links.trim() } : null,
        is_active: form.is_active,
      } as any);
      toast({ title: "Produto atualizado com sucesso" });
      navigate("/products");
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <LoadingState type="table" />;
  if (!product) return <p className="text-muted-foreground p-8">Produto não encontrado.</p>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/products")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para produtos
      </Button>

      <h1 className="text-2xl font-bold">Editar Produto</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
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
          <Input value={form.product_line ?? ""} onChange={(e) => set("product_line", e.target.value)} placeholder="Ex: BGL, CQT" />
        </div>
        <div>
          <Label>Material</Label>
          <Input value={form.material ?? ""} onChange={(e) => set("material", e.target.value)} />
        </div>
        <div>
          <Label>Preço Site R$</Label>
          <Input type="number" step="0.01" value={form.price_site ?? ""} onChange={(e) => set("price_site", e.target.value)} />
        </div>
        <div>
          <Label>Preço Marketplace R$</Label>
          <Input type="number" step="0.01" value={form.price_marketplace ?? ""} onChange={(e) => set("price_marketplace", e.target.value)} />
        </div>
        <div>
          <Label>Estoque</Label>
          <Input type="number" min="0" value={form.stock_quantity ?? "0"} onChange={(e) => set("stock_quantity", e.target.value)} />
        </div>
        <div>
          <Label>Dimensões</Label>
          <Input value={form.dimensions ?? ""} onChange={(e) => set("dimensions", e.target.value)} placeholder="Ex: 25x10x8cm" />
        </div>
        <div>
          <Label>Descrição Curta</Label>
          <Textarea rows={2} value={form.short_description ?? ""} onChange={(e) => set("short_description", e.target.value)} />
        </div>
        <div>
          <Label>Link Site</Label>
          <Input type="url" value={form.site_link ?? ""} onChange={(e) => set("site_link", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Descrição Completa</Label>
          <Textarea rows={4} value={form.full_description ?? ""} onChange={(e) => set("full_description", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Imagens (URLs, uma por linha)</Label>
          <Textarea rows={3} value={form.images ?? ""} onChange={(e) => set("images", e.target.value)} placeholder="Cole URLs de imagens, uma por linha" />
        </div>
        <div className="sm:col-span-2">
          <Label>Sugestões de Uso</Label>
          <Textarea rows={2} value={form.usage_suggestions ?? ""} onChange={(e) => set("usage_suggestions", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Diferenciais</Label>
          <Textarea rows={2} value={form.differentials ?? ""} onChange={(e) => set("differentials", e.target.value)} />
        </div>
        <div>
          <Label>Link Marketplace</Label>
          <Input type="url" value={form.marketplace_links ?? ""} onChange={(e) => set("marketplace_links", e.target.value)} />
        </div>
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
