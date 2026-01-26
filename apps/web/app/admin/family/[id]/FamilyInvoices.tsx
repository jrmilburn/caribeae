"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { centsToDollarString, dollarsToCents, formatCurrencyFromCents } from "@/lib/currency";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import { PayAheadCard } from "@/components/admin/PayAheadCard";
import { WeeklyPlanSelect, type WeeklyPlanOption } from "@/components/admin/WeeklyPlanSelect";
import { resolveInvoiceDisplayStatus } from "./invoiceDisplay";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import { getFamilyBillingSummary, type FamilyBillingSummary } from "@/server/billing/getFamilyBillingSummary";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { recordFamilyPayment } from "@/server/billing/recordFamilyPayment";
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

function PayAheadSheet({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<FamilyBillingSummary | null>(null);
  const [isLoading, startLoading] = React.useTransition();

  const loadSummary = React.useCallback(async () => {
    try {
      const data = await getFamilyBillingSummary(familyId);
      setSummary(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load billing summary.";
      toast.error(message);
      setSummary(null);
    }
  }, [familyId]);

  React.useEffect(() => {
    if (!sheetOpen) return;
    startLoading(async () => {
      await loadSummary();
    });
  }, [sheetOpen, loadSummary, startLoading]);

  const handleRefresh = React.useCallback(
    async () => {
      await loadSummary();
      router.refresh();
    },
    [loadSummary, router]
  );

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Pay next block
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-6 sm:max-w-xl sm:px-8">
        <SheetHeader>
          <SheetTitle>Pay next block</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {isLoading && !summary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pay-ahead details...
            </div>
          ) : (
            <PayAheadCard summary={summary} onRefresh={handleRefresh} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RecordPaymentSheet({
  familyId,
  enrolments,
  openInvoices,
  open,
  onOpenChange,
}: {
  familyId: string;
  enrolments: FamilyBillingPosition["enrolments"];
  openInvoices: Array<
    BillingData["openInvoices"][number] & {
      balanceCents: number;
    }
  >;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const PAYMENT_METHODS = ["Card", "Cash", "Direct debit", "Client portal"] as const;
  type PaymentMethod = (typeof PAYMENT_METHODS)[number];

  const router = useRouter();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const sheetOpen = open ?? internalOpen;
  const setSheetOpen = onOpenChange ?? setInternalOpen;
  const [selected, setSelected] = React.useState<string[]>([]);
  const [allocations, setAllocations] = React.useState<Record<string, string>>({});
  const [applyTarget, setApplyTarget] = React.useState<string>("ALLOCATE_INVOICES");
  const [amount, setAmount] = React.useState<string>("");
  const [method, setMethod] = React.useState<PaymentMethod>("Cash");
  const [note, setNote] = React.useState("");
  const [paidDate, setPaidDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customBlockEnabled, setCustomBlockEnabled] = React.useState(false);
  const [customBlockLength, setCustomBlockLength] = React.useState("");
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  const [isSubmitting, startSubmit] = React.useTransition();

  const enrolmentOptions = React.useMemo(() => {
    return enrolments
      .filter((enrolment) => enrolment.billingType)
      .map((enrolment) => ({
        id: enrolment.id,
        label: `${enrolment.studentName} · ${enrolment.planName ?? "Plan"}`,
        plan: enrolment.planId
          ? {
              id: enrolment.planId,
              name: enrolment.planName,
              billingType: enrolment.billingType,
              priceCents: enrolment.planPriceCents,
              blockClassCount: enrolment.blockClassCount,
              durationWeeks: enrolment.durationWeeks,
            }
          : null,
        weeklyPlanOptions: enrolment.weeklyPlanOptions ?? [],
      }));
  }, [enrolments]);

  React.useEffect(() => {
    if (!sheetOpen) return;
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
    setApplyTarget("ALLOCATE_INVOICES");
    setAmount("");
    setMethod("Cash");
    setNote("");
    setPaidDate(new Date().toISOString().slice(0, 10));
    setCustomBlockEnabled(false);
    setCustomBlockLength("");
    setSelectedPlanId(null);
  }, [sheetOpen, openInvoices]);

  React.useEffect(() => {
    if (!sheetOpen) return;
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
  }, [selected, sheetOpen, openInvoices]);

  const selectedInvoices = openInvoices.filter((inv) => selected.includes(inv.id));
  const allocationCents = selectedInvoices.map((inv) => ({
    invoiceId: inv.id,
    cents: dollarsToCents(allocations[inv.id] ?? "0"),
  }));
  const allocatedTotalCents = allocationCents.reduce((sum, a) => sum + a.cents, 0);
  const explicitAmountCents = dollarsToCents(amount || "0");
  const selectedEnrolment = enrolmentOptions.find((option) => option.id === applyTarget) ?? null;
  const weeklyPlanOptions: WeeklyPlanOption[] =
    selectedEnrolment?.plan?.billingType === "PER_WEEK" ? selectedEnrolment.weeklyPlanOptions : [];
  const activePlanId = selectedPlanId ?? selectedEnrolment?.plan?.id ?? null;
  const selectedPlan =
    weeklyPlanOptions?.find((plan) => plan.id === activePlanId) ??
    (selectedEnrolment?.plan
      ? {
          id: selectedEnrolment.plan.id,
          name: selectedEnrolment.plan.name,
          priceCents: selectedEnrolment.plan.priceCents,
          durationWeeks: selectedEnrolment.plan.durationWeeks ?? null,
        }
      : null);
  const isBlockPlan = selectedEnrolment?.plan?.billingType === "PER_CLASS";
  const isWeeklyPlan = selectedEnrolment?.plan?.billingType === "PER_WEEK";
  const planBlockLength = selectedEnrolment?.plan ? resolveBlockLength(selectedEnrolment.plan.blockClassCount) : 1;
  const parsedCustomBlockLength = Number(customBlockLength);
  const customBlockValue = Number.isInteger(parsedCustomBlockLength) ? parsedCustomBlockLength : null;
  const blockPricing =
    selectedEnrolment?.plan && isBlockPlan
      ? calculateBlockPricing({
          priceCents: selectedEnrolment.plan.priceCents,
          blockLength: planBlockLength,
          customBlockLength: customBlockEnabled ? customBlockValue ?? undefined : undefined,
        })
      : null;
  const planAmountCents = isWeeklyPlan && selectedPlan ? selectedPlan.priceCents : 0;
  const amountCents =
    customBlockEnabled && blockPricing
      ? blockPricing.totalCents
      : isWeeklyPlan && selectedPlan
        ? planAmountCents
        : explicitAmountCents;
  const totalCents = applyTarget === "ALLOCATE_INVOICES" ? allocatedTotalCents : amountCents;

  React.useEffect(() => {
    if (!sheetOpen) return;
    if (!isBlockPlan) {
      setCustomBlockEnabled(false);
      setCustomBlockLength("");
      return;
    }
    if (!customBlockEnabled) {
      setCustomBlockLength(String(planBlockLength));
    }
  }, [applyTarget, sheetOpen, isBlockPlan, planBlockLength, customBlockEnabled]);

  React.useEffect(() => {
    if (!sheetOpen) return;
    if (!isWeeklyPlan || !selectedEnrolment?.plan) {
      setSelectedPlanId(null);
      return;
    }
    setSelectedPlanId(selectedEnrolment.plan.id);
    setAmount(centsToDollarString(selectedEnrolment.plan.priceCents));
  }, [sheetOpen, applyTarget, isWeeklyPlan, selectedEnrolment?.plan]);

  React.useEffect(() => {
    if (!sheetOpen) return;
    if (isWeeklyPlan && selectedPlan) {
      setAmount(centsToDollarString(selectedPlan.priceCents));
    }
  }, [sheetOpen, isWeeklyPlan, selectedPlan?.id, selectedPlan?.priceCents]);

  const toggleSelection = (invoiceId: string) => {
    setSelected((prev) => (prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const allocationsPayload = allocationCents.filter((a) => a.cents > 0);
    if (totalCents <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }

    if (applyTarget === "ALLOCATE_INVOICES") {
      if (allocationsPayload.length === 0) {
        toast.error("Add at least one allocation.");
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
    }

    const paidAtDate = paidDate ? new Date(paidDate) : new Date();
    const invalidCustomBlock =
      customBlockEnabled && isBlockPlan && (!customBlockValue || customBlockValue < planBlockLength);
    if (invalidCustomBlock) {
      toast.error(`Custom block length must be at least ${planBlockLength} classes.`);
      return;
    }

    startSubmit(async () => {
      try {
        await recordFamilyPayment({
          familyId,
          amountCents: totalCents,
          paidAt: paidAtDate,
          method: method.trim() || undefined,
          note: note.trim() || undefined,
          allocations:
            applyTarget === "ALLOCATE_INVOICES"
              ? allocationsPayload.map((a) => ({
                  invoiceId: a.invoiceId,
                  amountCents: a.cents,
                }))
              : undefined,
          enrolmentId: applyTarget !== "ALLOCATE_INVOICES" && applyTarget !== "UNALLOCATED" ? applyTarget : undefined,
          customBlockLength: customBlockEnabled && isBlockPlan && customBlockValue ? customBlockValue : undefined,
          planId: isWeeklyPlan && selectedPlan ? selectedPlan.id : undefined,
          idempotencyKey: crypto.randomUUID(),
        });
        toast.success("Payment recorded.");
        setSheetOpen(false);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record payment.";
        toast.error(message);
      }
    });
  };

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm">
          Record payment
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full p-6 sm:max-w-xl sm:px-8">
        <SheetHeader>
          <SheetTitle>Payment</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Apply to</Label>
            <Select value={applyTarget} onValueChange={setApplyTarget}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select apply target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALLOCATE_INVOICES">Allocate to invoices</SelectItem>
                <SelectItem value="UNALLOCATED">Unallocated credit</SelectItem>
                {enrolmentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {applyTarget !== "ALLOCATE_INVOICES" && applyTarget !== "UNALLOCATED" && isWeeklyPlan && weeklyPlanOptions.length > 1 ? (
            <WeeklyPlanSelect
              value={activePlanId ?? ""}
              onValueChange={(value) => setSelectedPlanId(value)}
              options={weeklyPlanOptions}
              label="Pay-ahead plan"
            />
          ) : null}

          {applyTarget === "ALLOCATE_INVOICES" ? (
            <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Invoice</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Allocate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No open invoices to allocate.
                    </TableCell>
                  </TableRow>
                ) : (
                  openInvoices.map((invoice) => {
                    const balance = invoice.balanceCents;
                    const allocationValue = allocations[invoice.id] ?? "";
                    const coverageLabel =
                      invoice.coverageStart && invoice.coverageEnd
                        ? `${formatDate(invoice.coverageStart)} → ${formatDate(invoice.coverageEnd)}`
                        : "—";
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
                          <div className="text-xs text-muted-foreground">Due {formatDate(invoice.dueAt)}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{coverageLabel}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatCurrencyFromCents(balance)}</TableCell>
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
          ) : (
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={
                  customBlockEnabled && blockPricing
                    ? centsToDollarString(blockPricing.totalCents)
                    : isWeeklyPlan && selectedPlan
                      ? centsToDollarString(selectedPlan.priceCents)
                      : amount
                }
                onChange={(e) => setAmount(e.target.value)}
                disabled={(customBlockEnabled && isBlockPlan) || (isWeeklyPlan && Boolean(selectedPlan))}
                placeholder="0.00"
              />
              {isBlockPlan && selectedEnrolment?.plan ? (
                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>
                      {planBlockLength} classes · {formatCurrencyFromCents(selectedEnrolment.plan.priceCents)}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      onClick={() => {
                        if (!customBlockEnabled) {
                          setCustomBlockLength(String(planBlockLength));
                        }
                        setCustomBlockEnabled((prev) => !prev);
                      }}
                    >
                      {customBlockEnabled ? "Use default" : "Customize"}
                    </button>
                  </div>
                  {customBlockEnabled ? (
                    <div className="mt-3 space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="custom-block-length">Number of classes</Label>
                        <Input
                          id="custom-block-length"
                          type="number"
                          min={planBlockLength}
                          value={customBlockLength}
                          onChange={(e) => setCustomBlockLength(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Minimum {planBlockLength} classes.</p>
                      </div>
                      {blockPricing ? (
                        <div className="text-xs text-muted-foreground">
                          <div>Per class: {formatCurrencyFromCents(blockPricing.perClassPriceCents)}</div>
                          <div>Total: {formatCurrencyFromCents(blockPricing.totalCents)}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paidAt">Paid on</Label>
              <Input id="paidAt" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
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
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={isSubmitting}>
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
