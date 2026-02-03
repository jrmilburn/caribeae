"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WeeklyPlanSelect, type WeeklyPlanOption } from "@/components/admin/WeeklyPlanSelect";
import { cn } from "@/lib/utils";
import { centsToDollarString, dollarsToCents, formatCurrencyFromCents } from "@/lib/currency";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";

import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { recordFamilyPayment } from "@/server/billing/recordFamilyPayment";

const PAYMENT_METHODS = ["Card", "Cash", "Direct debit", "Client portal"] as const;

type BillingData = Awaited<ReturnType<typeof getFamilyBillingData>>;

type OpenInvoice = BillingData["openInvoices"][number] & { balanceCents?: number };

export type RecordPaymentSheetProps = {
  familyId: string;
  enrolments: FamilyBillingPosition["enrolments"];
  openInvoices: OpenInvoice[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
};

export function RecordPaymentSheet({
  familyId,
  enrolments,
  openInvoices,
  open,
  onOpenChange,
  trigger,
  onSuccess,
}: RecordPaymentSheetProps) {
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

  const normalizedOpenInvoices = React.useMemo(
    () =>
      openInvoices.map((invoice) => ({
        ...invoice,
        balanceCents:
          typeof invoice.balanceCents === "number"
            ? invoice.balanceCents
            : Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
      })),
    [openInvoices]
  );

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
    const invoiceIds = normalizedOpenInvoices.filter((inv) => inv.balanceCents > 0).map((inv) => inv.id);
    setSelected(invoiceIds);
    setAllocations(
      invoiceIds.reduce<Record<string, string>>((acc, invoiceId) => {
        const invoice = normalizedOpenInvoices.find((inv) => inv.id === invoiceId);
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
  }, [sheetOpen, normalizedOpenInvoices]);

  React.useEffect(() => {
    if (!sheetOpen) return;
    setAllocations((prev) => {
      const next: Record<string, string> = {};
      selected.forEach((invoiceId) => {
        if (prev[invoiceId] != null) {
          next[invoiceId] = prev[invoiceId];
          return;
        }
        const invoice = normalizedOpenInvoices.find((inv) => inv.id === invoiceId);
        next[invoiceId] = invoice ? centsToDollarString(invoice.balanceCents) : "0.00";
      });
      return next;
    });
  }, [selected, sheetOpen, normalizedOpenInvoices]);

  const selectedInvoices = normalizedOpenInvoices.filter((inv) => selected.includes(inv.id));
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
        onSuccess?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record payment.";
        toast.error(message);
      }
    });
  };

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      {trigger === null ? null : (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button variant="secondary" size="sm">
              Record payment
            </Button>
          )}
        </SheetTrigger>
      )}

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

          {applyTarget !== "ALLOCATE_INVOICES" &&
          applyTarget !== "UNALLOCATED" &&
          isWeeklyPlan &&
          weeklyPlanOptions.length > 1 ? (
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
                  {normalizedOpenInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        No open invoices to allocate.
                      </TableCell>
                    </TableRow>
                  ) : (
                    normalizedOpenInvoices.map((invoice) => {
                      const balance = invoice.balanceCents;
                      const allocationValue = allocations[invoice.id] ?? "";
                      const coverageLabel =
                        invoice.coverageStart && invoice.coverageEnd
                          ? `${formatDate(invoice.coverageStart)} to ${formatDate(invoice.coverageEnd)}`
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

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}
