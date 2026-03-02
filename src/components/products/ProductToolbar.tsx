import { Plus, Table2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchBar } from "@/components/common/SearchBar";
import { useProductLines } from "@/hooks/useProducts";

interface ProductToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  lineFilter: string;
  onLineFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  viewMode: "table" | "cards";
  onViewModeChange: (mode: "table" | "cards") => void;
  onAdd: () => void;
}

export function ProductToolbar({
  search, onSearchChange,
  lineFilter, onLineFilterChange,
  statusFilter, onStatusFilterChange,
  viewMode, onViewModeChange,
  onAdd,
}: ProductToolbarProps) {
  const { data: lines = [] } = useProductLines();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBar
        placeholder="Buscar por nome ou SKU..."
        value={search}
        onChange={onSearchChange}
        className="w-full sm:w-64"
      />

      <Select value={lineFilter} onValueChange={onLineFilterChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Linha" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {lines.map((l) => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Ativos</SelectItem>
          <SelectItem value="inactive">Inativos</SelectItem>
        </SelectContent>
      </Select>

      <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && onViewModeChange(v as "table" | "cards")}>
        <ToggleGroupItem value="table" aria-label="Tabela"><Table2 className="h-4 w-4" /></ToggleGroupItem>
        <ToggleGroupItem value="cards" aria-label="Cards"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
      </ToggleGroup>

      <Button onClick={onAdd} className="ml-auto">
        <Plus className="h-4 w-4 mr-1" /> Adicionar Produto
      </Button>
    </div>
  );
}
