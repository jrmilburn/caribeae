"use client";

import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import type { InvoiceStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";

import type { AuditInvoice, SalesSummary } from "@/server/reports/getAuditReport";

import ExportButtons from "./ExportButtons";

export default function SalesReport({
  report,
  exportQuery,
}: {
  report: { summary: SalesSummary; invoices: AuditInvoice[] };
  exportQuery: string;
}) {
  const [selectedInvoice, setSelectedInvoice] = React.useState<AuditInvoice | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Sales (Invoices issued)</h2>
          <p className="text-sm text-muted-foreground">Line-item totals drive all numbers below.</p>
        </div>
        <ExportButtons
          exportQuery={exportQuery}
          links={[
            { label: "Export sales summary", href: "/api/admin/reports/audit/sales-summary" },
            { label: "Export invoice line items", href: "/api/admin/reports/audit/invoice-line-items" },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Totals by kind</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.summary.totalsByKind.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices in this range.</p>
            ) : (
              report.summary.totalsByKind.map((row) => (
                <div key={row.kind} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.kind}</span>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrencyFromCents(row.amountCents)}</div>
                    <div className="text-xs text-muted-foreground">{row.quantity} items</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Top products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.summary.totalsByProduct.length === 0 ? (
              <p className="text-sm text-muted-foreground">No product sales yet.</p>
            ) : (
              report.summary.totalsByProduct.map((row) => (
                <div key={row.productId} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.productName}</div>
                    <div className="text-xs text-muted-foreground">{row.quantity} sold</div>
                  </div>
                  <div className="font-semibold">{formatCurrencyFromCents(row.amountCents)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Enrolment totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">
                {formatCurrencyFromCents(report.summary.enrolmentTotals.totalAmountCents)}
              </span>
            </div>
            {report.summary.enrolmentTotals.byLevel.length > 0 ? (
              <div className="space-y-1">
                {report.summary.enrolmentTotals.byLevel.map((level) => (
                  <div key={level.levelId} className="flex items-center justify-between">
                    <span>{level.levelName}</span>
                    <span className="text-sm font-semibold">
                      {formatCurrencyFromCents(level.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No enrolment items.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Invoices</h3>
            <p className="text-xs text-muted-foreground">Issued within your selected date range.</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-y bg-muted/40 text-xs font-medium uppercase text-muted-foreground">
              <TableHead className="w-[150px]">Issued</TableHead>
              <TableHead>Family</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[140px] text-right">Total</TableHead>
              <TableHead className="w-[140px] text-right">Paid</TableHead>
              <TableHead className="w-[140px] text-right">Owing</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-sm text-muted-foreground">
                  No invoices issued in this range.
                </TableCell>
              </TableRow>
            ) : (
              report.invoices.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-muted/40">
                  <TableCell className="w-[150px]">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">
                        {invoice.issuedAt ? format(invoice.issuedAt, "d MMM yyyy") : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">#{invoice.id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{invoice.familyName}</div>
                    <div className="text-xs text-muted-foreground">{invoice.lineItems.length} items</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(invoice.status)} className="rounded-full">
                      {invoice.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrencyFromCents(invoice.totalCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFromCents(invoice.amountPaidCents)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      invoice.amountOwingCents > 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {formatCurrencyFromCents(invoice.amountOwingCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedInvoice(invoice)} aria-label="View line items">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InvoiceSheet invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
    </div>
  );
}

function InvoiceSheet({ invoice, onClose }: { invoice: AuditInvoice | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(invoice)} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Invoice {invoice?.id}</SheetTitle>
          <SheetDescription>
            {invoice?.issuedAt ? format(invoice.issuedAt, "PPP") : "No issue date"} — {invoice?.familyName}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Status</span>
            {invoice ? (
              <Badge variant={statusVariant(invoice.status)} className="rounded-full">
                {invoice.status.replace(/_/g, " ").toLowerCase()}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total</span>
            <span className="font-semibold text-foreground">
              {invoice ? formatCurrencyFromCents(invoice.totalCents) : ""}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Paid</span>
            <span className="font-semibold text-foreground">
              {invoice ? formatCurrencyFromCents(invoice.amountPaidCents) : ""}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Owing</span>
            <span
              className={cn(
                "font-semibold",
                invoice && invoice.amountOwingCents > 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {invoice ? formatCurrencyFromCents(invoice.amountOwingCents) : ""}
            </span>
          </div>

          <div className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[140px] text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice?.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{item.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.kind} • Qty {item.quantity}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrencyFromCents(item.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
                {invoice?.lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      No line items.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function statusVariant(status: InvoiceStatus) {
  switch (status) {
    case "OVERDUE":
      return "destructive" as const;
    case "PAID":
      return "secondary" as const;
    case "PARTIALLY_PAID":
      return "outline" as const;
    case "SENT":
      return "secondary" as const;
    case "VOID":
      return "ghost" as const;
    case "DRAFT":
    default:
      return "default" as const;
  }
}
