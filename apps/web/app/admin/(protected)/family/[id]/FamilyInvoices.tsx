"use client";

import * as React from "react";
import { format } from "date-fns";
import { InvoiceStatus } from "@prisma/client";
import {
  AlertCircle,
  FileText,
  MoreHorizontal,
  Receipt,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PendingDot } from "@/components/loading/LoadingSystem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import { formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";

import { InvoiceForm } from "@/app/admin/(protected)/billing/components/InvoiceForm";
import { PaymentForm } from "@/app/admin/(protected)/billing/components/PaymentForm";
import { CatchUpPaymentDialog } from "./CatchUpPaymentDialog";
import { resolveInvoiceDisplayStatus } from "./invoiceDisplay";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import type { BillingPayment } from "@/server/billing/types";
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

type BillingActivityItem = {
  id: string;
  kind: "invoice" | "payment";
  when: Date | null;
  title: string;
  description: string;
  amountLabel: string;
  detailLabel: string;
  statusLabel: string;
  tone: "danger" | "warning" | "success" | "muted" | "brand";
  invoice?: InvoiceRow;
  payment?: BillingPayment;
};

type InvoiceAllocationItem = {
  paymentId: string;
  paidAt: Date | null;
  method?: string | null;
  note?: string | null;
  amountCents: number;
};

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

