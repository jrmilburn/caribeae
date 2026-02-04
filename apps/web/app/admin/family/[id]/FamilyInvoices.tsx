"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InvoiceStatus } from "@prisma/client";
import { Loader2, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";

import { InvoiceForm } from "@/app/admin/billing/components/InvoiceForm";
import { PaymentForm } from "@/app/admin/billing/components/PaymentForm";
import { CatchUpPaymentDialog } from "./CatchUpPaymentDialog";
import { resolveInvoiceDisplayStatus } from "./invoiceDisplay";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import type { BillingInvoice, BillingPayment } from "@/server/billing/types";
import { createInvoice } from "@/server/billing/createInvoice";
import { updateInvoice } from "@/server/billing/updateInvoice";
import { deleteInvoice } from "@/server/billing/deleteInvoice";
import { createPayment } from "@/server/billing/createPayment";
import { updatePayment } from "@/server/billing/updatePayment";
import { deletePayment } from "@/server/billing/deletePayment";
import { undoPayment } from "@/server/billing/undoPayment";

type BillingData = Awaited<ReturnType<typeof getFamilyBillingData>>;

type Props = {
  family: FamilyWithStudentsAndInvoices;
  billing: BillingData;
  billingPosition: FamilyBillingPosition;
  onOpenPayment?: () => void;
  onOpenPayAhead?: () => void;
  onUpdated?: () => void;
};

type InvoiceRow = FamilyWithStudentsAndInvoices["invoices"][number] & { amountOwingCents: number };

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

function invoiceVariant(status: string) {
  switch (status) {
    case "OVERDUE":
      return "destructive";
    case "PAID":
      return "secondary";
    case "PARTIALLY_PAID":
      return "outline";
    case "SENT":
      return "secondary";
    case "DRAFT":
    default:
      return "default";
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

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeInvoicePayloadForServer(payload: any) {
  return {
    ...payload,
    issuedAt: nullToUndefined(payload.issuedAt),
    dueAt: nullToUndefined(payload.dueAt),
    coverageStart: nullToUndefined(payload.coverageStart),
    coverageEnd: nullToUndefined(payload.coverageEnd),
    creditsPurchased: nullToUndefined(payload.creditsPurchased),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineItems: (payload.lineItems ?? []).map((li: any) => {
      const quantity = li.quantity ?? 1;
      const unitPriceCents =
        li.unitPriceCents ??
        (li.amountCents != null ? Math.round(li.amountCents / quantity) : 0);
      return {
        ...li,
        quantity,
        unitPriceCents,
      };
    }),
  };
}

function resolveCoverageLabel(invoice: FamilyWithStudentsAndInvoices["invoices"][number]) {
  if (invoice.coverageStart && invoice.coverageEnd) {
    return `${formatDate(invoice.coverageStart)} → ${formatDate(invoice.coverageEnd)}`;
  }
  if (invoice.creditsPurchased) {
    return `${invoice.creditsPurchased} credits`;
  }
  return "—";
}

export default function FamilyInvoices({
  family,
  billing,
  billingPosition,
  onOpenPayment,
  onOpenPayAhead,
  onUpdated,
}: Props) {
  const router = useRouter();

  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [editingInvoice, setEditingInvoice] = React.useState<InvoiceRow | null>(null);
  const [invoiceDetailOpen, setInvoiceDetailOpen] = React.useState(false);
  const [selectedInvoice, setSelectedInvoice] = React.useState<InvoiceRow | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);
  const [editingPayment, setEditingPayment] = React.useState<BillingPayment | null>(null);

  const [undoingPaymentId, setUndoingPaymentId] = React.useState<string | null>(null);
  const [isUndoing, startUndo] = React.useTransition();

  const openInvoices = billing.openInvoices.map((invoice) => ({
    ...invoice,
    balanceCents: getInvoiceBalanceCents(invoice),
  }));

  const openInvoiceCount = openInvoices.filter((invoice) => invoice.balanceCents > 0).length;
  const nextDue = billingPosition.nextDueInvoice ?? null;

  const invoicesWithBalance = React.useMemo<InvoiceRow[]>(
    () =>
      family.invoices.map((invoice) => ({
        ...invoice,
        amountOwingCents: getInvoiceBalanceCents(invoice),
      })),
    [family.invoices]
  );

  const invoicesSorted = React.useMemo(() => {
    const all = [...invoicesWithBalance];
    return all.sort((a, b) => {
      const aBal = a.amountOwingCents;
      const bBal = b.amountOwingCents;
      const aStatus = a.status;
      const bStatus = b.status;
      const aIsOpen = aBal > 0 && aStatus !== "PAID";
      const bIsOpen = bBal > 0 && bStatus !== "PAID";
      if (aIsOpen && !bIsOpen) return -1;
      if (bIsOpen && !aIsOpen) return 1;
      if (aStatus === "OVERDUE" && bStatus !== "OVERDUE") return -1;
      if (bStatus === "OVERDUE" && aStatus !== "OVERDUE") return 1;
      const adue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bdue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (aIsOpen && bIsOpen && adue !== bdue) return adue - bdue;
      const aiss = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
      const biss = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
      return biss - aiss;
    });
  }, [invoicesWithBalance]);

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

  const handleRefresh = React.useCallback(() => {
    router.refresh();
    onUpdated?.();
  }, [onUpdated, router]);

  const handleCreateInvoice = () => {
    setEditingInvoice(null);
    setInvoiceModalOpen(true);
  };

  const handleEditInvoice = (invoice: InvoiceRow) => {
    setEditingInvoice(invoice);
    setInvoiceModalOpen(true);
  };

  const handleSaveInvoice: React.ComponentProps<typeof InvoiceForm>["onSubmit"] = async (payload) => {
    try {
      const normalized = normalizeInvoicePayloadForServer(payload);
      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, normalized);
        toast.success("Invoice updated.");
      } else {
        await createInvoice(normalized);
        toast.success("Invoice created.");
      }
      setEditingInvoice(null);
      setInvoiceModalOpen(false);
      handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save invoice.";
      toast.error(message);
    }
  };

  const handleDeleteInvoice = async (invoice: InvoiceRow) => {
    const ok = window.confirm("Delete this invoice? Payments will remain untouched.");
    if (!ok) return;
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted.");
      handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete invoice.";
      toast.error(message);
    }
  };

  const markInvoice = async (invoice: InvoiceRow, status: InvoiceStatus) => {
    try {
      await updateInvoice(invoice.id, {
        status,
        amountPaidCents: status === "PAID" ? invoice.amountCents : invoice.amountPaidCents,
        paidAt: status === "PAID" ? new Date() : undefined,
        issuedAt: invoice.issuedAt ?? new Date(),
        dueAt: invoice.dueAt ?? undefined,
      });
      toast.success(
        status === "PAID"
          ? "Invoice marked paid."
          : status === "VOID"
            ? "Invoice voided."
            : "Invoice marked sent."
      );
      handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update invoice.";
      toast.error(message);
    }
  };

  const handleOpenInvoiceDetail = (invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    setInvoiceDetailOpen(true);
  };

  const handleSavePayment: React.ComponentProps<typeof PaymentForm>["onSubmit"] = async (payload) => {
    try {
      const normalized: Parameters<typeof createPayment>[0] = {
        familyId: payload.familyId,
        amountCents: payload.amountCents,
        paidAt: nullToUndefined(payload.paidAt),
        method: nullToUndefined(payload.method),
        note: nullToUndefined(payload.note),
        allocations: payload.allocations,
      };

      if (payload.customBlockLength) {
        normalized.customBlockLength = payload.customBlockLength;
      }

      if (editingPayment) {
        await updatePayment(editingPayment.id, normalized);
        toast.success("Payment updated.");
      } else {
        normalized.enrolmentId = payload.enrolmentId;
        normalized.idempotencyKey = payload.idempotencyKey;
        await createPayment(normalized);
        toast.success("Payment recorded.");
      }

      setEditingPayment(null);
      setPaymentModalOpen(false);
      handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save payment.";
      toast.error(message);
    }
  };

  const handleDeletePayment = async (payment: BillingPayment) => {
    const ok = window.confirm("Delete this payment? Allocations will be removed.");
    if (!ok) return;
    try {
      await deletePayment(payment.id);
      toast.success("Payment deleted.");
      handleRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete payment.";
      toast.error(message);
    }
  };

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
        handleRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to undo payment.";
        toast.error(message);
      } finally {
        setUndoingPaymentId(null);
      }
    });
  };

  const selectedInvoiceAllocations = selectedInvoice
    ? allocationsByInvoiceId.get(selectedInvoice.id) ?? []
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Billing</div>
          <div className="text-xs text-muted-foreground">
            Invoices, payments, credits, and allocations.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenPayment ? (
            <Button size="sm" variant="secondary" onClick={onOpenPayment}>
              Take payment
            </Button>
          ) : null}
          {onOpenPayAhead ? (
            <Button size="sm" variant="outline" onClick={onOpenPayAhead}>
              Pay ahead
            </Button>
          ) : null}
          <Button size="sm" onClick={handleCreateInvoice}>
            New invoice
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                More actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <CatchUpPaymentDialog
                familyId={family.id}
                familyName={family.name}
                trigger={<DropdownMenuItem>Catch up payment</DropdownMenuItem>}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">Open invoices</div>
          <div className="mt-1 text-2xl font-semibold">{openInvoiceCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {nextDue?.dueAt ? `Next due ${formatDate(nextDue.dueAt)}` : "No upcoming due date"}
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">Next payment due</div>
          <div className="mt-1 text-2xl font-semibold">
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
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">Credits remaining</div>
          <div className="mt-1 text-2xl font-semibold">{billingPosition.creditsTotal}</div>
          <div className="mt-1 text-xs text-muted-foreground">Across active enrolments</div>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Invoices</h3>
          <span className="text-xs text-muted-foreground">
            Click an invoice to view details.
          </span>
        </div>

        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-[64px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-sm text-muted-foreground">
                    No invoices for this family yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoicesSorted.map((invoice) => {
                  const displayStatus = resolveInvoiceDisplayStatus(invoice.status);
                  return (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => handleOpenInvoiceDetail(invoice)}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">Invoice {invoice.id}</div>
                          <div className="text-xs text-muted-foreground">
                            {resolveCoverageLabel(invoice)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoiceVariant(displayStatus)}>{displayStatus}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                      <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrencyFromCents(invoice.amountCents)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold",
                          invoice.amountOwingCents > 0 ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {formatCurrencyFromCents(invoice.amountOwingCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <InvoiceActions
                          invoice={invoice}
                          onEdit={(row) => {
                            handleEditInvoice(row);
                          }}
                          onDelete={handleDeleteInvoice}
                          onMarkPaid={(row) => markInvoice(row, InvoiceStatus.PAID)}
                          onMarkSent={(row) => markInvoice(row, InvoiceStatus.SENT)}
                          onMarkVoid={(row) => markInvoice(row, InvoiceStatus.VOID)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Payments</h3>
          <span className="text-xs text-muted-foreground">Recent payments only.</span>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[64px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {billing.payments?.length ? (
                billing.payments.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => {
                      setEditingPayment(payment as BillingPayment);
                      setPaymentModalOpen(true);
                    }}
                  >
                    <TableCell className="font-medium">{formatDate(payment.paidAt)}</TableCell>
                    <TableCell>{payment.method ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {payment.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrencyFromCents(payment.amountCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PaymentActions
                        payment={payment as BillingPayment}
                        onEdit={(row) => {
                          setEditingPayment(row);
                          setPaymentModalOpen(true);
                        }}
                        onDelete={handleDeletePayment}
                        onUndo={handleUndoPayment}
                        undoingId={undoingPaymentId}
                        isUndoing={isUndoing}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-sm text-muted-foreground">
                    No payments yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <InvoiceForm
        open={invoiceModalOpen}
        onOpenChange={(open) => {
          setInvoiceModalOpen(open);
          if (!open) setEditingInvoice(null);
        }}
        invoice={editingInvoice as (BillingInvoice & { amountOwingCents: number }) | undefined}
        families={[{ id: family.id, name: family.name }]}
        statuses={Object.values(InvoiceStatus)}
        onSubmit={handleSaveInvoice}
        onDelete={editingInvoice ? () => handleDeleteInvoice(editingInvoice) : undefined}
      />

      <PaymentForm
        open={paymentModalOpen}
        onOpenChange={(open) => {
          setPaymentModalOpen(open);
          if (!open) setEditingPayment(null);
        }}
        payment={editingPayment}
        families={[{ id: family.id, name: family.name }]}
        onSubmit={handleSavePayment}
        onDelete={editingPayment ? () => handleDeletePayment(editingPayment) : undefined}
      />

      <Dialog
        open={invoiceDetailOpen}
        onOpenChange={(open) => {
          setInvoiceDetailOpen(open);
          if (!open) setSelectedInvoice(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice details</DialogTitle>
          </DialogHeader>
          {selectedInvoice ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Invoice {selectedInvoice.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {resolveCoverageLabel(selectedInvoice)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={invoiceVariant(selectedInvoice.status)}>
                      {selectedInvoice.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Issued {formatDate(selectedInvoice.issuedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PrintReceiptButton
                    href={`/admin/invoice/${selectedInvoice.id}/receipt`}
                    label="Print invoice receipt"
                    size="sm"
                    variant="outline"
                  />
                  <Button size="sm" onClick={() => handleEditInvoice(selectedInvoice)}>
                    Edit invoice
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Meta label="Issued" value={formatDate(selectedInvoice.issuedAt)} />
                <Meta label="Due" value={formatDate(selectedInvoice.dueAt)} />
                <Meta label="Coverage" value={resolveCoverageLabel(selectedInvoice)} />
              </div>

              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">Line items</div>
                  <div className="text-xs text-muted-foreground">Totals derive from items</div>
                </div>
                {selectedInvoice.lineItems?.length ? (
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
                      {selectedInvoice.lineItems.map((item) => (
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

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">Payments applied</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedInvoiceAllocations.length
                      ? `${selectedInvoiceAllocations.length} allocation(s)`
                      : "None yet"}
                  </div>
                </div>
                {selectedInvoiceAllocations.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No payments have been allocated to this invoice.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedInvoiceAllocations.map((allocation) => (
                      <div
                        key={`${selectedInvoice.id}-${allocation.paymentId}-${allocation.amountCents}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Payment {allocation.paymentId}</Badge>
                          <span className="text-muted-foreground">{formatDate(allocation.paidAt)}</span>
                          {allocation.method ? (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">{allocation.method}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {formatCurrencyFromCents(allocation.amountCents)}
                          </span>
                          <PrintReceiptButton
                            href={`/admin/payment/${allocation.paymentId}/receipt`}
                            label="Payment receipt"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                          />
                        </div>
                        {allocation.note ? (
                          <div className="w-full text-muted-foreground">{allocation.note}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
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

function InvoiceActions({
  invoice,
  onEdit,
  onDelete,
  onMarkSent,
  onMarkPaid,
  onMarkVoid,
}: {
  invoice: InvoiceRow;
  onEdit: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => Promise<void>;
  onMarkSent: (invoice: InvoiceRow) => Promise<void>;
  onMarkPaid: (invoice: InvoiceRow) => Promise<void>;
  onMarkVoid: (invoice: InvoiceRow) => Promise<void>;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  const handle = async (fn: (invoice: InvoiceRow) => Promise<void>, key: string) => {
    setPending(key);
    try {
      await fn(invoice);
    } finally {
      setPending(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Invoice actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Invoice</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onEdit(invoice);
          }}
        >
          View / Edit
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <PrintReceiptButton
            asChild
            href={`/admin/invoice/${invoice.id}/receipt`}
            label="Print receipt"
            className="w-full justify-start text-sm"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending === "sent"}
          onSelect={(event) => {
            event.preventDefault();
            handle(onMarkSent, "sent");
          }}
        >
          Mark sent
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === "paid"}
          onSelect={(event) => {
            event.preventDefault();
            handle(onMarkPaid, "paid");
          }}
        >
          Mark paid
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === "void"}
          onSelect={(event) => {
            event.preventDefault();
            handle(onMarkVoid, "void");
          }}
        >
          Void invoice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={pending === "delete"}
          onSelect={(event) => {
            event.preventDefault();
            handle(onDelete, "delete");
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaymentActions({
  payment,
  onEdit,
  onDelete,
  onUndo,
  undoingId,
  isUndoing,
}: {
  payment: BillingPayment;
  onEdit: (payment: BillingPayment) => void;
  onDelete: (payment: BillingPayment) => Promise<void>;
  onUndo: (paymentId: string) => void;
  undoingId: string | null;
  isUndoing: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Payment actions"
          onClick={(event) => event.stopPropagation()}
          disabled={isUndoing && undoingId === payment.id}
        >
          {isUndoing && undoingId === payment.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Payment</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onEdit(payment);
          }}
        >
          View / Edit
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <PrintReceiptButton
            asChild
            href={`/admin/payment/${payment.id}/receipt`}
            label="Print receipt"
            className="w-full justify-start text-sm"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            onUndo(payment.id);
          }}
        >
          Undo payment
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            onDelete(payment);
          }}
        >
          Delete payment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
