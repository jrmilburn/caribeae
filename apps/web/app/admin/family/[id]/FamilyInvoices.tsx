"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrencyFromCents } from "@/lib/currency";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";
import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { resolveInvoiceDisplayStatus } from "./invoiceDisplay";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { undoPayment } from "@/server/billing/undoPayment";
import { Loader2, MoreHorizontal } from "lucide-react";

type BillingData = Awaited<ReturnType<typeof getFamilyBillingData>>;

type Props = {
  family: FamilyWithStudentsAndInvoices;
  billing: BillingData;
  billingPosition: FamilyBillingPosition;
  paymentSheetOpen?: boolean;
  onPaymentSheetChange?: (open: boolean) => void;
};

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

function invoiceVariant(status: string) {
  switch (status) {
    case "OVERDUE":
      return "destructive";
    case "PAID":
      return "default";
    case "PARTIALLY_PAID":
      return "secondary";
    case "SENT":
    case "DRAFT":
    default:
      return "secondary";
  }
}

function statusDotClass(status: string) {
  if (status === "OVERDUE") return "bg-destructive";
  if (status === "PARTIALLY_PAID") return "bg-amber-500";
  if (status === "PAID") return "bg-muted-foreground/40";
  return "bg-emerald-500";
}

function getInvoiceBalanceCents(invoice: { amountCents: number; amountPaidCents: number }) {
  return Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
}

type InvoiceAllocationItem = {
  paymentId: string;
  paidAt: Date | null;
  method?: string | null;
  note?: string | null;
  amountCents: number;
};

