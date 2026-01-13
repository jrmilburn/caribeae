"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyFromCents } from "@/lib/currency";

type Summary = {
  totalOwingCents: number;
  overdueCount: number;
  paidLast30DaysCents: number;
  outstandingInvoiceCount: number;
};

export function BillingSummary({ summary }: { summary: Summary }) {
  const items = [
    {
      label: "Total owing",
      value: formatCurrencyFromCents(summary.totalOwingCents),
      helper: "Open balances across all families",
    },
    {
      label: "Overdue enrolments",
      value: summary.overdueCount.toLocaleString(),
      helper: "Based on paid-through dates or credits",
    },
    {
      label: "Paid last 30 days",
      value: formatCurrencyFromCents(summary.paidLast30DaysCents),
      helper: "Recorded payments",
    },
    {
      label: "Outstanding invoices",
      value: summary.outstandingInvoiceCount.toLocaleString(),
      helper: "Draft, sent, overdue, or partially paid",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{item.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-semibold leading-tight">{item.value}</div>
            <p className="text-xs text-muted-foreground">{item.helper}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
