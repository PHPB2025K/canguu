import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPhone } from "@/lib/formatters";
import type { Tables } from "@/integrations/supabase/types";

const sourceColors: Record<string, string> = {
  whatsapp: "bg-success/15 text-success border-success/20",
  site: "bg-primary/10 text-primary border-primary/20",
  marketplace: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

interface CustomerInfoProps {
  customer: Tables<"customers">;
}

export function CustomerInfo({ customer }: CustomerInfoProps) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-foreground">
            {getInitials(customer.name)}
          </div>
          <h2 className="text-xl font-bold text-foreground">{customer.name || "Sem nome"}</h2>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">{formatPhone(customer.phone)}</p>
          <p className="text-muted-foreground">{customer.email || <span className="italic">Sem email</span>}</p>
          {customer.source && (
            <Badge variant="outline" className={sourceColors[customer.source] ?? ""}>{customer.source}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
