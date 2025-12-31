"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, Loader2, Receipt, Wallet } from "lucide-react";
import { endOfMonth, format, startOfMonth } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrencyFromCents } from "@/lib/currency";

import type { AuditReport } from "@/server/reports/getAuditReport";

import AuditFilters from "./components/AuditFilters";
import CashReport from "./components/CashReport";
import SalesReport from "./components/SalesReport";

function toDateInput(date: Date | null | undefined) {
  return date ? format(date, "yyyy-MM-dd") : "";
}

function buildQueryString(params: { from?: string; to?: string; includeVoided?: boolean }) {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.includeVoided) search.set("includeVoided", "true");
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export default function AuditPageClient({ report }: { report: AuditReport }) {
  const router = useRouter();
  const [from, setFrom] = React.useState(toDateInput(report.filters.from));
  const [to, setTo] = React.useState(toDateInput(report.filters.to));
  const [includeVoided, setIncludeVoided] = React.useState(report.filters.includeVoided);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setFrom(toDateInput(report.filters.from));
    setTo(toDateInput(report.filters.to));
    setIncludeVoided(report.filters.includeVoided);
  }, [report.filters]);

  const applyFilters = (next: { from?: string; to?: string; includeVoided?: boolean }) => {
    const qs = buildQueryString({
      from: next.from ?? from,
      to: next.to ?? to,
      includeVoided: next.includeVoided ?? includeVoided,
    });
    startTransition(() => {
      router.replace(`/admin/reports/audit${qs}`);
    });
  };

  const setPresetRange = (range: { from: Date; to: Date }) => {
    const fromStr = format(range.from, "yyyy-MM-dd");
    const toStr = format(range.to, "yyyy-MM-dd");
    setFrom(fromStr);
    setTo(toStr);
    applyFilters({ from: fromStr, to: toStr });
  };

  const resetToThisMonth = () => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    setPresetRange({ from: start, to: end });
  };

  const exportBaseParams = buildQueryString({
    from: toDateInput(report.filters.from),
    to: toDateInput(report.filters.to),
    includeVoided: report.filters.includeVoided,
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Audit &amp; reports</h1>
          <p className="text-sm text-muted-foreground">
            Audit invoices and payments by date range with CSV exports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

            <AuditFilters
              from={from}
              to={to}
              includeVoided={includeVoided}
              onFromChange={setFrom}
              onToChange={setTo}
              onIncludeVoidedChange={setIncludeVoided}
              onApply={() => applyFilters({})}
              onReset={resetToThisMonth}
              isPending={isPending}
            />

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Sales
          </TabsTrigger>
          <TabsTrigger value="cash" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Cash received
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="space-y-4">
          <Card className="border bg-card shadow-sm">
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <SummaryCard label="Total sales" value={formatCurrencyFromCents(report.sales.summary.totalSalesCents)} icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
              <SummaryCard
                label="Enrolment sales"
                value={formatCurrencyFromCents(report.sales.summary.enrolmentTotals.totalAmountCents)}
                icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
                helper={`${report.sales.summary.enrolmentTotals.totalQuantity} items`}
              />
              <SummaryCard
                label="Invoices"
                value={`${report.sales.invoices.length}`}
                icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
                helper="within selected range"
              />
            </CardContent>
          </Card>

          <SalesReport report={report.sales} exportQuery={exportBaseParams} />
        </TabsContent>
        <TabsContent value="cash" className="space-y-4">
          <Card className="border bg-card shadow-sm">
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <SummaryCard label="Total received" value={formatCurrencyFromCents(report.cash.summary.totalReceivedCents)} icon={<Wallet className="h-4 w-4 text-muted-foreground" />} />
              <SummaryCard label="Allocated" value={formatCurrencyFromCents(report.cash.summary.allocatedCents)} icon={<FileText className="h-4 w-4 text-muted-foreground" />} />
              <SummaryCard label="Unallocated" value={formatCurrencyFromCents(report.cash.summary.unallocatedCents)} icon={<Loader2 className="h-4 w-4 text-muted-foreground" />} />
            </CardContent>
          </Card>

          <CashReport report={report.cash} exportQuery={exportBaseParams} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      {helper ? <div className="text-xs text-muted-foreground">{helper}</div> : null}
    </div>
  );
}
