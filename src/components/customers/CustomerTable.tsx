import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, ArrowUpDown } from "lucide-react";
import { formatPhone, displayName } from "@/lib/formatters";
import { RelativeTime } from "@/components/common/RelativeTime";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

const sourceColors: Record<string, string> = {
  whatsapp: "bg-success/15 text-success border-success/20",
  site: "bg-primary/10 text-primary border-primary/20",
  marketplace: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

interface CustomerTableProps {
  customers: Customer[];
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
}

export function CustomerTable({ customers, sortColumn, sortDirection, onSort }: CustomerTableProps) {
  const navigate = useNavigate();

  const SortHeader = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(column)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortColumn === column && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader column="name">Nome</SortHeader>
          <TableHead>Telefone</TableHead>
          <TableHead>Origem</TableHead>
          <SortHeader column="total_conversations">Conversas</SortHeader>
          <SortHeader column="last_contact_at">Último Contato</SortHeader>
          <TableHead>Tags</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((c) => {
          const tags = c.tags ?? [];
          const visibleTags = tags.slice(0, 2);
          const extra = tags.length - 2;
          return (
            <TableRow key={c.id} className="cursor-pointer hover:bg-porcelain transition-colors" onClick={() => navigate(`/customers/${c.id}`)}>
              <TableCell className="font-medium text-foreground">{displayName(c.name, c.phone)}</TableCell>
              <TableCell className="text-muted-foreground">{formatPhone(c.phone)}</TableCell>
              <TableCell>
                {c.source ? (
                  <Badge variant="outline" className={sourceColors[c.source] ?? ""}>{c.source}</Badge>
                ) : "—"}
              </TableCell>
              <TableCell>{c.total_conversations ?? 0}</TableCell>
              <TableCell>{c.last_contact_at ? <RelativeTime date={c.last_contact_at} className="text-muted-foreground" /> : "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {visibleTags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  {extra > 0 && <Badge variant="outline" className="text-xs">+{extra}</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`); }}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
