"use client";

import * as React from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { centsToDollarString, dollarsToCents, formatCurrencyFromCents } from "@/lib/currency";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";

import { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { BillingPayment } from "@/server/billing/types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  families: { id: string; name: string }[];
  payment?: BillingPayment | null;
  onSubmit: (payload: {
    familyId: string;
    amountCents: number;
    paidAt?: Date | null;
    method?: string | null;
    note?: string | null;
    allocations?: Array<{ invoiceId: string; amountCents: number }>;
    enrolmentId?: string;
    customBlockLength?: number;
    idempotencyKey?: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  presentation?: "dialog" | "sheet";
};

type InvoiceOption = {
  id: string;
  dueAt: Date | null;
  status: string;
  amountCents: number;
  amountPaidCents: number;
  balanceCents: number;
};

function formatSentenceCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function PaymentForm({
  open,
  onOpenChange,
  families,
  payment,
  onSubmit,
  onDelete,
  presentation = "dialog",
}: Props) {
  const [familyId, setFamilyId] = React.useState(payment?.familyId ?? "");
  const [amount, setAmount] = React.useState(payment ? centsToDollarString(payment.amountCents) : "");
  const [method, setMethod] = React.useState(payment?.method ?? "Cash");
  const [note, setNote] = React.useState(payment?.note ?? "");
  const [paidOn, setPaidOn] = React.useState(
    payment?.paidAt ? format(payment.paidAt, "yyyy-MM-dd") : new Date().toISOString().slice(0, 10)
  );
  const [allocations, setAllocations] = React.useState<Record<string, string>>({});
  const [invoiceOptions, setInvoiceOptions] = React.useState<InvoiceOption[]>([]);
  const [enrolmentOptions, setEnrolmentOptions] = React.useState<
    Array<{ id: string; label: string; plan?: { billingType: string; priceCents: number; blockClassCount: number | null } }>
  >([]);
  const [applyTarget, setApplyTarget] = React.useState<string>("ALLOCATE_INVOICES");
  const [loadingInvoices, setLoadingInvoices] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [customBlockEnabled, setCustomBlockEnabled] = React.useState(false);
  const [customBlockLength, setCustomBlockLength] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setFamilyId(payment?.familyId ?? "");
    setAmount(payment ? centsToDollarString(payment.amountCents) : "");
    setMethod(payment?.method ?? "Cash");
    setNote(payment?.note ?? "");
    setPaidOn(payment?.paidAt ? format(payment.paidAt, "yyyy-MM-dd") : new Date().toISOString().slice(0, 10));
    const hasAllocations = (payment?.allocations?.length ?? 0) > 0;
    setApplyTarget(payment ? (hasAllocations ? "ALLOCATE_INVOICES" : "UNALLOCATED") : "ALLOCATE_INVOICES");
    setCustomBlockEnabled(false);
    setCustomBlockLength("");

    const existingAllocations: Record<string, string> = {};
    payment?.allocations?.forEach((allocation) => {
      existingAllocations[allocation.invoiceId] = centsToDollarString(allocation.amountCents);
    });
    setAllocations(existingAllocations);
  }, [open, payment]);

  React.useEffect(() => {
    if (!open || !familyId) {
      setInvoiceOptions([]);
      setEnrolmentOptions([]);
      return;
    }
    const previousAllocations = new Map<string, number>();
    payment?.allocations?.forEach((alloc) => previousAllocations.set(alloc.invoiceId, alloc.amountCents));

    let active = true;
    setLoadingInvoices(true);
    getFamilyBillingData(familyId)
      .then((res) => {
        if (!active) return;
        const enrolments =
          res.enrolments?.map((enrolment) => ({
            id: enrolment.id,
            label: `${enrolment.student.name} · ${enrolment.plan?.name ?? "Plan"}`,
            plan: enrolment.plan ?? undefined,
          })) ?? [];
        setEnrolmentOptions(enrolments);
        const openInvoices =
          res.openInvoices?.map((invoice) => ({
            id: invoice.id,
            dueAt: invoice.dueAt ?? null,
            status: invoice.status,
            amountCents: invoice.amountCents,
            amountPaidCents: invoice.amountPaidCents,
            balanceCents: Math.max(
              invoice.amountCents - invoice.amountPaidCents + (previousAllocations.get(invoice.id) ?? 0),
              0
            ),
          })) ?? [];

        const existingFromPayment =
          payment?.allocations?.map((alloc) => ({
            id: alloc.invoice.id,
            dueAt: alloc.invoice.dueAt ?? null,
            status: alloc.invoice.status,
            amountCents: alloc.invoice.amountCents,
            amountPaidCents: alloc.invoice.amountPaidCents,
            balanceCents: Math.max(
              alloc.invoice.amountCents - alloc.invoice.amountPaidCents + (previousAllocations.get(alloc.invoice.id) ?? 0),
              0
            ),
          })) ?? [];

        const merged = new Map<string, InvoiceOption>();
        [...openInvoices, ...existingFromPayment].forEach((inv) => merged.set(inv.id, inv));
        setInvoiceOptions(Array.from(merged.values()));
      })
      .finally(() => {
        if (active) setLoadingInvoices(false);
      });

    return () => {
      active = false;
    };
  }, [open, familyId, payment]);

  const selectedInvoices = React.useMemo(
    () => invoiceOptions.filter((inv) => allocations[inv.id] != null),
    [invoiceOptions, allocations]
  );

  const allocationCents = selectedInvoices.map((inv) => ({
    invoiceId: inv.id,
    amountCents: dollarsToCents(allocations[inv.id] ?? "0"),
    balanceCents: inv.balanceCents,
  }));

  const totalAllocationCents = allocationCents.reduce((sum, a) => sum + a.amountCents, 0);
  const selectedEnrolment = enrolmentOptions.find((option) => option.id === applyTarget) ?? null;
  const isBlockPlan = selectedEnrolment?.plan?.billingType === "PER_CLASS";
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
  const amountCents = customBlockEnabled && blockPricing ? blockPricing.totalCents : dollarsToCents(amount || "0");

  React.useEffect(() => {
    if (!open) return;
    if (!isBlockPlan) {
      setCustomBlockEnabled(false);
      setCustomBlockLength("");
      return;
    }
    if (!customBlockEnabled) {
      setCustomBlockLength(String(planBlockLength));
    }
  }, [applyTarget, open, isBlockPlan, planBlockLength, customBlockEnabled]);

  const toggleInvoice = (invoiceId: string) => {
    setAllocations((prev) => {
      const copy = { ...prev };
      if (copy[invoiceId] != null) {
        delete copy[invoiceId];
      } else {
        const invoice = invoiceOptions.find((inv) => inv.id === invoiceId);
        copy[invoiceId] = invoice ? centsToDollarString(invoice.balanceCents) : "0.00";
      }
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyId) {
      toast.error("Choose a family first.");
      return;
    }
    if (amountCents <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }

    const allocationsPayload = Object.entries(allocations)
      .map(([invoiceId, value]) => ({
        invoiceId,
        amountCents: dollarsToCents(value || "0"),
      }))
      .filter((allocation) => allocation.amountCents > 0);

    if (applyTarget === "ALLOCATE_INVOICES" && allocationsPayload.length > 0) {
      const allocationTotal = allocationsPayload.reduce((sum, a) => sum + a.amountCents, 0);
      if (allocationTotal !== amountCents) {
        toast.error("Allocation total must match the payment amount.");
        return;
      }
      const exceeds = allocationsPayload.some((allocation) => {
        const invoice = invoiceOptions.find((inv) => inv.id === allocation.invoiceId);
        if (!invoice) return false;
        return allocation.amountCents > invoice.balanceCents;
      });
      if (exceeds) {
        toast.error("Allocation exceeds the invoice balance.");
        return;
      }
    }

    if (!payment && applyTarget === "ALLOCATE_INVOICES" && allocationsPayload.length === 0) {
      toast.error("Add at least one allocation or choose another apply target.");
      return;
    }

    const invalidCustomBlock =
      customBlockEnabled && isBlockPlan && (!customBlockValue || customBlockValue < planBlockLength);
    if (invalidCustomBlock) {
      toast.error(`Custom block length must be at least ${planBlockLength} classes.`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        familyId,
        amountCents,
        paidAt: paidOn ? new Date(paidOn) : undefined,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
        allocations: applyTarget === "ALLOCATE_INVOICES" ? allocationsPayload : undefined,
        enrolmentId: applyTarget !== "ALLOCATE_INVOICES" && applyTarget !== "UNALLOCATED" ? applyTarget : undefined,
        customBlockLength: customBlockEnabled && isBlockPlan && customBlockValue ? customBlockValue : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
          <div className="space-y-2">
            <Label>Family</Label>
            <Select value={familyId} onValueChange={(value) => setFamilyId(value)} disabled={!!payment}>
              <SelectTrigger>
                <SelectValue placeholder="Select family" />
              </SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Payment total
            </div>
            <div className="text-lg font-semibold text-foreground">{formatCurrencyFromCents(amountCents)}</div>
            <div className="text-sm text-muted-foreground">
              {applyTarget === "ALLOCATE_INVOICES"
                ? `Allocated ${formatCurrencyFromCents(totalAllocationCents)}`
                : "Applies to the selected target."}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-background p-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">Applies to</div>
          <p className="text-sm text-muted-foreground">
            Choose whether this payment settles invoices, becomes family credit, or pays for a specific enrolment.
          </p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <Label>Apply target</Label>
            <Select value={applyTarget} onValueChange={setApplyTarget} disabled={!!payment}>
              <SelectTrigger>
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

          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={customBlockEnabled && blockPricing ? centsToDollarString(blockPricing.totalCents) : amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={customBlockEnabled && isBlockPlan}
              placeholder="0.00"
            />
          </div>
        </div>

        {isBlockPlan && selectedEnrolment?.plan ? (
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Block pricing</div>
                <div className="text-sm text-muted-foreground">
                  {planBlockLength} classes · {formatCurrencyFromCents(selectedEnrolment.plan.priceCents)}
                </div>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  if (!customBlockEnabled) {
                    setCustomBlockLength(String(planBlockLength));
                  }
                  setCustomBlockEnabled((prev) => !prev);
                }}
              >
                {customBlockEnabled ? "Use default block" : "Customize block"}
              </button>
            </div>

            {customBlockEnabled ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="custom-block-length">Number of classes</Label>
                  <Input
                    id="custom-block-length"
                    type="number"
                    min={planBlockLength}
                    value={customBlockLength}
                    onChange={(e) => setCustomBlockLength(e.target.value)}
                  />
                </div>
                {blockPricing ? (
                  <div className="text-sm text-muted-foreground">
                    Per class {formatCurrencyFromCents(blockPricing.perClassPriceCents)} · Total{" "}
                    {formatCurrencyFromCents(blockPricing.totalCents)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {applyTarget === "ALLOCATE_INVOICES" ? (
        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Allocations</div>
              <p className="text-sm text-muted-foreground">
                Select the open invoices this payment should settle.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatCurrencyFromCents(totalAllocationCents)} allocated
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {invoiceOptions.length === 0 ? (
              loadingInvoices ? (
                <>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`loading-${index}`}
                      className="rounded-xl border border-border/70 bg-muted/10 px-4 py-4"
                    >
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="mt-3 h-4 w-56" />
                      <Skeleton className="mt-3 h-10 w-28" />
                    </div>
                  ))}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                  No open invoices for this family.
                </div>
              )
            ) : (
              invoiceOptions.map((invoice) => {
                const selected = allocations[invoice.id] != null;
                const allocationValue = allocations[invoice.id] ?? "";

                return (
                  <label
                    key={invoice.id}
                    className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border/70 bg-muted/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-muted-foreground/60"
                        checked={selected}
                        onChange={() => toggleInvoice(invoice.id)}
                        aria-label={`Select invoice due ${invoice.dueAt ? format(invoice.dueAt, "d MMM yyyy") : "with no due date"}`}
                      />

                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-foreground">
                          Invoice due {invoice.dueAt ? format(invoice.dueAt, "d MMM yyyy") : "—"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatSentenceCase(invoice.status)} · Balance {formatCurrencyFromCents(invoice.balanceCents)}
                        </div>
                      </div>
                    </div>

                    <div className="w-full sm:w-32">
                      <Label className="mb-2 block text-xs text-muted-foreground">Allocate</Label>
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
                        disabled={!selected}
                      />
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-background p-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">Payment details</div>
          <p className="text-sm text-muted-foreground">Record how and when this payment was received.</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Method</Label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash, card, transfer" />
          </div>

          <div className="space-y-2">
            <Label>Paid on</Label>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Note</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional internal note"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {payment && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={submitting}
            >
              Delete payment
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !familyId || !amount}>
            {submitting ? "Saving..." : payment ? "Save payment" : "Record payment"}
          </Button>
        </div>
      </div>
    </form>
  );

  if (presentation === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-3xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>{payment ? "Edit payment" : "Record payment"}</SheetTitle>
            <SheetDescription>
              Apply payments against open invoices or leave them as family credit for later use.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{formContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            Apply payments against open invoices or leave them as family credit for later use.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
