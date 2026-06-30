import { useState } from "react";
import { subDays, format } from "date-fns";
import { Download, MessageSquare, Mail, CheckCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { KPICard } from "@/components/common/KPICard";
import { LoadingState } from "@/components/common/LoadingState";
import { DateRangePicker } from "@/components/analytics/DateRangePicker";
import { AnalyticsCharts } from "@/components/analytics/AnalyticsCharts";
import { useAnalyticsSummary, useAnalyticsDaily } from "@/hooks/useAnalytics";
import { formatCurrency } from "@/lib/formatters";
import { usePageTitle } from "@/hooks/usePageTitle";

function exportCSV(data: any[], startDate: string, endDate: string) {
  const headers = "Data,Conversas,Mensagens,Tempo Médio (s),Taxa Resolução (%),Taxa Escalonamento (%),Sentimento Positivo,Sentimento Negativo,Sentimento Neutro,Custo (R$)\n";
  const rows = data.map((r) =>
    [
      r.date,
      r.total_conversations ?? 0,
      r.total_messages ?? 0,
      ((r.avg_response_time_ms ?? 0) / 1000).toFixed(1),
      (r.resolution_rate ?? 0).toFixed(1),
      (r.escalation_rate ?? 0).toFixed(1),
      r.sentiment_positive ?? 0,
      r.sentiment_negative ?? 0,
      r.sentiment_neutral ?? 0,
      ((r.estimated_cost_brl ?? 0)).toFixed(2),
    ].join(",")
  ).join("\n");

  const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics_${startDate}_${endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const Analytics = () => {
  usePageTitle("Analytics");
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data: summary, isLoading: loadingSummary } = useAnalyticsSummary(startDate, endDate);
  const { data: daily, isLoading: loadingDaily } = useAnalyticsDaily(startDate, endDate);

  // Frescor dos dados: data mais recente presente no período (daily vem ordenado asc).
  // Se o rollup parar de atualizar, este selo passa a mostrar uma data antiga — sinal visível.
  const lastDataDate = daily && daily.length ? daily[daily.length - 1].date : null;

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  if (loadingSummary && loadingDaily) return <LoadingState type="card" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics">
        <Button variant="outline" size="sm" onClick={() => daily && exportCSV(daily, startDate, endDate)}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </PageHeader>

      <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />

      {lastDataDate ? (
        <p className="text-xs text-muted-foreground -mt-2">
          Dados até {lastDataDate.split("-").reverse().join("/")} · atualização automática a cada 3h
        </p>
      ) : (
        <p className="text-xs text-muted-foreground -mt-2">
          Nenhum dado no período selecionado.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Conversas" value={summary?.totalConversations ?? 0} icon={MessageSquare} />
        <KPICard title="Total Mensagens" value={summary?.totalMessages ?? 0} icon={Mail} />
        <KPICard title="Taxa de Resolução" value={summary?.avgResolutionRate ?? 0} icon={CheckCircle} format="percent" />
        <KPICard title="Custo Total" value={summary?.totalCostBRL ?? 0} icon={DollarSign} format="currency" />
      </div>

      {daily && <AnalyticsCharts data={daily} />}
    </div>
  );
};

export default Analytics;
