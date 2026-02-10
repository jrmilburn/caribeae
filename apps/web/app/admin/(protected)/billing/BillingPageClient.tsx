"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BillingMonthSummary } from "@/server/billing/actions";

type Props = {
  months: BillingMonthSummary[];
  currentMonthKey: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return currencyFormatter.format(value);
}

export default function BillingPageClient({ months, currentMonthKey }: Props) {
  const initialKey = currentMonthKey || months[0]?.monthKey || "";
  const [selectedKey, setSelectedKey] = React.useState(initialKey);

  const selectedIndex = months.findIndex((month) => month.monthKey === selectedKey);
  const resolvedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selected = months[resolvedIndex] ?? months[0];

  if (!months.length || !selected) {
    return <div className="p-6 text-sm text-muted-foreground">Loading billing data...</div>;
  }

  const previousMonth = months[resolvedIndex + 1];
  const nextMonth = months[resolvedIndex - 1];
  const isEmptyMonth = selected.outboundCount + selected.inboundCount === 0;
  const allEmpty = months.every((month) => month.outboundCount + month.inboundCount === 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-card px-6 py-4">
        <div>
          <div className="text-base font-semibold">Billing</div>
          <div className="text-xs text-muted-foreground">Studio Parallel monthly totals (Brisbane time).</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => previousMonth && setSelectedKey(previousMonth.monthKey)}
            disabled={!previousMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.monthKey} value={month.monthKey}>
                  {month.monthLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => nextMonth && setSelectedKey(nextMonth.monthKey)}
            disabled={!nextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-6 p-6">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Summary - {selected.monthLabel}</div>
            {isEmptyMonth ? <Badge variant="outline">No messaging activity</Badge> : null}
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Retainer</span>
              <span className="font-medium">{formatMoney(selected.retainer)}</span>
            </div>

            <div className="border-t pt-3">
              <div className="text-sm font-medium">Messaging</div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Outbound ({selected.outboundCount})</span>
                  <span>{formatMoney(selected.outboundCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Inbound ({selected.inboundCount})</span>
                  <span>{formatMoney(selected.inboundCost)}</span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                <span>Messaging total</span>
                <span>{formatMoney(selected.messagingTotal)}</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Month total</span>
                <span>{formatMoney(selected.totalDue)}</span>
              </div>
            </div>
          </div>
        </div>

        {allEmpty ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No messaging activity recorded yet. Retainers still apply each month.
          </div>
        ) : null}

        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-semibold">Monthly history</div>

          <div className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Outbound</TableHead>
                  <TableHead>Inbound</TableHead>
                  <TableHead>Messaging total</TableHead>
                  <TableHead>Total due</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((month) => {
                  const isSelected = month.monthKey === selectedKey;
                  return (
                    <TableRow key={month.monthKey} data-state={isSelected ? "selected" : undefined}>
                      <TableCell className="font-medium">{month.monthLabel}</TableCell>
                      <TableCell>{month.outboundCount}</TableCell>
                      <TableCell>{month.inboundCount}</TableCell>
                      <TableCell>{formatMoney(month.messagingTotal)}</TableCell>
                      <TableCell>{formatMoney(month.totalDue)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedKey(month.monthKey)}
                          className={cn(isSelected && "opacity-60")}
                          disabled={isSelected}
                        >
                          {isSelected ? "Viewing" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
