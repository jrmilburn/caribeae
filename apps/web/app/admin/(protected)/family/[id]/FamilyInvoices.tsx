"use client";

import * as React from "react";
import { format } from "date-fns";
import { InvoiceStatus } from "@prisma/client";
import {
  AlertCircle,
  MoreHorizontal,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PendingDot } from "@/components/loading/LoadingSystem";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
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
    case "Void":
    case "Voided":
      return "destructive" as const;
    case "PARTIALLY_PAID":
    case "Due soon":
      return "secondary" as const;
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

function formatSentenceCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function resolveCoverageLabel(invoice: {
  coverageStart?: Date | null;
  coverageEnd?: Date | null;
  creditsPurchased?: number | null;
}) {
  if (invoice.coverageStart && invoice.coverageEnd) {
    return `${formatDate(invoice.coverageStart)} to ${formatDate(invoice.coverageEnd)}`;
  }
  if (invoice.creditsPurchased) {
    return `${invoice.creditsPurchased} credits purchased`;
  }
  return null;
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

function formatPaymentMethod(method?: string | null) {
  if (!method) return null;
  const normalized = method.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "direct debit") return "Direct debit";
  if (normalized === "client portal") return "Client portal";
  if (normalized === "credit") return "Account credit";
  return normalized.replace(/^\w/, (char) => char.toUpperCase());
}

function looksTechnicalText(value: string) {
  return (
    /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value) ||
    /\([^)_:]{12,}:[^)]+\)/.test(value) ||
    value.includes("class-change:") ||
    value.includes("settlement (")
  );
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || looksTechnicalText(trimmed)) return null;
  return trimmed;
}

function describePayment(payment: BillingPayment) {
  const note = payment.note?.trim() ?? "";
  const lower = note.toLowerCase();

  if (lower.startsWith("class change settlement")) return "Class change credit";
  if (lower === "merge enrolments credit transfer") return "Merge enrolments credit";
  if (lower === "class move") return "Class move adjustment";
  if (lower === "opening credits") return "Opening credit";
  if (lower === "manual paid-through adjustment") return "Paid-through adjustment";
  if (lower === "block payment") return "Block payment";
  if (lower && !looksTechnicalText(note) && lower !== "invoice paid" && lower !== "payment recorded") {
    return note;
  }

  const method = formatPaymentMethod(payment.method);
  return method ? `${method} payment` : "Payment";
}

function describePaymentNote(payment: BillingPayment) {
  const note = cleanText(payment.note);
  if (!note) return null;
  const lower = note.toLowerCase();
  if (lower === "invoice paid" || lower === "payment recorded") return null;
  const description = describePayment(payment).toLowerCase();
  if (lower === description) return null;
  return note;
}

function describeInvoice(invoice: InvoiceRow) {
  const visibleDescriptions = invoice.lineItems
    .map((lineItem) => cleanText(lineItem.description))
    .filter((value): value is string => Boolean(value));

  if (visibleDescriptions.length === 1) {
    return visibleDescriptions[0];
  }

  if (visibleDescriptions.length > 1) {
    const [first, ...rest] = visibleDescriptions;
    return `${first} +${rest.length} more`;
  }

  if (invoice.creditsPurchased) return "Block payment invoice";
  if (invoice.coverageStart || invoice.coverageEnd) return "Tuition invoice";
  return "Manual invoice";
}

