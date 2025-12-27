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
import { formatCurrencyFromCents, dollarsToCents } from "@/lib/currency";

import type { BillingInvoice } from "@/server/billing/types";
import type { InvoiceStatus } from "@prisma/client";

type InvoiceFormState = {
  familyId: string;
  amount: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  coverageStart?: string;
  coverageEnd?: string;
  creditsPurchased?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  families: { id: string; name: string }[];
  statuses: InvoiceStatus[];
  invoice?: (BillingInvoice & { amountOwingCents: number }) | null;
  onSubmit: (payload: {
    familyId: string;
    amountCents: number;
    status: InvoiceStatus;
    issuedAt?: Date | null;
    dueAt?: Date | null;
    coverageStart?: Date | null;
    coverageEnd?: Date | null;
    creditsPurchased?: number | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function InvoiceForm({
  open,
  onOpenChange,
  families,
  statuses,
  invoice,
  onSubmit,
  onDelete,
}: Props) {
  const defaultState: InvoiceFormState = React.useMemo(
    () => ({
      familyId: invoice?.familyId ?? "",
      amount: invoice ? (invoice.amountCents / 100).toFixed(2) : "",
      status: invoice?.status ?? statuses[0],
      issuedAt: invoice?.issuedAt
        ? format(invoice.issuedAt, "yyyy-MM-dd")
        : new Date().toISOString().slice(0, 10),
      dueAt: invoice?.dueAt ? format(invoice.dueAt, "yyyy-MM-dd") : "",
      coverageStart: invoice?.coverageStart ? format(invoice.coverageStart, "yyyy-MM-dd") : "",
      coverageEnd: invoice?.coverageEnd ? format(invoice.coverageEnd, "yyyy-MM-dd") : "",
      creditsPurchased: invoice?.creditsPurchased?.toString() ?? "",
    }),
    [invoice, statuses]
  );

  const [form, setForm] = React.useState<InvoiceFormState>(defaultState);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(defaultState);
    setSubmitting(false);
  }, [open, defaultState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.familyId) return;
    const amountCents = dollarsToCents(form.amount || "0");
    if (!amountCents) return;

    setSubmitting(true);
    try {
      await onSubmit({
        familyId: form.familyId,
        amountCents,
        status: form.status,
        issuedAt: form.issuedAt ? new Date(form.issuedAt) : undefined,
        dueAt: form.dueAt ? new Date(form.dueAt) : undefined,
        coverageStart: form.coverageStart ? new Date(form.coverageStart) : undefined,
        coverageEnd: form.coverageEnd ? new Date(form.coverageEnd) : undefined,
        creditsPurchased: form.creditsPurchased
          ? Number.parseInt(form.creditsPurchased, 10)
          : undefined,
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
          <DialogTitle>{invoice ? "Edit invoice" : "New invoice"}</DialogTitle>
          <DialogDescription>
            {invoice ? "Update invoice details and status." : "Create a manual invoice for a family."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Family</Label>
              <Select
                value={form.familyId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, familyId: value }))}
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
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, status: value as InvoiceStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Issued</Label>
              <Input
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm((prev) => ({ ...prev, issuedAt: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Due</Label>
              <Input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm((prev) => ({ ...prev, dueAt: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Coverage start</Label>
              <Input
                type="date"
                value={form.coverageStart ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, coverageStart: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Coverage end</Label>
              <Input
                type="date"
                value={form.coverageEnd ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, coverageEnd: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Credits purchased</Label>
              <Input
                type="number"
                min="0"
                value={form.creditsPurchased ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, creditsPurchased: e.target.value }))}
              />
            </div>
          </div>

          {invoice ? (
            <div className="rounded-md bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              <div>
                Paid so far: {formatCurrencyFromCents(invoice.amountPaidCents)} · Owing{" "}
                {formatCurrencyFromCents(invoice.amountOwingCents)}
              </div>
              {invoice.paidAt ? <div>Paid on {format(invoice.paidAt, "d MMM yyyy")}</div> : null}
            </div>
          ) : null}

          <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
            <div>
              {invoice && onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={onDelete}
                  disabled={submitting}
                >
                  Delete invoice
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !form.familyId || !form.amount}>
                {submitting ? "Saving..." : invoice ? "Save invoice" : "Create invoice"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
