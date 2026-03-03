import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MessageSquare, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/common/LoadingState";
import { RelativeTime } from "@/components/common/RelativeTime";
import { SentimentBadge } from "@/components/common/SentimentBadge";
import { CustomerInfo } from "@/components/customers/CustomerInfo";
import { CustomerTags } from "@/components/customers/CustomerTags";
import { CustomerNotes } from "@/components/customers/CustomerNotes";
import { CustomerHistory } from "@/components/customers/CustomerHistory";
import { useCustomer, useCustomerSentimentStats } from "@/hooks/useCustomers";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function CustomerDetail() {
  usePageTitle("Detalhe do Cliente");
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: sentimentStats } = useCustomerSentimentStats(id);

  if (isLoading) return <LoadingState type="card" />;
  if (!customer) return <p className="text-muted-foreground text-center py-16">Cliente não encontrado</p>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/customers")} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <CustomerInfo customer={customer} />
          <CustomerTags customerId={customer.id} tags={customer.tags ?? []} />
          <CustomerNotes customerId={customer.id} notes={customer.notes ?? ""} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{customer.total_conversations ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total de Conversas</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
                <div>
                  {sentimentStats ? (
                    <SentimentBadge sentiment={sentimentStats.predominant} />
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Sentimento Médio</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-8 w-8 text-muted-foreground" />
                <div>
                  {customer.last_contact_at ? (
                    <RelativeTime date={customer.last_contact_at} className="text-lg font-semibold text-foreground" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <p className="text-xs text-muted-foreground">Última Interação</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <CustomerHistory customerId={customer.id} />
        </div>
      </div>
    </div>
  );
}
