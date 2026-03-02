import { useState, useMemo } from "react";
import { subDays, format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [preset, setPreset] = useState("30d");

  const handlePreset = (val: string) => {
    if (!val) return;
    setPreset(val);
    const days = val === "7d" ? 7 : val === "90d" ? 90 : 30;
    const end = new Date();
    const start = subDays(end, days);
    onChange(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
  };

  const handleDateChange = (type: "start" | "end", date: Date | undefined) => {
    if (!date) return;
    setPreset("");
    const formatted = format(date, "yyyy-MM-dd");
    if (type === "start") onChange(formatted, endDate);
    else onChange(startDate, formatted);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup type="single" value={preset} onValueChange={handlePreset} size="sm">
        <ToggleGroupItem value="7d">7d</ToggleGroupItem>
        <ToggleGroupItem value="30d">30d</ToggleGroupItem>
        <ToggleGroupItem value="90d">90d</ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">De</span>
        <DatePicker value={startDate} onChange={(d) => handleDateChange("start", d)} />
        <span className="text-sm text-muted-foreground">Até</span>
        <DatePicker value={endDate} onChange={(d) => handleDateChange("end", d)} />
      </div>
    </div>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (d: Date | undefined) => void }) {
  const selected = useMemo(() => (value ? new Date(value + "T00:00:00") : undefined), [value]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? format(new Date(value + "T00:00:00"), "dd/MM/yyyy") : "Selecionar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selected} onSelect={onChange} initialFocus />
      </PopoverContent>
    </Popover>
  );
}
