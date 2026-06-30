import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { AnalyticsDaily } from "@/types/database";
import type { Json } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/formatters";

interface AnalyticsChartsProps {
  data: AnalyticsDaily[];
}

const fmtDate = (d: string) => {
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
};

const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 };

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={280}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </Card>
  );
}

function aggregateJsonb(data: AnalyticsDaily[], field: "top_categories" | "top_products_asked") {
  const agg: Record<string, number> = {};
  for (const row of data) {
    const val = row[field] as Json | null;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) {
        if (typeof v === "number") agg[k] = (agg[k] ?? 0) + v;
      }
    }
  }
  return Object.entries(agg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));
}

// Encurta o nome do produto só pro rótulo do eixo (evita sobreposição no ranking):
// remove palavras de enchimento (Porcelana, Vidro...) e abrevia termos longos,
// PRESERVANDO tamanho/ml (a parte que distingue). O nome completo continua no tooltip.
function shortenProductName(name: string): string {
  let s = name
    .replace(/\s*\bde Madeira\b/gi, "")
    .replace(/\bcom Suporte\b/gi, "c/ Suporte")
    .replace(/\bVidro Hermético\b/gi, "Hermético")
    .replace(/\bPorcelana\b/gi, "")
    .replace(/\bAcrílico\b/gi, "")
    .replace(/\bCerâmica\b/gi, "")
    .replace(/\bVidro\b/gi, "")
    .replace(/\bHermético\b/gi, "Herm.")
    .replace(/\bQuadrado\b/gi, "Quad.")
    .replace(/\bRetangular\b/gi, "Retang.")
    .replace(/\bRedondo\b/gi, "Red.")
    .replace(/\bMedidora\b/gi, "Med.")
    .replace(/\btamanhos\b/gi, "tam.")
    .replace(/\s+([)\]])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  const MAX = 28;
  if (s.length > MAX) s = s.slice(0, MAX - 1).trimEnd() + "…";
  return s;
}

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  const chartData = useMemo(() => data.map((r) => ({
    date: fmtDate(r.date),
    conversations: r.total_conversations ?? 0,
    messages: r.total_messages ?? 0,
    responseTime: ((r.avg_response_time_ms ?? 0) / 1000),
    resolutionRate: r.resolution_rate ?? 0,
    escalationRate: r.escalation_rate ?? 0,
  })), [data]);

  const sentimentData = useMemo(() => {
    const pos = data.reduce((s, r) => s + (r.sentiment_positive ?? 0), 0);
    const neg = data.reduce((s, r) => s + (r.sentiment_negative ?? 0), 0);
    const neu = data.reduce((s, r) => s + (r.sentiment_neutral ?? 0), 0);
    return [
      { name: "Positivo", value: pos, color: "#18794E" },
      { name: "Negativo", value: neg, color: "#E53935" },
      { name: "Neutro", value: neu, color: "#7EADAD" },
    ];
  }, [data]);

  const categories = useMemo(() => aggregateJsonb(data, "top_categories"), [data]);
  const products = useMemo(() => aggregateJsonb(data, "top_products_asked"), [data]);

  const costData = useMemo(() => {
    let acc = 0;
    return data.map((r) => {
      acc += (r.estimated_cost ?? 0) * 5.0;
      return { date: fmtDate(r.date), cost: acc };
    });
  }, [data]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1 - Conversations per day */}
      <ChartCard title="Conversas por Dia">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="conversations" fill="#004D4D" radius={[4, 4, 0, 0]} name="Conversas" />
        </BarChart>
      </ChartCard>

      {/* 2 - Avg response time */}
      <ChartCard title="Tempo Médio de Resposta">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="s" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}s`, "Tempo"]} />
          <Line type="monotone" dataKey="responseTime" stroke="#004D4D" strokeWidth={2} dot={{ r: 3 }} name="Tempo (s)" />
        </LineChart>
      </ChartCard>

      {/* 3 - Resolution vs Escalation */}
      <ChartCard title="Resolução vs Escalonamento">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="%" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
          <Area type="monotone" dataKey="resolutionRate" stackId="1" stroke="#18794E" fill="#18794E" fillOpacity={0.3} name="Resolução" />
          <Area type="monotone" dataKey="escalationRate" stackId="1" stroke="#E53935" fill="#E53935" fillOpacity={0.3} name="Escalonamento" />
        </AreaChart>
      </ChartCard>

      {/* 4 - Sentiment pie */}
      <ChartCard title="Distribuição de Sentimento">
        <PieChart>
          <Pie data={sentimentData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {sentimentData.map((e, i) => <Cell key={i} fill={e.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
        </PieChart>
      </ChartCard>

      {/* 5 - Top categories */}
      <ChartCard title="Top Categorias">
        <BarChart data={categories} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#004D4D" radius={[0, 4, 4, 0]} name="Ocorrências" />
        </BarChart>
      </ChartCard>

      {/* 6 - Top products */}
      <ChartCard title="Top Produtos Consultados">
        <BarChart data={products} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis type="category" dataKey="name" tickFormatter={shortenProductName} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={150} interval={0} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#7EADAD" radius={[0, 4, 4, 0]} name="Consultas" />
        </BarChart>
      </ChartCard>

      {/* 7 - Messages per day */}
      <ChartCard title="Mensagens por Dia">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="messages" stroke="#004D4D" fill="#004D4D" fillOpacity={0.1} name="Mensagens" />
        </AreaChart>
      </ChartCard>

      {/* 8 - Cumulative cost */}
      <ChartCard title="Custo Acumulado">
        <AreaChart data={costData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatCurrency(v)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatCurrency(v), "Custo"]} />
          <Area type="monotone" dataKey="cost" stroke="#18794E" fill="#18794E" fillOpacity={0.2} name="Custo (R$)" />
        </AreaChart>
      </ChartCard>
    </div>
  );
}
