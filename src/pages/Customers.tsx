import { useState, useMemo } from "react";
import { Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchBar } from "@/components/common/SearchBar";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useCustomerList } from "@/hooks/useCustomers";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Customers() {
  usePageTitle("Clientes");
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState("last_contact_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { data: customers, isLoading } = useCustomerList(search || undefined);

  const sorted = useMemo(() => {
    if (!customers) return [];
    return [...customers].sort((a, b) => {
      let valA: any, valB: any;
      if (sortColumn === "name") { valA = a.name ?? ""; valB = b.name ?? ""; }
      else if (sortColumn === "total_conversations") { valA = a.total_conversations ?? 0; valB = b.total_conversations ?? 0; }
      else { valA = a.last_contact_at ?? ""; valB = b.last_contact_at ?? ""; }
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [customers, sortColumn, sortDirection]);

  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDirection((d) => d === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDirection("desc"); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Gerencie seus clientes">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" disabled><Download className="h-4 w-4 mr-1" /> Exportar</Button>
          </TooltipTrigger>
          <TooltipContent>Em breve</TooltipContent>
        </Tooltip>
      </PageHeader>

      <SearchBar placeholder="Buscar por nome, telefone ou email..." value={search} onChange={setSearch} className="max-w-md" />

      {isLoading && <LoadingState type="table" />}
      {!isLoading && sorted.length === 0 && (
        <EmptyState icon={Users} title="Nenhum cliente encontrado" />
      )}
      {!isLoading && sorted.length > 0 && (
        <CustomerTable customers={sorted} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
      )}
    </div>
  );
}
