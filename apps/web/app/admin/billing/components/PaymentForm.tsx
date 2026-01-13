"use client";

import * as React from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrencyFromCents, dollarsToCents, centsToDollarString } from "@/lib/currency";

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
    idempotencyKey?: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
};

type InvoiceOption = {
  id: string;
  dueAt: Date | null;
  status: string;
  amountCents: number;
  amountPaidCents: number;
  balanceCents: number;
};

export function PaymentForm({
  open,
  onOpenChange,
  families,
  payment,
  onSubmit,
  onDelete,
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
  const [enrolmentOptions, setEnrolmentOptions] = React.useState<Array<{ id: string; label: string }>>([]);
  const [applyTarget, setApplyTarget] = React.useState<string>("ALLOCATE_INVOICES");
  const [loadingInvoices, setLoadingInvoices] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFamilyId(payment?.familyId ?? "");
    setAmount(payment ? centsToDollarString(payment.amountCents) : "");
    setMethod(payment?.method ?? "Cash");
    setNote(payment?.note ?? "");
    setPaidOn(payment?.paidAt ? format(payment.paidAt, "yyyy-MM-dd") : new Date().toISOString().slice(0, 10));
    setApplyTarget("ALLOCATE_INVOICES");

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

  const totalCents = allocationCents.reduce((sum, a) => sum + a.amountCents, 0);

  const handleToggle = (invoiceId: string) => {
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
    const amountCents = dollarsToCents(amount || "0");
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

    if (applyTarget === "ALLOCATE_INVOICES" && allocationsPayload.length === 0) {
      toast.error("Add at least one allocation or choose another apply target.");
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
        idempotencyKey: crypto.randomUUID(),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            Apply payments against open invoices or leave unapplied for later allocation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Family</Label>
              <Select
                value={familyId}
                onValueChange={(value) => setFamilyId(value)}
                disabled={!!payment}
              >
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
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Method</Label>
              <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash, card, etc." />
            </div>
            <div className="space-y-2">
              <Label>Paid on</Label>
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Apply to</Label>
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

          {applyTarget === "ALLOCATE_INVOICES" ? (
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-medium">
                <span>Allocate to invoices</span>
                <span className="text-muted-foreground">
                  Total {formatCurrencyFromCents(totalCents)} / Payment {formatCurrencyFromCents(dollarsToCents(amount || "0"))}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Allocate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceOptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        {loadingInvoices ? "Loading invoices..." : "No open invoices for this family."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoiceOptions.map((invoice) => {
                      const selected = allocations[invoice.id] != null;
                      const allocationValue = allocations[invoice.id] ?? "";
                      return (
                        <TableRow key={invoice.id} className={cn(!selected && "opacity-70")}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-muted-foreground/60"
                              checked={selected}
                              onChange={() => handleToggle(invoice.id)}
                              aria-label={`Select invoice ${invoice.id}`}
                            />
                          </TableCell>
                          <TableCell className="space-y-1">
                            <div className="text-sm font-medium">Invoice #{invoice.id}</div>
                            <div className="text-xs text-muted-foreground">
                              Due {invoice.dueAt ? format(invoice.dueAt, "d MMM yyyy") : "—"} · {invoice.status.toLowerCase()}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatCurrencyFromCents(invoice.balanceCents)}
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
                              disabled={!selected}
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
          ) : null}

          <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
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
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !familyId || !amount}>
                {submitting ? "Saving..." : payment ? "Save payment" : "Record payment"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
