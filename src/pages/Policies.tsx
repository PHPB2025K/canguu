import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PolicyTable } from "@/components/policies/PolicyTable";
import { PolicyDialog } from "@/components/policies/PolicyDialog";
import { FaqTable } from "@/components/policies/FaqTable";
import { FaqDialog } from "@/components/policies/FaqDialog";
import { usePolicyList, useDeletePolicy, useFaqList, useFaqCategories, useDeleteFaq } from "@/hooks/usePolicies";
import { toast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { Tables } from "@/integrations/supabase/types";

const POLICY_CATEGORIES = ["Troca", "Entrega", "Garantia", "Pagamento", "Geral"];

export default function Policies() {
  usePageTitle("Políticas / FAQ");
  // Policy state
  const [policyCatFilter, setPolicyCatFilter] = useState<string>("");
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Tables<"policies"> | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<Tables<"policies"> | null>(null);

  // FAQ state
  const [faqCatFilter, setFaqCatFilter] = useState<string>("");
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Tables<"faq"> | null>(null);
  const [deletingFaq, setDeletingFaq] = useState<Tables<"faq"> | null>(null);

  const policiesQuery = usePolicyList(policyCatFilter || undefined);
  const deletePolicyMut = useDeletePolicy();
  const faqQuery = useFaqList(faqCatFilter || undefined);
  const faqCatsQuery = useFaqCategories();
  const deleteFaqMut = useDeleteFaq();

  const handleDeletePolicy = async () => {
    if (!deletingPolicy) return;
    try {
      await deletePolicyMut.mutateAsync(deletingPolicy.id);
      toast({ title: "Política excluída com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
    setDeletingPolicy(null);
  };

  const handleDeleteFaq = async () => {
    if (!deletingFaq) return;
    try {
      await deleteFaqMut.mutateAsync(deletingFaq.id);
      toast({ title: "Pergunta excluída com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
    setDeletingFaq(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Políticas / FAQ" description="Gerencie políticas e perguntas frequentes" />

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Políticas</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={policyCatFilter} onValueChange={(v) => setPolicyCatFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {POLICY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => { setEditingPolicy(null); setPolicyDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 ml-auto">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Política
            </Button>
          </div>

          {policiesQuery.isLoading && <LoadingState type="table" />}
          {!policiesQuery.isLoading && (policiesQuery.data?.length ?? 0) === 0 && (
            <EmptyState icon={FileText} title="Nenhuma política cadastrada" actionLabel="Adicionar política" onAction={() => { setEditingPolicy(null); setPolicyDialogOpen(true); }} />
          )}
          {!policiesQuery.isLoading && (policiesQuery.data?.length ?? 0) > 0 && (
            <PolicyTable
              policies={policiesQuery.data!}
              onEdit={(p) => { setEditingPolicy(p); setPolicyDialogOpen(true); }}
              onDelete={setDeletingPolicy}
            />
          )}
        </TabsContent>

        <TabsContent value="faq" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={faqCatFilter} onValueChange={(v) => setFaqCatFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(faqCatsQuery.data ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => { setEditingFaq(null); setFaqDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 ml-auto">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Pergunta
            </Button>
          </div>

          {faqQuery.isLoading && <LoadingState type="table" />}
          {!faqQuery.isLoading && (faqQuery.data?.length ?? 0) === 0 && (
            <EmptyState icon={FileText} title="Nenhuma pergunta cadastrada" actionLabel="Adicionar pergunta" onAction={() => { setEditingFaq(null); setFaqDialogOpen(true); }} />
          )}
          {!faqQuery.isLoading && (faqQuery.data?.length ?? 0) > 0 && (
            <FaqTable
              faqs={faqQuery.data!}
              onEdit={(f) => { setEditingFaq(f); setFaqDialogOpen(true); }}
              onDelete={setDeletingFaq}
            />
          )}
        </TabsContent>
      </Tabs>

      <PolicyDialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen} policy={editingPolicy} />
      <FaqDialog open={faqDialogOpen} onOpenChange={setFaqDialogOpen} faq={editingFaq} />

      <ConfirmDialog
        open={!!deletingPolicy}
        onOpenChange={(open) => !open && setDeletingPolicy(null)}
        title="Excluir Política"
        description={`Tem certeza que deseja excluir "${deletingPolicy?.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDeletePolicy}
        variant="destructive"
      />
      <ConfirmDialog
        open={!!deletingFaq}
        onOpenChange={(open) => !open && setDeletingFaq(null)}
        title="Excluir Pergunta"
        description="Tem certeza que deseja excluir esta pergunta? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDeleteFaq}
        variant="destructive"
      />
    </div>
  );
}
