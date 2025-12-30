"use client";

import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal } from "lucide-react";

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

import type { AuditPayment, CashSummary } from "@/server/reports/getAuditReport";

import ExportButtons from "./ExportButtons";

export default function CashReport({
  report,
  exportQuery,
}: {
  report: { summary: CashSummary; payments: AuditPayment[] };
  exportQuery: string;
}) {
  const [selectedPayment, setSelectedPayment] = React.useState<AuditPayment | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Cash received</h2>
          <p className="text-sm text-muted-foreground">Payments within the selected window.</p>
        </div>
        <ExportButtons
          exportQuery={exportQuery}
          links={[
            { label: "Export payments", href: "/api/admin/reports/audit/payments" },
            { label: "Export allocations", href: "/api/admin/reports/audit/payment-allocations" },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">By method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {report.summary.byMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              report.summary.byMethod.map((row) => (
                <div key={row.method} className="flex items-center justify-between">
                  <span className="font-medium">{row.method}</span>
                  <span className="font-semibold">{formatCurrencyFromCents(row.amountCents)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Allocated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>Total allocated</span>
              <span className="font-semibold">{formatCurrencyFromCents(report.summary.allocatedCents)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Unallocated</span>
              <span
                className={cn(
                  "font-semibold",
                  report.summary.unallocatedCents > 0 ? "text-destructive" : ""
                )}
              >
                {formatCurrencyFromCents(report.summary.unallocatedCents)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>Count</span>
              <span className="font-semibold">{report.payments.length}</span>
            </div>
            <div className="text-xs text-muted-foreground">Allocated vs unallocated per payment shown below.</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Payments</h3>
            <p className="text-xs text-muted-foreground">Paid within your selected date range.</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-y bg-muted/40 text-xs font-medium uppercase text-muted-foreground">
              <TableHead className="w-[140px]">Paid</TableHead>
              <TableHead>Family</TableHead>
              <TableHead className="w-[140px]">Method</TableHead>
              <TableHead className="w-[140px] text-right">Amount</TableHead>
              <TableHead className="w-[140px] text-right">Allocated</TableHead>
              <TableHead className="w-[140px] text-right">Unallocated</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-sm text-muted-foreground">
                  No payments in this range.
                </TableCell>
              </TableRow>
            ) : (
              report.payments.map((payment) => (
                <TableRow key={payment.id} className="hover:bg-muted/40">
                  <TableCell className="w-[140px]">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{format(payment.paidAt, "d MMM yyyy")}</div>
                      <div className="text-xs text-muted-foreground">#{payment.id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{payment.familyName}</div>
                    <div className="text-xs text-muted-foreground">{payment.method ?? "Unknown"}</div>
                  </TableCell>
                  <TableCell>{payment.method ?? "Unknown"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrencyFromCents(payment.amountCents)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrencyFromCents(payment.allocatedCents)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      payment.unallocatedCents > 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {formatCurrencyFromCents(payment.unallocatedCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedPayment(payment)} aria-label="View allocations">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaymentSheet payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
    </div>
  );
}

function PaymentSheet({ payment, onClose }: { payment: AuditPayment | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(payment)} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Payment {payment?.id}</SheetTitle>
          <SheetDescription>
            {payment ? `${format(payment.paidAt, "PPP")} — ${payment.familyName}` : "Payment details"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Amount</span>
            <span className="font-semibold text-foreground">
              {payment ? formatCurrencyFromCents(payment.amountCents) : ""}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Allocated</span>
            <span className="font-semibold text-foreground">
              {payment ? formatCurrencyFromCents(payment.allocatedCents) : ""}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Unallocated</span>
            <span
              className={cn(
                "font-semibold",
                payment && payment.unallocatedCents > 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {payment ? formatCurrencyFromCents(payment.unallocatedCents) : ""}
            </span>
          </div>

          <div className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="w-[140px] text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment?.allocations.map((alloc) => (
                  <TableRow key={`${alloc.paymentId}-${alloc.invoiceId}`}>
                    <TableCell>
                      <div className="text-sm font-medium">{alloc.invoiceFamilyName}</div>
                      <div className="text-xs text-muted-foreground">
                        #{alloc.invoiceId} • {alloc.invoiceIssuedAt ? format(alloc.invoiceIssuedAt, "d MMM yyyy") : "No issue date"}
                      </div>
                      <Badge variant="outline" className="mt-1">
                        {alloc.invoiceStatus.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrencyFromCents(alloc.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
                {payment?.allocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      No allocations.
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
