import { MessageSquare, Clock, CheckCircle, AlertTriangle, DollarSign, Smile } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { KPICard } from "@/components/common/KPICard";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { ConversationsChart } from "@/components/dashboard/ConversationsChart";
import { SentimentChart } from "@/components/dashboard/SentimentChart";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import {
  usePendingEscalations,
  useConversationsToday,
  useTodayAnalytics,
  useConversationsByHour,
  useRecentConversations,
} from "@/hooks/useDashboardData";
import { formatCurrency } from "@/lib/formatters";
import { usePageTitle } from "@/hooks/usePageTitle";

function getDominantSentiment(pos: number, neg: number, neu: number): string {
  if (pos === 0 && neg === 0 && neu === 0) return "😐 --";
  if (pos >= neg && pos >= neu) return "😊 Positivo";
  if (neg >= pos && neg >= neu) return "😞 Negativo";
  return "😐 Neutro";
}

const Dashboard = () => {
  usePageTitle("Dashboard");
  const escalations = usePendingEscalations();
  const conversationsToday = useConversationsToday();
  const analytics = useTodayAnalytics();
  const chartData = useConversationsByHour();
  const recentConvs = useRecentConversations();

  const analyticsData = analytics.data;
  const avgResponseTime = analyticsData?.avg_response_time_ms
    ? `${(analyticsData.avg_response_time_ms / 1000).toFixed(1)}s`
    : "--";
  const resolutionRate = analyticsData?.resolution_rate ?? 0;
  const estimatedCostBRL = analyticsData?.estimated_cost
    ? formatCurrency(Number(analyticsData.estimated_cost) * 5)
    : "--";
  const sentPos = analyticsData?.sentiment_positive ?? 0;
  const sentNeg = analyticsData?.sentiment_negative ?? 0;
  const sentNeu = analyticsData?.sentiment_neutral ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do atendimento" />

      {/* Alert Banner */}
      {escalations.data !== undefined && escalations.data > 0 && (
        <AlertBanner count={escalations.data} />
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {conversationsToday.isLoading ? (
          <LoadingState type="card" />
        ) : conversationsToday.error ? (
          <ErrorState message="Erro ao carregar conversas" onRetry={() => conversationsToday.refetch()} />
        ) : (
          <KPICard
            title="Conversas Hoje"
            value={conversationsToday.data?.today ?? 0}
            icon={MessageSquare}
            trend={conversationsToday.data?.trend}
          />
        )}

        <KPICard
          title="Tempo Médio Resposta"
          value={avgResponseTime}
          icon={Clock}
        />

        <KPICard
          title="Taxa de Resolução"
          value={resolutionRate}
          icon={CheckCircle}
          format="percent"
        />

        <KPICard
          title="Escalonamentos Pendentes"
          value={escalations.data ?? 0}
          icon={AlertTriangle}
        />

        <KPICard
          title="Custo Estimado"
          value={estimatedCostBRL}
          icon={DollarSign}
        />

        <KPICard
          title="Sentimento Médio"
          value={getDominantSentiment(sentPos, sentNeg, sentNeu)}
          icon={Smile}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <ConversationsChart data={chartData.data} isLoading={chartData.isLoading} />
        <SentimentChart
          positive={sentPos}
          negative={sentNeg}
          neutral={sentNeu}
          isLoading={analytics.isLoading}
        />
      </div>

      {/* Recent Conversations */}
      <RecentConversations
        conversations={recentConvs.data}
        isLoading={recentConvs.isLoading}
      />
    </div>
  );
};

export default Dashboard;
