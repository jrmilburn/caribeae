import { CalendarIcon, Filter, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuditFilters({
  from,
  to,
  includeVoided,
  onFromChange,
  onToChange,
  onIncludeVoidedChange,
  onApply,
  onReset,
  isPending,
}: {
  from: string;
  to: string;
  includeVoided: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onIncludeVoidedChange: (value: boolean) => void;
  onApply: () => void;
  onReset: () => void;
  isPending: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">From</Label>
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">To</Label>
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="flex items-center space-x-2 rounded-md border p-3">
        <Checkbox
          id="include-voided"
          checked={includeVoided}
          onCheckedChange={(checked) => onIncludeVoidedChange(Boolean(checked))}
        />
        <div className="space-y-0.5">
          <Label htmlFor="include-voided" className="text-sm font-medium">
            Include voided invoices
          </Label>
          <p className="text-xs text-muted-foreground">Default view excludes voided invoices.</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button size="sm" onClick={onApply} disabled={isPending}>
          <Filter className="mr-2 h-4 w-4" />
          {isPending ? "Loading" : "Apply"}
        </Button>
      </div>
    </div>
  );
}
