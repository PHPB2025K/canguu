import { useState } from "react";
import { AlertTriangle, Clock, CheckCircle, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { EscalationCard } from "@/components/escalations/EscalationCard";
import { ResolveDialog } from "@/components/escalations/ResolveDialog";
import { useEscalationList, useEscalationCounts, useAssignEscalation, useResolveEscalation } from "@/hooks/useEscalations";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";

const Escalations = () => {
  usePageTitle("Escalonamentos");
  const [tab, setTab] = useState("pending");
  const [resolveId, setResolveId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  const statusFilter = tab === "all" ? undefined : tab;
  const { data: escalations, isLoading } = useEscalationList(statusFilter);
  const { data: counts } = useEscalationCounts();
  const assignMut = useAssignEscalation();
  const resolveMut = useResolveEscalation();

  const handleAssign = (id: string) => {
    assignMut.mutate({ id, email: user?.email ?? "unknown" }, {
      onSuccess: () => toast({ title: "Escalonamento assumido" }),
    });
  };

  const handleResolve = (notes: string) => {
    if (!resolveId) return;
    resolveMut.mutate({ id: resolveId, notes }, {
      onSuccess: () => {
        toast({ title: "Escalonamento resolvido" });
        setResolveId(null);
      },
    });
  };

  const emptyStates: Record<string, { icon: typeof Sparkles; title: string; description: string }> = {
    pending: { icon: Sparkles, title: "Nenhum escalonamento pendente 🎉", description: "Todos os atendimentos estão em dia" },
    in_progress: { icon: Clock, title: "Nenhum escalonamento em andamento", description: "" },
    resolved: { icon: CheckCircle, title: "Nenhum escalonamento resolvido ainda", description: "" },
    all: { icon: AlertTriangle, title: "Nenhum escalonamento registrado", description: "" },
  };

  const renderContent = () => {
    if (isLoading) return <LoadingState type="list" />;
    if (!escalations?.length) {
      const es = emptyStates[tab] ?? emptyStates.all;
      return <EmptyState icon={es.icon} title={es.title} description={es.description} />;
    }
    return (
      <div className="grid grid-cols-1 gap-4">
        {escalations.map((e) => (
          <EscalationCard
            key={e.id}
            escalation={e}
            onAssign={() => handleAssign(e.id)}
            onResolve={() => setResolveId(e.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Escalonamentos" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pendentes
            {(counts?.pending ?? 0) > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">{counts?.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="gap-1.5">
            Em Andamento
            {(counts?.in_progress ?? 0) > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">{counts?.in_progress}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1.5">
            Resolvidos
            {(counts?.resolved ?? 0) > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">{counts?.resolved}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {renderContent()}
        </TabsContent>
      </Tabs>

      <ResolveDialog
        open={!!resolveId}
        onOpenChange={(v) => { if (!v) setResolveId(null); }}
        onConfirm={handleResolve}
        loading={resolveMut.isPending}
      />
    </div>
  );
};

export default Escalations;
