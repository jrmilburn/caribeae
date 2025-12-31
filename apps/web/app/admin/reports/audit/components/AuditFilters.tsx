import * as React from "react";
import { CalendarIcon, Filter, RefreshCcw } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  subDays,
} from "date-fns";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function toInputDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type Preset = {
  label: string;
  getRange: () => { from: string; to: string };
};

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
  const presets: Preset[] = React.useMemo(() => {
    const now = new Date();
    return [
      {
        label: "This month",
        getRange: () => ({
          from: toInputDate(startOfMonth(now)),
          to: toInputDate(endOfMonth(now)),
        }),
      },
      {
        label: "Last month",
        getRange: () => {
          const last = subMonths(now, 1);
          return {
            from: toInputDate(startOfMonth(last)),
            to: toInputDate(endOfMonth(last)),
          };
        },
      },
      {
        label: "Last 7 days",
        getRange: () => ({
          from: toInputDate(subDays(now, 6)),
          to: toInputDate(now),
        }),
      },
      {
        label: "This week",
        getRange: () => ({
          from: toInputDate(startOfWeek(now, { weekStartsOn: 1 })),
          to: toInputDate(endOfWeek(now, { weekStartsOn: 1 })),
        }),
      },
    ];
  }, []);

  function applyPreset(p: Preset) {
    const r = p.getRange();
    onFromChange(r.from);
    onToChange(r.to);
  }

  function isActivePreset(p: Preset) {
    const r = p.getRange();
    return from === r.from && to === r.to;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Filters</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          {/* Left cluster */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Date range (kept tight + consistent heights) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="audit-from" className="text-[11px] text-muted-foreground">
                  From
                </Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="audit-from"
                    type="date"
                    value={from}
                    onChange={(e) => onFromChange(e.target.value)}
                    className="h-9 pl-9"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="audit-to" className="text-[11px] text-muted-foreground">
                  To
                </Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="audit-to"
                    type="date"
                    value={to}
                    onChange={(e) => onToChange(e.target.value)}
                    className="h-9 pl-9"
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>

            {/* Inline option (no big pill) */}
            <label className="flex h-9 items-center gap-2 rounded-md px-2 text-sm">
              <Checkbox
                checked={includeVoided}
                onCheckedChange={(checked) => onIncludeVoidedChange(Boolean(checked))}
                disabled={isPending}
              />
              <span className="text-sm text-muted-foreground">Include voided</span>
            </label>
          </div>

          {/* Right cluster: actions */}
          <div className="flex items-center gap-2 lg:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={isPending}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button type="button" size="sm" onClick={onApply} disabled={isPending}>
              <Filter className="mr-2 h-4 w-4" />
              {isPending ? "Loading" : "Apply"}
            </Button>
          </div>
        </div>

        {/* Presets (quiet chips) */}
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => {
            const active = isActivePreset(p);
            return (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p)}
                disabled={isPending}
                className={cn(
                  "h-8 rounded-full border-muted-foreground/20 bg-transparent px-3 text-muted-foreground hover:bg-muted/40",
                  active && "border-foreground/30 bg-muted text-foreground"
                )}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