function formatDateWithTime(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy · h:mm a");
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "OVERDUE":
      return "destructive" as const;
    case "PARTIALLY_PAID":
      return "outline" as const;
    case "PAID":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function toneClass(tone: BillingActivityItem["tone"]) {
  switch (tone) {
    case "danger":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    case "brand":
      return "bg-sky-500";
    default:
      return "bg-gray-400";
  }
}

function getInvoiceBalanceCents(invoice: { amountCents: number; amountPaidCents: number }) {
  return Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
}

function resolveCoverageLabel(invoice: FamilyWithStudentsAndInvoices["invoices"][number]) {
  if (invoice.coverageStart && invoice.coverageEnd) {
    return `${formatDate(invoice.coverageStart)} → ${formatDate(invoice.coverageEnd)}`;
  }
  if (invoice.creditsPurchased) {
    return `${invoice.creditsPurchased} credits`;
  }
  return "No coverage window";
}

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
    lineItems: (payload.lineItems ?? []).map((lineItem: any) => {
      const quantity = lineItem.quantity ?? 1;
      const unitPriceCents =
        lineItem.unitPriceCents ??
        (lineItem.amountCents != null ? Math.round(lineItem.amountCents / quantity) : 0);
      return {
        ...lineItem,
        quantity,
        unitPriceCents,
      };
    }),
  };
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

  const [invoiceFormOpen, setInvoiceFormOpen] = React.useState(false);
  const [editingInvoice, setEditingInvoice] = React.useState<InvoiceRow | null>(null);
  const [selectedInvoice, setSelectedInvoice] = React.useState<InvoiceRow | null>(null);

  const [paymentFormOpen, setPaymentFormOpen] = React.useState(false);
  const [editingPayment, setEditingPayment] = React.useState<BillingPayment | null>(null);
  const [selectedPayment, setSelectedPayment] = React.useState<BillingPayment | null>(null);

  const [undoingPaymentId, setUndoingPaymentId] = React.useState<string | null>(null);
  const [isUndoing, startUndo] = React.useTransition();

  const invoices = React.useMemo<InvoiceRow[]>(
    () =>
      family.invoices.map((invoice) => ({
        ...invoice,
        amountOwingCents: getInvoiceBalanceCents(invoice),
      })),
    [family.invoices]
  );

  const payments = React.useMemo(
    () => (billing.payments ?? []).map((payment) => payment as BillingPayment),
    [billing.payments]
  );

  const openInvoiceCount = React.useMemo(
    () => invoices.filter((invoice) => invoice.amountOwingCents > 0 && invoice.status !== "PAID").length,
    [invoices]
  );

  const nextDue = billingPosition.nextDueInvoice ?? null;

  const billingActivity = React.useMemo<BillingActivityItem[]>(() => {
    const invoiceItems = invoices.map((invoice) => {
      const displayStatus = resolveInvoiceDisplayStatus(invoice.status);
      const tone: BillingActivityItem["tone"] =
        displayStatus === "OVERDUE"
          ? "danger"
          : displayStatus === "PARTIALLY_PAID"
            ? "warning"
            : displayStatus === "PAID"
              ? "success"
              : "brand";

      return {
        id: `invoice-${invoice.id}`,
        kind: "invoice" as const,
        when: invoice.issuedAt ?? invoice.dueAt ?? null,
        title: `Invoice ${invoice.id}`,
        description: `${resolveCoverageLabel(invoice)}${invoice.dueAt ? ` · Due ${formatDate(invoice.dueAt)}` : ""}`,
        amountLabel: formatCurrencyFromCents(invoice.amountCents),
        detailLabel: `${formatCurrencyFromCents(invoice.amountOwingCents)} outstanding`,
        statusLabel: displayStatus,
        tone,
        invoice,
      };
    });

    const paymentItems = payments.map((payment) => {
      const status = payment.status ?? "RECORDED";
      const tone: BillingActivityItem["tone"] = status === "VOID" ? "warning" : "success";

      return {
        id: `payment-${payment.id}`,
        kind: "payment" as const,
        when: payment.paidAt ?? null,
        title: `Payment ${payment.id}`,
        description: `${payment.method ?? "Payment"}${payment.note ? ` · ${payment.note}` : ""}`,
        amountLabel: formatCurrencyFromCents(payment.amountCents),
        detailLabel: payment.allocations?.length
          ? `${payment.allocations.length} allocation${payment.allocations.length === 1 ? "" : "s"}`
          : "Unallocated",
        statusLabel: status,
        tone,
        payment,
      };
    });

    return [...invoiceItems, ...paymentItems].sort((a, b) => {
      const aTime = a.when ? a.when.getTime() : 0;
      const bTime = b.when ? b.when.getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
    });
  }, [invoices, payments]);

  const allocationsByInvoiceId = React.useMemo(() => {
    const map = new Map<string, InvoiceAllocationItem[]>();

    for (const payment of payments) {
      for (const allocation of payment.allocations ?? []) {
        const rows = map.get(allocation.invoiceId) ?? [];
        rows.push({
          paymentId: payment.id,
          paidAt: payment.paidAt ?? null,
          method: payment.method ?? null,
          note: payment.note ?? null,
          amountCents: allocation.amountCents,
        });
        map.set(allocation.invoiceId, rows);
      }
    }

    for (const [invoiceId, rows] of map.entries()) {
      rows.sort((a, b) => {
        const aDate = a.paidAt ? a.paidAt.getTime() : 0;
        const bDate = b.paidAt ? b.paidAt.getTime() : 0;
        return bDate - aDate;
      });
      map.set(invoiceId, rows);
    }

    return map;
  }, [payments]);

  const selectedInvoiceAllocations = selectedInvoice
    ? allocationsByInvoiceId.get(selectedInvoice.id) ?? []
    : [];

  const handleRefresh = React.useCallback(() => {
    router.refresh();
    onUpdated?.();
  }, [onUpdated, router]);

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
      setInvoiceFormOpen(false);
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save invoice.");
    }
  };

  const handleDeleteInvoice = async (invoice: InvoiceRow) => {
    const confirmed = window.confirm("Delete this invoice? Payments will remain untouched.");
    if (!confirmed) return;

    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted.");
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete invoice.");
    }
  };

  const handleMarkInvoice = async (invoice: InvoiceRow, status: InvoiceStatus) => {
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
      toast.error(error instanceof Error ? error.message : "Unable to update invoice.");
    }
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
      setPaymentFormOpen(false);
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save payment.");
    }
  };

  const handleDeletePayment = async (payment: BillingPayment) => {
    const confirmed = window.confirm("Delete this payment? Allocations will be removed.");
    if (!confirmed) return;

    try {
      await deletePayment(payment.id);
      toast.success("Payment deleted.");
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete payment.");
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
        toast.error(error instanceof Error ? error.message : "Unable to undo payment.");
      } finally {
        setUndoingPaymentId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Billing activity</h2>
              <p className="mt-1 text-sm text-gray-600">
                Combined invoice and payment timeline for this family.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenPayment ? (
                <Button size="sm" variant="secondary" onClick={onOpenPayment}>
                  Record payment
                </Button>
              ) : null}
              {onOpenPayAhead ? (
                <Button size="sm" variant="outline" onClick={onOpenPayAhead}>
                  Pay ahead
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={() => {
                  setEditingInvoice(null);
                  setInvoiceFormOpen(true);
                }}
              >
                Create invoice
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    More
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
        </div>

        <div className="grid gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4 sm:grid-cols-3">
          <SummaryStat
            label="Open invoices"
            value={String(openInvoiceCount)}
            detail={nextDue?.dueAt ? `Next due ${formatDate(nextDue.dueAt)}` : "No upcoming due date"}
          />
          <SummaryStat
            label="Current balance"
            value={formatCurrencyFromCents(billingPosition.outstandingCents)}
            detail={
              billingPosition.outstandingCents > 0
                ? "Outstanding amount"
                : "Account currently settled"
            }
            valueClassName={billingPosition.outstandingCents > 0 ? "text-red-700" : "text-emerald-700"}
          />
          <SummaryStat
            label="Credits remaining"
            value={String(billingPosition.creditsTotal)}
            detail="Across active enrolments"
          />
        </div>

        <div className="p-6">
          {billingActivity.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
              <p className="text-sm font-medium text-gray-900">No billing activity yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Create an invoice or record a payment to start this timeline.
              </p>
            </div>
          ) : (
            <div className="flow-root">
              <ul role="list" className="-mb-8">
                {billingActivity.map((item, itemIdx) => {
                  const isInvoice = item.kind === "invoice";
                  const icon = isInvoice ? FileText : Receipt;
                  const Icon = icon;

                  return (
                    <li key={item.id}>
                      <div className="relative pb-8">
                        {itemIdx !== billingActivity.length - 1 ? (
                          <span
                            aria-hidden="true"
                            className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
                          />
                        ) : null}
                        <div className="relative flex space-x-3">
                          <div>
                            <span
                              className={cn(
                                toneClass(item.tone),
                                "flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-white"
                              )}
                            >
                              <Icon aria-hidden="true" className="h-4 w-4 text-white" />
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                                <Badge variant={statusBadgeVariant(item.statusLabel)}>{item.statusLabel}</Badge>
                              </div>
                              <p className="text-xs text-gray-500">{item.description}</p>
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-semibold text-gray-900">{item.amountLabel}</span>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-600">{item.detailLabel}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (isInvoice && item.invoice) {
                                      setSelectedInvoice(item.invoice);
                                    }
                                    if (!isInvoice && item.payment) {
                                      setSelectedPayment(item.payment);
                                    }
                                  }}
                                >
                                  View details
                                </Button>
                                {isInvoice && item.invoice ? (
                                  <PrintReceiptButton
                                    href={`/admin/invoice/${item.invoice.id}/receipt`}
                                    label="Invoice receipt"
                                    size="sm"
                                    variant="ghost"
                                  />
                                ) : null}
                                {!isInvoice && item.payment ? (
                                  <PrintReceiptButton
                                    href={`/admin/payment/${item.payment.id}/receipt`}
                                    label="Payment receipt"
                                    size="sm"
                                    variant="ghost"
                                  />
                                ) : null}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 text-right">
                              <time className="text-xs whitespace-nowrap text-gray-500">
                                {formatDateWithTime(item.when)}
                              </time>
                              {isInvoice && item.invoice ? (
                                <InvoiceActions
                                  invoice={item.invoice}
                                  onView={(invoice) => setSelectedInvoice(invoice)}
                                  onEdit={(invoice) => {
                                    setSelectedInvoice(null);
                                    setEditingInvoice(invoice);
                                    setInvoiceFormOpen(true);
                                  }}
                                  onDelete={handleDeleteInvoice}
                                  onMarkPaid={(invoice) => handleMarkInvoice(invoice, InvoiceStatus.PAID)}
                                  onMarkSent={(invoice) => handleMarkInvoice(invoice, InvoiceStatus.SENT)}
                                  onMarkVoid={(invoice) => handleMarkInvoice(invoice, InvoiceStatus.VOID)}
                                />
                              ) : null}
                              {!isInvoice && item.payment ? (
                                <PaymentActions
                                  payment={item.payment}
                                  onView={(payment) => setSelectedPayment(payment)}
                                  onEdit={(payment) => {
                                    setSelectedPayment(null);
                                    setEditingPayment(payment);
                                    setPaymentFormOpen(true);
                                  }}
                                  onDelete={handleDeletePayment}
                                  onUndo={handleUndoPayment}
                                  undoingId={undoingPaymentId}
                                  isUndoing={isUndoing}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      <InvoiceForm
        open={invoiceFormOpen}
        onOpenChange={(next) => {
          setInvoiceFormOpen(next);
          if (!next) setEditingInvoice(null);
        }}
        invoice={editingInvoice}
        families={[{ id: family.id, name: family.name }]}
        statuses={Object.values(InvoiceStatus)}
        presentation="sheet"
        onSubmit={handleSaveInvoice}
        onDelete={editingInvoice ? () => handleDeleteInvoice(editingInvoice) : undefined}
      />

      <PaymentForm
        open={paymentFormOpen}
        onOpenChange={(next) => {
          setPaymentFormOpen(next);
          if (!next) setEditingPayment(null);
        }}
        payment={editingPayment}
        families={[{ id: family.id, name: family.name }]}
        presentation="sheet"
        onSubmit={handleSavePayment}
        onDelete={editingPayment ? () => handleDeletePayment(editingPayment) : undefined}
      />

      <Sheet
        open={Boolean(selectedPayment)}
        onOpenChange={(next) => {
          if (!next) setSelectedPayment(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-3xl">
          <SheetHeader className="px-0">
            <SheetTitle>Payment details</SheetTitle>
          </SheetHeader>
          {selectedPayment ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-900">Payment {selectedPayment.id}</div>
                  <div className="text-xs text-gray-500">
                    {selectedPayment.method ?? "Payment"} · {formatDateWithTime(selectedPayment.paidAt)}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrencyFromCents(selectedPayment.amountCents)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PrintReceiptButton
                    href={`/admin/payment/${selectedPayment.id}/receipt`}
                    label="Print payment receipt"
                    size="sm"
                    variant="outline"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedPayment(null);
                      setEditingPayment(selectedPayment);
                      setPaymentFormOpen(true);
                    }}
                  >
                    Edit payment
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Meta label="Paid on" value={formatDate(selectedPayment.paidAt)} />
                <Meta label="Method" value={selectedPayment.method ?? "—"} />
                <Meta label="Status" value={selectedPayment.status ?? "—"} />
              </div>

              {selectedPayment.note ? (
                <div className="rounded-lg border bg-gray-50 p-3 text-sm">
                  <div className="text-xs text-gray-500">Note</div>
                  <div className="mt-1 font-medium text-gray-900">{selectedPayment.note}</div>
                </div>
              ) : null}

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-900">Allocations</div>
                  <div className="text-xs text-gray-500">
                    {selectedPayment.allocations?.length
                      ? `${selectedPayment.allocations.length} allocation(s)`
                      : "None yet"}
                  </div>
                </div>
                {selectedPayment.allocations?.length ? (
                  <div className="mt-2 space-y-2">
                    {selectedPayment.allocations.map((allocation) => (
                      <div
                        key={`${selectedPayment.id}-${allocation.invoiceId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Invoice {allocation.invoiceId}</Badge>
                          <span className="text-gray-500">
                            {allocation.invoice?.status ?? "—"}
                          </span>
                        </div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrencyFromCents(allocation.amountCents)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">No allocations recorded for this payment.</p>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selectedInvoice)}
        onOpenChange={(next) => {
          if (!next) setSelectedInvoice(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-3xl">
          <SheetHeader className="px-0">
            <SheetTitle>Invoice details</SheetTitle>
          </SheetHeader>
          {selectedInvoice ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-900">Invoice {selectedInvoice.id}</div>
                  <div className="text-xs text-gray-500">{resolveCoverageLabel(selectedInvoice)}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(selectedInvoice.status)}>{selectedInvoice.status}</Badge>
                    <span className="text-xs text-gray-500">
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
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedInvoice(null);
                      setEditingInvoice(selectedInvoice);
                      setInvoiceFormOpen(true);
                    }}
                  >
                    Edit invoice
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Meta label="Issued" value={formatDate(selectedInvoice.issuedAt)} />
                <Meta label="Due" value={formatDate(selectedInvoice.dueAt)} />
                <Meta label="Coverage" value={resolveCoverageLabel(selectedInvoice)} />
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-900">Line items</div>
                  <div className="text-xs text-gray-500">Totals derive from items</div>
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
                      {selectedInvoice.lineItems.map((lineItem) => (
                        <TableRow key={lineItem.id}>
                          <TableCell className="text-sm">{lineItem.description}</TableCell>
                          <TableCell className="text-sm">{lineItem.quantity}</TableCell>
                          <TableCell className="text-xs text-gray-500">{lineItem.kind}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrencyFromCents(lineItem.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">No line items recorded.</p>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-900">Payments applied</div>
                  <div className="text-xs text-gray-500">
                    {selectedInvoiceAllocations.length
                      ? `${selectedInvoiceAllocations.length} allocation(s)`
                      : "None yet"}
                  </div>
                </div>
                {selectedInvoiceAllocations.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">No payments have been allocated to this invoice.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedInvoiceAllocations.map((allocation) => (
                      <div
                        key={`${selectedInvoice.id}-${allocation.paymentId}-${allocation.amountCents}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Payment {allocation.paymentId}</Badge>
                          <span className="text-gray-500">{formatDate(allocation.paidAt)}</span>
                          {allocation.method ? (
                            <>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-500">{allocation.method}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
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
                        {allocation.note ? <div className="w-full text-gray-500">{allocation.note}</div> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  detail,
  valueClassName,
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold text-gray-900", valueClassName)}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{detail}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

function InvoiceActions({
  invoice,
  onView,
  onEdit,
  onDelete,
  onMarkSent,
  onMarkPaid,
  onMarkVoid,
}: {
  invoice: InvoiceRow;
  onView: (invoice: InvoiceRow) => void;
  onEdit: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => Promise<void>;
  onMarkSent: (invoice: InvoiceRow) => Promise<void>;
  onMarkPaid: (invoice: InvoiceRow) => Promise<void>;
  onMarkVoid: (invoice: InvoiceRow) => Promise<void>;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  const run = async (fn: (invoice: InvoiceRow) => Promise<void>, key: string) => {
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
        <Button variant="ghost" size="icon" aria-label="Invoice actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Invoice</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onView(invoice)}>View details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(invoice)}>Edit invoice</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <PrintReceiptButton
            asChild
            href={`/admin/invoice/${invoice.id}/receipt`}
            label="Print receipt"
            className="w-full justify-start text-sm"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending === "sent"} onSelect={() => void run(onMarkSent, "sent")}>Mark sent</DropdownMenuItem>
        <DropdownMenuItem disabled={pending === "paid"} onSelect={() => void run(onMarkPaid, "paid")}>Mark paid</DropdownMenuItem>
        <DropdownMenuItem disabled={pending === "void"} onSelect={() => void run(onMarkVoid, "void")}>Void invoice</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={pending === "delete"}
          onSelect={() => void run(onDelete, "delete")}
        >
          Delete invoice
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaymentActions({
  payment,
  onView,
  onEdit,
  onDelete,
  onUndo,
  undoingId,
  isUndoing,
}: {
  payment: BillingPayment;
  onView: (payment: BillingPayment) => void;
  onEdit: (payment: BillingPayment) => void;
  onDelete: (payment: BillingPayment) => Promise<void>;
  onUndo: (paymentId: string) => void;
  undoingId: string | null;
  isUndoing: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Payment actions" disabled={isUndoing && undoingId === payment.id}>
          {isUndoing && undoingId === payment.id ? (
            <PendingDot className="h-3.5 w-3.5" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Payment</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onView(payment)}>View details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(payment)}>Edit payment</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <PrintReceiptButton
            asChild
            href={`/admin/payment/${payment.id}/receipt`}
            label="Print receipt"
            className="w-full justify-start text-sm"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onUndo(payment.id)}>
          <Undo2 className="mr-2 h-4 w-4" />
          Undo payment
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void onDelete(payment)}>
          <AlertCircle className="mr-2 h-4 w-4" />
          Delete payment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