export default function FamilyInvoices({ family, billing, billingPosition, paymentSheetOpen, onPaymentSheetChange }: Props) {

  const router = useRouter();

  // --- Open invoices (for payment allocation sheet + summary) ---
  const openInvoices = billing.openInvoices.map((invoice) => ({
    ...invoice,
    balanceCents: getInvoiceBalanceCents(invoice),
  }));

  const totalOwingCents = billingPosition.outstandingCents;

  const nextDue = [...openInvoices]
    .filter((i) => i.balanceCents > 0)
    .sort((a, b) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      // overdue first, then by due date
      if (a.status === "OVERDUE" && b.status !== "OVERDUE") return -1;
      if (b.status === "OVERDUE" && a.status !== "OVERDUE") return 1;
      return ad - bd;
    })[0];

  // --- Map allocations -> per-invoice (to show payments under each invoice) ---
  const allocationsByInvoiceId = React.useMemo(() => {
    const map = new Map<string, InvoiceAllocationItem[]>();

    for (const payment of billing.payments ?? []) {
      for (const allocation of payment.allocations ?? []) {
        const arr = map.get(allocation.invoiceId) ?? [];
        arr.push({
          paymentId: payment.id,
          paidAt: payment.paidAt ?? null,
          method: payment.method ?? null,
          note: payment.note ?? null,
          amountCents: allocation.amountCents,
        });
        map.set(allocation.invoiceId, arr);
      }
    }

    // newest allocations first
    for (const [key, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ad = a.paidAt ? new Date(a.paidAt).getTime() : 0;
        const bd = b.paidAt ? new Date(b.paidAt).getTime() : 0;
        return bd - ad;
      });
      map.set(key, arr);
    }

    return map;
  }, [billing.payments]);

  // --- Sort invoices: open first (overdue first), then by due, then paid by issued desc ---
  const invoicesSorted = React.useMemo(() => {
    const all = [...family.invoices];

    return all.sort((a, b) => {
      const aBal = getInvoiceBalanceCents(a);
      const bBal = getInvoiceBalanceCents(b);
      const aStatus = a.status;
      const bStatus = b.status;

      // open first
      const aIsOpen = aBal > 0 && aStatus !== "PAID";
      const bIsOpen = bBal > 0 && bStatus !== "PAID";
      if (aIsOpen && !bIsOpen) return -1;
      if (bIsOpen && !aIsOpen) return 1;

      // overdue first within open
      if (aStatus === "OVERDUE" && bStatus !== "OVERDUE") return -1;
      if (bStatus === "OVERDUE" && aStatus !== "OVERDUE") return 1;

      // due date asc for open invoices
      const adue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bdue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (aIsOpen && bIsOpen && adue !== bdue) return adue - bdue;

      // otherwise issued desc
      const aiss = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
      const biss = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
      return biss - aiss;
    });
  }, [family.invoices]);

  const [undoingPaymentId, setUndoingPaymentId] = React.useState<string | null>(null);
  const [isUndoing, startUndo] = React.useTransition();

  const handleUndoPayment = (paymentId: string) => {
    const confirmed = window.confirm(
      "Undo this payment? Allocations and enrolment entitlements granted by it will be rolled back."
    );
    if (!confirmed) return;
    setUndoingPaymentId(paymentId);
    startUndo(async () => {
      try {
        await undoPayment(paymentId);
        toast.success("Payment undone and allocations removed.");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to undo payment.";
        toast.error(message);
      } finally {
        setUndoingPaymentId(null);
      }
    });
  };

  return (
    <Card className="border-l-0! border-r-0! shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Billing</CardTitle>
        </div>

        <div className="flex items-center gap-2">
          <PayAheadSheet familyId={family.id} />
          <RecordPaymentSheet
            familyId={family.id}
            enrolments={billingPosition.enrolments}
            openInvoices={openInvoices}
            open={paymentSheetOpen}
            onOpenChange={onPaymentSheetChange}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground">Total owing</div>
            <div className="mt-1 text-2xl font-semibold">
              {formatCurrencyFromCents(totalOwingCents)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Based on unpaid blocks since paid-through dates
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground">Open invoices</div>
            <div className="mt-1 text-2xl font-semibold">{openInvoices.filter(i => i.balanceCents > 0).length}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {nextDue?.dueAt ? `Next payment due ${formatDate(nextDue.dueAt)}` : "No upcoming payment due date"}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground">Next payment due</div>
            <div className="mt-1 text-lg font-semibold">
              {nextDue?.dueAt ? formatDate(nextDue.dueAt) : "—"}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {nextDue ? (
                <>
                  <span className={cn("h-2.5 w-2.5 rounded-full", statusDotClass(nextDue.status))} />
                  <span>{nextDue.status}</span>
                  <span>•</span>
                  <span>{formatCurrencyFromCents(nextDue.balanceCents)} balance</span>
                </>
              ) : (
                "No open invoices"
              )}
            </div>
          </div>
        </div>

        {/* Invoice list with payments nested */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Invoices</h3>
            <span className="text-xs text-muted-foreground">
              Expand an invoice to view applied payments.
            </span>
          </div>

          {invoicesSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices for this family yet.</p>
          ) : (
            <div className="rounded-lg border">
              <Accordion type="multiple" className="divide-y">
                {invoicesSorted.map((invoice) => {
                  const balanceCents = getInvoiceBalanceCents(invoice);
                  const displayStatus = resolveInvoiceDisplayStatus(invoice.status);
                  const displayPaidCents = invoice.amountPaidCents;
                  const displayBalanceCents = balanceCents;
                  const allocations = allocationsByInvoiceId.get(invoice.id) ?? [];

                  const coverageLabel =
                    invoice.coverageStart && invoice.coverageEnd
                      ? `${formatDate(invoice.coverageStart)} → ${formatDate(invoice.coverageEnd)}`
                      : invoice.creditsPurchased
                        ? `${invoice.creditsPurchased} credits`
                        : "—";

                  return (
                    <AccordionItem key={invoice.id} value={invoice.id} className="px-3">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex w-full flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <span
                              className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", statusDotClass(displayStatus))}
                              aria-hidden
                            />
                            <div className="space-y-1 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">Invoice {invoice.id}</span>
                                <Badge variant={invoiceVariant(displayStatus)}>{displayStatus}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  Issued {formatDate(invoice.issuedAt)}
                                </span>
                                {invoice.dueAt ? (
                                  <span className="text-xs text-muted-foreground">
                                    • Due {formatDate(invoice.dueAt)}
                                  </span>
                                ) : null}
                              </div>

                              <div className="text-xs text-muted-foreground">
                                {invoice.enrolment?.plan?.name ? (
                                  <span className="truncate">{invoice.enrolment.plan.name}</span>
                                ) : (
                                  <span>Enrolment</span>
                                )}
                                <span className="mx-2">•</span>
                                <span>{coverageLabel}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-left sm:text-right">
                            <div>
                              <div className="text-[11px] text-muted-foreground">Amount</div>
                              <div className="text-sm font-medium">
                                {formatCurrencyFromCents(invoice.amountCents)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] text-muted-foreground">Paid</div>
                              <div className="text-sm">
                                {formatCurrencyFromCents(displayPaidCents)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] text-muted-foreground">Balance</div>
                              <div
                                className={cn(
                                  "text-sm font-semibold",
                                  displayBalanceCents > 0 && displayStatus !== "PAID" && "text-foreground"
                                )}
                              >
                                {formatCurrencyFromCents(displayBalanceCents)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pb-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">Printable receipt</div>
                            <PrintReceiptButton
                              href={`/admin/invoice/${invoice.id}/receipt`}
                              label="Print invoice receipt"
                              size="sm"
                            />
                          </div>
                          {/* Line items */}
                          <div className="rounded-lg border bg-muted/10 p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-semibold">Line items</div>
                              <div className="text-xs text-muted-foreground">Totals derive from items</div>
                            </div>
                            {invoice.lineItems?.length ? (
                              <Table className="mt-2">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Kind</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {invoice.lineItems.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="text-sm">{item.description}</TableCell>
                                      <TableCell className="text-sm">{item.quantity}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{item.kind}</TableCell>
                                      <TableCell className="text-right font-medium">
                                        {formatCurrencyFromCents(item.amountCents)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">No line items recorded.</p>
                            )}
                          </div>

                          {/* Payments applied to this invoice */}
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-semibold">Payments applied</div>
                              <div className="text-xs text-muted-foreground">
                                {allocations.length ? `${allocations.length} allocation(s)` : "None yet"}
                              </div>
                            </div>

                            {allocations.length === 0 ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                No payments have been allocated to this invoice.
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {allocations.map((a) => (
                                  <div
                                    key={`${invoice.id}-${a.paymentId}-${a.amountCents}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">Payment {a.paymentId}</Badge>
                                      <span className="text-muted-foreground">{formatDate(a.paidAt)}</span>
                                      {a.method ? (
                                        <>
                                          <span className="text-muted-foreground">•</span>
                                          <span className="text-muted-foreground">{a.method}</span>
                                        </>
                                      ) : null}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold">
                                        {formatCurrencyFromCents(a.amountCents)}
                                      </span>
                                      <PrintReceiptButton
                                        href={`/admin/payment/${a.paymentId}/receipt`}
                                        label="Payment receipt"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                      />
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            aria-label="Payment actions"
                                            disabled={isUndoing && undoingPaymentId === a.paymentId}
                                          >
                                            {isUndoing && undoingPaymentId === a.paymentId ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <MoreHorizontal className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onSelect={(e) => {
                                              e.preventDefault();
                                              handleUndoPayment(a.paymentId);
                                            }}
                                          >
                                            Undo payment
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>

                                    {a.note ? (
                                      <div className="w-full text-muted-foreground">{a.note}</div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Small meta row */}
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Meta label="Issued" value={formatDate(invoice.issuedAt)} />
                            <Meta label="Due" value={formatDate(invoice.dueAt)} />
                            <Meta label="Coverage" value={coverageLabel} />
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          )}
        </section>

        {/* Optional: keep a compact “Recent payments” list if you still want it */}
        {billing.payments?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Recent payments</h3>
            <div className="space-y-2">
              {billing.payments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatCurrencyFromCents(payment.amountCents)}</span>
                      <Badge variant="secondary">{formatDate(payment.paidAt)}</Badge>
                      {payment.method ? (
                        <span className="text-xs text-muted-foreground">{payment.method}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">ID: {payment.id}</span>
                      <PrintReceiptButton
                        href={`/admin/payment/${payment.id}/receipt`}
                        label="Print receipt"
                        size="sm"
                        className="h-8 px-2 text-xs"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Payment actions"
                            disabled={isUndoing && undoingPaymentId === payment.id}
                          >
                            {isUndoing && undoingPaymentId === payment.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(e) => {
                              e.preventDefault();
                              handleUndoPayment(payment.id);
                            }}
                          >
                            Undo payment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {payment.note ? (
                    <p className="mt-1 text-xs text-muted-foreground">{payment.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
