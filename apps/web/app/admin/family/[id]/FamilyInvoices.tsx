"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { centsToDollarString, dollarsToCents, formatCurrencyFromCents } from "@/lib/currency";
import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import { recordFamilyPayment } from "@/server/billing/recordFamilyPayment";

type BillingData = Awaited<ReturnType<typeof getFamilyBillingData>>;

type Props = {
  family: FamilyWithStudentsAndInvoices;
  billing: BillingData;
};

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

export default function FamilyInvoices({ family, billing }: Props) {
  const latestPaidThrough = family.students
    .flatMap((s) => s.enrolments ?? [])
    .map((e) => e.paidThroughDate)
    .filter(Boolean) as Date[];
  const latestPaidThroughDate = latestPaidThrough.length
    ? latestPaidThrough.reduce((acc, curr) => (acc && acc > curr ? acc : curr))
    : null;

  const openInvoices = billing.openInvoices.map((invoice) => ({
    ...invoice,
    balanceCents: Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Billing</CardTitle>
          <p className="text-sm text-muted-foreground">
            {latestPaidThroughDate
              ? `Paid through ${formatDate(latestPaidThroughDate)}`
              : "Manage invoices and payments."}
          </p>
        </div>
        <RecordPaymentSheet familyId={family.id} openInvoices={openInvoices} />
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Open invoices</h3>
            <span className="text-xs text-muted-foreground">Balances shown in dollars.</span>
          </div>

          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open invoices for this family.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="w-10">
                        <StatusDot status={invoice.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoice.status === "OVERDUE" ? "destructive" : "secondary"}>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrencyFromCents(invoice.amountCents)}
                      </TableCell>
                      <TableCell>{formatCurrencyFromCents(invoice.amountPaidCents)}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrencyFromCents(invoice.balanceCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Recent payments</h3>
          {billing.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {billing.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border bg-muted/40 p-4 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {formatCurrencyFromCents(payment.amountCents)}
                      </span>
                      <Badge variant="secondary">{formatDate(payment.paidAt)}</Badge>
                      {payment.method ? (
                        <span className="text-xs text-muted-foreground">{payment.method}</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">ID: {payment.id}</span>
                  </div>
                  {payment.note ? (
                    <p className="mt-2 text-xs text-muted-foreground">{payment.note}</p>
                  ) : null}
                  {payment.allocations.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {payment.allocations.map((allocation) => (
                        <div
                          key={allocation.invoiceId}
                          className="flex items-center justify-between rounded border bg-background px-3 py-1 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Invoice {allocation.invoiceId}</Badge>
                            <span className="text-muted-foreground">
                              {formatDate(allocation.invoice.issuedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {formatCurrencyFromCents(allocation.amountCents)}
                            </span>
                            <Badge variant="secondary">{allocation.invoice.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">All invoices</h3>
          {family.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices for this family yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Enrolment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {family.invoices.map((invoice) => {
                    const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                        <TableCell>
                          <Badge variant={invoice.status === "PAID" ? "default" : "secondary"}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrencyFromCents(invoice.amountCents)}
                        </TableCell>
                        <TableCell>{formatCurrencyFromCents(invoice.amountPaidCents)}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrencyFromCents(balance)}
                        </TableCell>
                        <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                        <TableCell>
                          {invoice.coverageStart && invoice.coverageEnd
                            ? `${formatDate(invoice.coverageStart)} → ${formatDate(invoice.coverageEnd)}`
                            : invoice.creditsPurchased
                              ? `${invoice.creditsPurchased} credits`
                              : "—"}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {invoice.enrolment?.plan?.name ?? "Enrolment"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function RecordPaymentSheet({
  familyId,
  openInvoices,
}: {
  familyId: string;
  openInvoices: Array<
    BillingData["openInvoices"][number] & {
      balanceCents: number;
    }
  >;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [allocations, setAllocations] = React.useState<Record<string, string>>({});
  const [method, setMethod] = React.useState("Cash");
  const [note, setNote] = React.useState("");
  const [paidDate, setPaidDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isSubmitting, startSubmit] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    const invoiceIds = openInvoices.filter((inv) => inv.balanceCents > 0).map((inv) => inv.id);
    setSelected(invoiceIds);
    setAllocations(
      invoiceIds.reduce<Record<string, string>>((acc, invoiceId) => {
        const invoice = openInvoices.find((inv) => inv.id === invoiceId);
        if (!invoice) return acc;
        acc[invoiceId] = centsToDollarString(invoice.balanceCents);
        return acc;
      }, {})
    );
    setMethod("Cash");
    setNote("");
    setPaidDate(new Date().toISOString().slice(0, 10));
  }, [open, openInvoices]);

  React.useEffect(() => {
    if (!open) return;
    setAllocations((prev) => {
      const next: Record<string, string> = {};
      selected.forEach((invoiceId) => {
        if (prev[invoiceId] != null) {
          next[invoiceId] = prev[invoiceId];
          return;
        }
        const invoice = openInvoices.find((inv) => inv.id === invoiceId);
        next[invoiceId] = invoice ? centsToDollarString(invoice.balanceCents) : "0.00";
      });
      return next;
    });
  }, [selected, open, openInvoices]);

  const selectedInvoices = openInvoices.filter((inv) => selected.includes(inv.id));
  const allocationCents = selectedInvoices.map((inv) => ({
    invoiceId: inv.id,
    cents: dollarsToCents(allocations[inv.id] ?? "0"),
  }));
  const totalCents = allocationCents.reduce((sum, a) => sum + a.cents, 0);

  const toggleSelection = (invoiceId: string) => {
    setSelected((prev) =>
      prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const allocationsPayload = allocationCents.filter((a) => a.cents > 0);
    if (allocationsPayload.length === 0 || totalCents <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }

    const exceedsBalance = allocationCents.some((allocation) => {
      const invoice = selectedInvoices.find((inv) => inv.id === allocation.invoiceId);
      return invoice ? allocation.cents > invoice.balanceCents : false;
    });
    if (exceedsBalance) {
      toast.error("Allocation cannot exceed the invoice balance.");
      return;
    }

    const paidAtDate = paidDate ? new Date(paidDate) : new Date();

    startSubmit(async () => {
      try {
        await recordFamilyPayment({
          familyId,
          amountCents: totalCents,
          paidAt: paidAtDate,
          method: method.trim() || undefined,
          note: note.trim() || undefined,
          allocations: allocationsPayload.map((a) => ({
            invoiceId: a.invoiceId,
            amountCents: a.cents,
          })),
        });
        toast.success("Payment recorded.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record payment.";
        toast.error(message);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" disabled={openInvoices.length === 0}>
          Record payment
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Record payment</SheetTitle>
          <SheetDescription>
            Allocate the payment across selected invoices. Amounts are in dollars.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Allocate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      No open invoices to allocate.
                    </TableCell>
                  </TableRow>
                ) : (
                  openInvoices.map((invoice) => {
                    const balance = invoice.balanceCents;
                    const allocationValue = allocations[invoice.id] ?? "";
                    return (
                      <TableRow key={invoice.id} className={cn(!selected.includes(invoice.id) && "opacity-60")}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-muted-foreground/50"
                            checked={selected.includes(invoice.id)}
                            onChange={() => toggleSelection(invoice.id)}
                            aria-label={`Select invoice ${invoice.id}`}
                          />
                        </TableCell>
                        <TableCell className="space-y-1">
                          <div className="text-sm font-medium">Invoice {invoice.id}</div>
                          <div className="text-xs text-muted-foreground">
                            Due {formatDate(invoice.dueAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {formatCurrencyFromCents(balance)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={allocationValue}
                            onChange={(e) =>
                              setAllocations((prev) => ({
                                ...prev,
                                [invoice.id]: e.target.value,
                              }))
                            }
                            disabled={!selected.includes(invoice.id)}
                            className="w-28 text-right"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Input
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Cash, Card, Bank transfer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidAt">Paid on</Label>
              <Input
                id="paidAt"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any admin notes"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
            <div className="text-sm text-muted-foreground">Total payment</div>
            <div className="text-lg font-semibold">{formatCurrencyFromCents(totalCents)}</div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || totalCents <= 0}>
              {isSubmitting ? "Recording..." : "Record payment"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "OVERDUE"
      ? "bg-destructive"
      : status === "PARTIALLY_PAID"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} aria-hidden />;
}
