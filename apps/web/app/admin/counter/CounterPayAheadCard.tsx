"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { addWeeks, format, isAfter, max as maxDate } from "date-fns";
import { Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { FamilyBillingSummary } from "@/server/billing/getFamilyBillingSummary";
import { payAheadAndPay } from "@/server/billing/payAheadAndPay";

type Props = {
  summary: FamilyBillingSummary | null;
  onRefresh: (familyId: string) => Promise<void>;
};

type Enrolment = FamilyBillingSummary["enrolments"][number];

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value?: Date | string | null) {
  const d = asDate(value);
  if (!d) return "—";
  return format(d, "d MMM yyyy");
}

function blockSize(enrolment: Enrolment) {
  const size = enrolment.blockClassCount ?? 1;
  return size > 0 ? size : 0;
}

function projectPaidAhead(enrolment: Enrolment, quantity: number) {
  const today = new Date();
  if (enrolment.billingType === "PER_WEEK" && enrolment.durationWeeks) {
    const startDate = asDate(enrolment.startDate) ?? today;
    const paidThrough = asDate(enrolment.paidThroughDate);
    const latestCoverageEnd = asDate(enrolment.latestCoverageEnd);
    const endDate = asDate(enrolment.endDate);
    const start = maxDate([startDate, paidThrough ?? startDate, latestCoverageEnd ?? startDate, today]);
    if (endDate && isAfter(start, endDate)) return { nextPaidThrough: paidThrough };

    let currentStart = start;
    let nextPaidThrough = paidThrough ?? startDate;
    let periods = 0;

    for (let i = 0; i < quantity; i++) {
      if (endDate && isAfter(currentStart, endDate)) break;
      const rawEnd = addWeeks(currentStart, enrolment.durationWeeks);
      nextPaidThrough = endDate && isAfter(rawEnd, endDate) ? endDate : rawEnd;
      currentStart = nextPaidThrough;
      periods += 1;
    }

    return { nextPaidThrough: periods > 0 ? nextPaidThrough : paidThrough };
  }

  if (enrolment.billingType === "PER_CLASS") {
    const creditsAdded = blockSize(enrolment) * quantity;
    return { creditsRemaining: (enrolment.creditsRemaining ?? 0) + creditsAdded };
  }

  return {};
}

export function CounterPayAheadCard({ summary, onRefresh }: Props) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [method, setMethod] = React.useState("Cash");
  const [note, setNote] = React.useState("");
  const [paidOn, setPaidOn] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);

  const enrolments = React.useMemo(() => summary?.enrolments ?? [], [summary?.enrolments]);

  React.useEffect(() => {
    if (!summary) return;
    const activeIds = enrolments.filter((e : any) => e.status === "ACTIVE").map((e : any) => e.id);
    setSelected(activeIds);
    setQuantities(
      
      activeIds.reduce<Record<string, number>>((acc : any, id : string) => {
        acc[id] = 1;
        return acc;
      }, {})
    );
  }, [summary, enrolments]);

  const handleToggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!summary) {
      toast.error("Select a family first.");
      return;
    }

    const items = selected
      .map((id) => {
        const qty = quantities[id] ?? 1;
        return { enrolmentId: id, quantity: qty > 0 ? qty : 1 };
      })
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      toast.error("Choose at least one enrolment to bill ahead.");
      return;
    }

    setSubmitting(true);
    try {
      await payAheadAndPay({
        familyId: summary.family.id,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
        paidAt: paidOn ? new Date(paidOn) : undefined,
        items,
      });
      toast.success("Pay-ahead recorded and paid.");
      await onRefresh(summary.family.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to bill ahead right now.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEnrolments = enrolments.filter((e : any) => selected.includes(e.id));
  const totalCents = selectedEnrolments.reduce(
    (sum : any, enrolment : any) => sum + enrolment.planPriceCents * (quantities[enrolment.id] ?? 1),
    0
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Pay ahead</CardTitle>
          <p className="text-sm text-muted-foreground">Bill the next block and record payment in one step.</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <PlusCircle className="h-4 w-4" />
          {selectedEnrolments.length} selected
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {!summary ? (
          <p className="text-sm text-muted-foreground">Select a family to start.</p>
        ) : enrolments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrolments found for this family.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const all = enrolments.map((e : any) => e.id);
                  setSelected(all);
                  setQuantities(
                    all.reduce<Record<string, number>>((acc : any, id : any) => {
                      acc[id] = quantities[id] ?? 1;
                      return acc;
                    }, {})
                  );
                }}
              >
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected([]);
                }}
              >
                Clear
              </Button>
            </div>

            <div className="space-y-2">
              {enrolments.map((enrolment : any) => {
                const qty = quantities[enrolment.id] ?? 1;
                const projection = projectPaidAhead(enrolment, qty);
                const isWeekly = enrolment.billingType === "PER_WEEK";
                const currentLabel = isWeekly
                  ? `Paid to ${formatDate(enrolment.paidThroughDate)}`
                  : `${enrolment.creditsRemaining ?? 0} credits`;
                const projectedLabel = isWeekly
                  ? `→ ${projection.nextPaidThrough ? formatDate(projection.nextPaidThrough) : "—"}`
                  : `→ ${(projection.creditsRemaining ?? enrolment.creditsRemaining ?? 0).toString()} credits`;

                return (
                  <div
                    key={enrolment.id}
                    className={cn(
                      "rounded-md border p-3",
                      selected.includes(enrolment.id) ? "border-primary" : "border-muted"
                    )}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-muted-foreground/50"
                          checked={selected.includes(enrolment.id)}
                          onChange={() => handleToggle(enrolment.id)}
                        />
                        <div>
                          <div className="font-semibold leading-tight">{enrolment.studentName}</div>
                          <div className="text-xs text-muted-foreground">
                            {enrolment.planName} · {currentLabel} {projectedLabel}
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Blocks</Label>
                        <Input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          className="w-20"
                          value={qty}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [enrolment.id]: Number(e.target.value),
                            }))
                          }
                        />
                        <Badge variant="secondary" className="text-xs">
                          {formatCurrencyFromCents(enrolment.planPriceCents * qty)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Payment method</Label>
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

            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Total to charge</span>
              <span className="text-lg font-semibold">{formatCurrencyFromCents(totalCents)}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNote("")} disabled={submitting}>
                Clear note
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting || totalCents <= 0}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? "Processing..." : "Charge & mark paid"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