function describeInvoiceSubtitle(invoice: InvoiceRow) {
  const coverage = resolveCoverageLabel(invoice);
  const parts = [coverage, invoice.dueAt ? `Due ${formatDate(invoice.dueAt)}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Family account invoice";
}

function describeInvoiceDetail(invoice: InvoiceRow) {
  if (invoice.amountOwingCents > 0) {
    return `${formatCurrencyFromCents(invoice.amountOwingCents)} outstanding`;
  }
  return "Paid in full";
}

function describeAllocationInvoice(allocation: BillingPayment["allocations"][number]["invoice"]) {
  const dueLabel = allocation.dueAt ? `Due ${formatDate(allocation.dueAt)}` : "No due date";
  return `Invoice · ${dueLabel}`;
}

function describeAllocationNote(note?: string | null) {
  const cleaned = cleanText(note);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower === "invoice paid" || lower === "payment recorded") return null;
  return cleaned;
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
        title: describeInvoice(invoice),
        description: describeInvoiceSubtitle(invoice),
        amountLabel: formatCurrencyFromCents(invoice.amountCents),
        detailLabel: describeInvoiceDetail(invoice),
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
        title: describePayment(payment),
        description: describePaymentNote(payment) ?? "Family account payment",
        amountLabel: formatCurrencyFromCents(payment.amountCents),
        detailLabel: payment.allocations?.length
          ? `Applied to ${payment.allocations.length} invoice${payment.allocations.length === 1 ? "" : "s"}`
          : "Unallocated family credit",
        statusLabel: formatSentenceCase(status),
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
        normalized.applyEarlyPaymentDiscount = payload.applyEarlyPaymentDiscount;
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
      <section className="rounded-xl border border-border/80 bg-background p-5">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Billing activity</h2>
            <p className="text-sm text-muted-foreground">
              Shared family-account invoices, credits, and payments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setEditingInvoice(null);
                setInvoiceFormOpen(true);
              }}
            >
              New invoice
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
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

        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Family account
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Billing here is shared across siblings. Student-level paid-through dates stay on each student record.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryStat
            label="Outstanding"
            value={
              billingPosition.outstandingCents > 0
                ? formatCurrencyFromCents(billingPosition.outstandingCents)
                : "No balance due"
            }
            detail={
              billingPosition.outstandingCents > 0
                ? "Across the family account."
                : "This account is currently settled."
            }
            valueClassName={billingPosition.outstandingCents > 0 ? "text-red-700" : "text-emerald-700"}
          />
          <SummaryStat
            label="Open invoices"
            value={String(openInvoiceCount)}
            detail={
              billingPosition.nextDueInvoice?.dueAt
                ? `Next due ${formatDate(billingPosition.nextDueInvoice.dueAt)}`
                : "Nothing currently due"
            }
          />
          <SummaryStat
            label="Unallocated credit"
            value={
              billingPosition.unallocatedCents > 0
                ? formatCurrencyFromCents(billingPosition.unallocatedCents)
                : "None"
            }
            detail="Credit available to apply later."
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-background p-5">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Ledger</h3>
            <p className="text-sm text-muted-foreground">
              Most recent invoices and payments for this family account.
            </p>
          </div>
          <Badge variant="outline" className="text-[11px]">
            {billingActivity.length} entr{billingActivity.length === 1 ? "y" : "ies"}
          </Badge>
        </div>

        <div className="mt-4">
          {billingActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No billing activity yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a manual invoice or record a payment to start the ledger.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {billingActivity.map((item) => {
                const isInvoice = item.kind === "invoice";

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border/70 bg-background px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", toneClass(item.tone))} />

                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            <Badge variant={statusBadgeVariant(item.statusLabel)} className="text-[11px]">
                              {item.statusLabel}
                            </Badge>
                            <Badge variant="outline" className="text-[11px]">
                              {isInvoice ? "Invoice" : "Payment"}
                            </Badge>
                          </div>

                          <p className="text-sm text-muted-foreground">{item.description}</p>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDateWithTime(item.when)}</span>
                            <span>•</span>
                            <span>{item.detailLabel}</span>
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
                      </div>

                      <div className="flex items-start justify-between gap-3 lg:flex-col lg:items-end">
                        <div className="text-sm font-semibold text-foreground">{item.amountLabel}</div>
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
                );
              })}
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
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>Payment details</SheetTitle>
          </SheetHeader>
          {selectedPayment ? (
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">{describePayment(selectedPayment)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateWithTime(selectedPayment.paidAt)} · Family account
                    </div>
                    <div className="text-lg font-semibold text-foreground">
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
              </div>

              <div
                className={cn(
                  "grid gap-3",
                  selectedPayment.earlyPaymentDiscountApplied ? "sm:grid-cols-5" : "sm:grid-cols-3"
                )}
              >
                <Meta label="Paid on" value={formatDate(selectedPayment.paidAt)} />
                <Meta label="Method" value={formatPaymentMethod(selectedPayment.method) ?? "Manual"} />
                <Meta label="Status" value={formatSentenceCase(selectedPayment.status ?? "RECORDED")} />
                {selectedPayment.earlyPaymentDiscountApplied ? (
                  <>
                    <Meta label="Gross" value={formatCurrencyFromCents(selectedPayment.grossAmountCents)} />
                    <Meta
                      label="Discount"
                      value={formatCurrencyFromCents(-selectedPayment.earlyPaymentDiscountAmountCents)}
                    />
                  </>
                ) : null}
              </div>

              {describePaymentNote(selectedPayment) ? (
                <div className="rounded-xl border border-border/80 bg-background p-4 text-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Note
                  </div>
                  <div className="mt-1 text-foreground">{describePaymentNote(selectedPayment)}</div>
                </div>
              ) : null}

              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Allocations</div>
                    <p className="text-sm text-muted-foreground">
                      Where this payment has been applied across the family account.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {selectedPayment.allocations?.length ?? 0}
                  </Badge>
                </div>

                {selectedPayment.allocations?.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedPayment.allocations.map((allocation) => (
                      <div
                        key={`${selectedPayment.id}-${allocation.invoiceId}`}
                        className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">
                              {describeAllocationInvoice(allocation.invoice)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatSentenceCase(allocation.invoice.status)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground">
                            {formatCurrencyFromCents(allocation.amountCents)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                    No allocations recorded for this payment.
                  </div>
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
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-2xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>Invoice details</SheetTitle>
          </SheetHeader>
          {selectedInvoice ? (
            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">{describeInvoice(selectedInvoice)}</div>
                    <div className="text-sm text-muted-foreground">{describeInvoiceSubtitle(selectedInvoice)}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusBadgeVariant(resolveInvoiceDisplayStatus(selectedInvoice.status))}>
                        {resolveInvoiceDisplayStatus(selectedInvoice.status)}
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
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Meta label="Issued" value={formatDate(selectedInvoice.issuedAt)} />
                <Meta label="Due" value={formatDate(selectedInvoice.dueAt)} />
                <Meta label="Total" value={formatCurrencyFromCents(selectedInvoice.amountCents)} />
                <Meta label="Outstanding" value={formatCurrencyFromCents(selectedInvoice.amountOwingCents)} />
              </div>

              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Line items</div>
                    <p className="text-sm text-muted-foreground">This invoice total is derived from the items below.</p>
                  </div>
                </div>
                {selectedInvoice.lineItems?.length ? (
                  <Table className="mt-4">
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
                          <TableCell className="text-xs text-muted-foreground">
                            {formatSentenceCase(lineItem.kind)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrencyFromCents(lineItem.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                    No line items recorded.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Payments applied</div>
                    <p className="text-sm text-muted-foreground">
                      Payments that have been allocated against this invoice.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {selectedInvoiceAllocations.length}
                  </Badge>
                </div>
                {selectedInvoiceAllocations.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                    No payments have been allocated to this invoice.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {selectedInvoiceAllocations.map((allocation) => (
                      <div
                        key={`${selectedInvoice.id}-${allocation.paymentId}-${allocation.amountCents}`}
                        className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">
                              {allocation.method ? `${formatPaymentMethod(allocation.method)} payment` : "Payment"}
                            </div>
                            <div className="text-sm text-muted-foreground">{formatDate(allocation.paidAt)}</div>
                            {describeAllocationNote(allocation.note) ? (
                              <div className="text-sm text-muted-foreground">
                                {describeAllocationNote(allocation.note)}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {formatCurrencyFromCents(allocation.amountCents)}
                            </div>
                            <PrintReceiptButton
                              href={`/admin/payment/${allocation.paymentId}/receipt`}
                              label="Payment receipt"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                            />
                          </div>
                        </div>
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
    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-semibold text-foreground", valueClassName)}>{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
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
        <DropdownMenuItem disabled={pending === "sent"} onSelect={() => void run(onMarkSent, "sent")}>
          Mark sent
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending === "paid"} onSelect={() => void run(onMarkPaid, "paid")}>
          Mark paid
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending === "void"} onSelect={() => void run(onMarkVoid, "void")}>
          Void invoice
        </DropdownMenuItem>
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Payment actions"
          disabled={isUndoing && undoingId === payment.id}
        >
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
