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
import { formatCurrencyFromCents } from "@/lib/currency";
import type { InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";

type LineItemDraft = {
  kind: InvoiceLineItemKind;
  description: string;
  quantity: string;
  unitPriceCents: string;
  amountCents?: string;
};

type InvoiceFormInvoice = {
  id: string;
  familyId: string;
  status: InvoiceStatus;
  issuedAt: Date;
  dueAt: Date | null;
  coverageStart?: Date | null;
  coverageEnd?: Date | null;
  creditsPurchased?: number | null;
  amountPaidCents: number;
  amountOwingCents: number;
  paidAt?: Date | null;
  lineItems: Array<{
    id: string;
    kind: InvoiceLineItemKind;
    description: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number | null;
  }>;
};

type InvoiceFormState = {
  familyId: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  coverageStart?: string;
  coverageEnd?: string;
  creditsPurchased?: string;
  lineItems: LineItemDraft[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  families: { id: string; name: string }[];
  statuses: InvoiceStatus[];
  invoice?: InvoiceFormInvoice | null;
  onSubmit: (payload: {
    familyId: string;
    status: InvoiceStatus;
    issuedAt?: Date | null;
    dueAt?: Date | null;
    coverageStart?: Date | null;
    coverageEnd?: Date | null;
    creditsPurchased?: number | null;
    lineItems: Array<{
      kind: InvoiceLineItemKind;
      description: string;
      quantity?: number;
      unitPriceCents?: number;
      amountCents?: number;
    }>;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  presentation?: "dialog" | "sheet";
};

function formatSentenceCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function InvoiceForm({
  open,
  onOpenChange,
  families,
  statuses,
  invoice,
  onSubmit,
  onDelete,
  presentation = "dialog",
}: Props) {
  const defaultState: InvoiceFormState = React.useMemo(
    () => ({
      familyId: invoice?.familyId ?? "",
      status: invoice?.status ?? statuses[0],
      issuedAt: invoice?.issuedAt
        ? format(invoice.issuedAt, "yyyy-MM-dd")
        : new Date().toISOString().slice(0, 10),
      dueAt: invoice?.dueAt ? format(invoice.dueAt, "yyyy-MM-dd") : "",
      coverageStart: invoice?.coverageStart ? format(invoice.coverageStart, "yyyy-MM-dd") : "",
      coverageEnd: invoice?.coverageEnd ? format(invoice.coverageEnd, "yyyy-MM-dd") : "",
      creditsPurchased: invoice?.creditsPurchased?.toString() ?? "",
      lineItems:
        invoice?.lineItems?.length && invoice.lineItems.length > 0
          ? invoice.lineItems.map((item) => ({
              kind: item.kind,
              description: item.description,
              quantity: item.quantity.toString(),
              unitPriceCents: item.unitPriceCents.toString(),
              amountCents: item.amountCents?.toString(),
            }))
          : [
              {
                kind: "ADJUSTMENT" as InvoiceLineItemKind,
                description: "",
                quantity: "1",
                unitPriceCents: "0",
                amountCents: "",
              },
            ],
    }),
    [invoice, statuses]
  );

  const [form, setForm] = React.useState<InvoiceFormState>(defaultState);
  const [submitting, setSubmitting] = React.useState(false);
  const lineItemKinds: InvoiceLineItemKind[] = ["ENROLMENT", "PRODUCT", "DISCOUNT", "ADJUSTMENT"];

  const computedTotal = React.useMemo(() => {
    return form.lineItems.reduce((sum, item) => {
      const quantity = Number.parseInt(item.quantity || "1", 10) || 1;
      const amount =
        item.amountCents && item.amountCents !== ""
          ? Number.parseInt(item.amountCents, 10)
          : (Number.parseInt(item.unitPriceCents || "0", 10) || 0) * quantity;
      return sum + amount;
    }, 0);
  }, [form.lineItems]);

  const hasValidLineItems = React.useMemo(
    () => form.lineItems.some((item) => item.description.trim().length > 0),
    [form.lineItems]
  );

  React.useEffect(() => {
    if (!open) return;
    setForm(defaultState);
    setSubmitting(false);
  }, [open, defaultState]);

  const updateLineItem = (index: number, patch: Partial<LineItemDraft>) => {
    setForm((prev) => {
      const next = [...prev.lineItems];
      next[index] = { ...next[index], ...patch };
      return { ...prev, lineItems: next };
    });
  };

  const removeLineItem = (index: number) => {
    setForm((prev) => {
      const next = prev.lineItems.filter((_, i) => i !== index);
      return { ...prev, lineItems: next.length ? next : prev.lineItems };
    });
  };

  const addLineItem = () => {
    setForm((prev) => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        {
          kind: "ADJUSTMENT" as InvoiceLineItemKind,
          description: "",
          quantity: "1",
          unitPriceCents: "0",
          amountCents: "",
        },
      ],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.familyId) return;
    const preparedLineItems = form.lineItems
      .filter((item) => item.description.trim().length > 0)
      .map((item) => ({
        kind: item.kind,
        description: item.description.trim(),
        quantity: Number.parseInt(item.quantity || "1", 10) || 1,
        unitPriceCents: Number.parseInt(item.unitPriceCents || "0", 10) || 0,
        amountCents:
          item.amountCents && item.amountCents !== ""
            ? Number.parseInt(item.amountCents, 10)
            : undefined,
      }))
      .filter((item) => item.quantity > 0);

    if (!preparedLineItems.length) return;

    setSubmitting(true);
    try {
      await onSubmit({
        familyId: form.familyId,
        status: form.status,
        issuedAt: form.issuedAt ? new Date(form.issuedAt) : undefined,
        dueAt: form.dueAt ? new Date(form.dueAt) : undefined,
        coverageStart: form.coverageStart ? new Date(form.coverageStart) : undefined,
        coverageEnd: form.coverageEnd ? new Date(form.coverageEnd) : undefined,
        creditsPurchased: form.creditsPurchased ? Number.parseInt(form.creditsPurchased, 10) : undefined,
        lineItems: preparedLineItems,
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

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Invoice total
            </div>
            <div className="text-lg font-semibold text-foreground">
              {formatCurrencyFromCents(computedTotal)}
            </div>
            <div className="text-sm text-muted-foreground">Calculated from the line items below.</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-background p-4">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Line items</div>
            <p className="text-sm text-muted-foreground">
              Add the charges or adjustments that make up this invoice.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addLineItem}>
            Add item
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {form.lineItems.map((item, index) => {
            const quantity = Number.parseInt(item.quantity || "1", 10) || 1;
            const derivedAmount =
              item.amountCents && item.amountCents !== ""
                ? Number.parseInt(item.amountCents, 10)
                : (Number.parseInt(item.unitPriceCents || "0", 10) || 0) * quantity;

            return (
              <div
                key={`${index}-${item.description}-${item.kind}`}
                className="rounded-xl border border-border/70 bg-muted/10 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">Item {index + 1}</div>
                  {form.lineItems.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(index)}>
                      Remove
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Kind</Label>
                    <Select
                      value={item.kind}
                      onValueChange={(value) => updateLineItem(index, { kind: value as InvoiceLineItemKind })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {lineItemKinds.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {formatSentenceCase(kind)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, { description: e.target.value })}
                      placeholder="Fee, credit, or adjustment"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, { quantity: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Unit price (cents)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={item.unitPriceCents}
                      onChange={(e) => updateLineItem(index, { unitPriceCents: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Amount override (optional)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={item.amountCents ?? ""}
                      onChange={(e) => updateLineItem(index, { amountCents: e.target.value })}
                      placeholder="Auto from qty x unit price"
                    />
                    <div className="text-xs text-muted-foreground">
                      Calculated: {formatCurrencyFromCents(derivedAmount)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Status and dates</div>
            <p className="text-sm text-muted-foreground">Control when this invoice is active and due.</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as InvoiceStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatSentenceCase(status)}
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
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Coverage metadata</div>
            <p className="text-sm text-muted-foreground">
              Optional billing context for coverage windows or purchased credits.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
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
        </div>
      </div>

      {invoice ? (
        <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <div>
            Paid so far: {formatCurrencyFromCents(invoice.amountPaidCents)} · Outstanding{" "}
            {formatCurrencyFromCents(invoice.amountOwingCents)}
          </div>
          {invoice.paidAt ? <div className="mt-1">Paid on {format(invoice.paidAt, "d MMM yyyy")}</div> : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !form.familyId || !hasValidLineItems}>
            {submitting ? "Saving..." : invoice ? "Save invoice" : "Create invoice"}
          </Button>
        </div>
      </div>
    </form>
  );

  if (presentation === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-4xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>{invoice ? "Edit invoice" : "New invoice"}</SheetTitle>
            <SheetDescription>
              {invoice ? "Update invoice details and status." : "Create a manual invoice for a family."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{formContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{invoice ? "Edit invoice" : "New invoice"}</DialogTitle>
          <DialogDescription>
            {invoice ? "Update invoice details and status." : "Create a manual invoice for a family."}
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
