"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { format } from "date-fns";
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
import { resolveWeeklyPayAheadSequence } from "@/server/invoicing/coverage";
import { computeBlockPayAheadCoverage } from "@/lib/billing/payAheadCalculator";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";

type Props = {
  summary: FamilyBillingSummary | null;
  onRefresh: (familyId: string) => Promise<void>;
};

type Enrolment = FamilyBillingSummary["enrolments"][number];

type HolidayRange = {
  startDate: Date | string;
  endDate: Date | string;
};

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
  const size = resolveBlockLength(enrolment.blockClassCount);
  return size > 0 ? size : 0;
}

function normalizeHolidays(holidays: HolidayRange[]) {
  return holidays
    .map((holiday) => ({
      startDate: asDate(holiday.startDate),
      endDate: asDate(holiday.endDate),
    }))
    .filter((holiday): holiday is { startDate: Date; endDate: Date } => Boolean(holiday.startDate && holiday.endDate));
}

function resolveCurrentPaidThrough(enrolment: Enrolment) {
  return (
    asDate(enrolment.paidThroughDate) ??
    asDate(enrolment.projectedCoverageEnd) ??
    asDate(enrolment.latestCoverageEnd) ??
    asDate(enrolment.startDate)
  );
}

function projectPaidAhead(
  enrolment: Enrolment,
  quantity: number,
  holidays: HolidayRange[],
  customBlockLength?: number | null
) {
  const today = new Date();
  const paidThrough = resolveCurrentPaidThrough(enrolment);

  if (enrolment.billingType === "PER_WEEK" && enrolment.durationWeeks) {
    const startDate = asDate(enrolment.startDate) ?? today;
    const endDate = asDate(enrolment.endDate);
    const assignedTemplates = (enrolment.assignedClasses ?? [])
      .map((template : any) => ({ dayOfWeek: template.dayOfWeek }))
      .filter((template : any): template is { dayOfWeek: number } => template.dayOfWeek != null);

    if (assignedTemplates.length === 0) {
      return { nextPaidThrough: paidThrough };
    }

    const payAhead = resolveWeeklyPayAheadSequence({
      startDate,
      endDate,
      paidThroughDate: paidThrough,
      durationWeeks: enrolment.durationWeeks,
      sessionsPerWeek: enrolment.sessionsPerWeek ?? null,
      quantity,
      assignedTemplates,
      holidays: normalizeHolidays(holidays),
      today,
    });

    return { nextPaidThrough: payAhead.coverageEnd ?? paidThrough };
  }

  if (enrolment.billingType === "PER_CLASS") {
    const anchorTemplate = enrolment.assignedClasses?.[0] ?? null;
    if (anchorTemplate?.dayOfWeek == null) {
      return { creditsRemaining: (enrolment.creditsRemaining ?? 0) + blockSize(enrolment) * quantity };
    }

    const effectiveBlockLength = customBlockLength ?? blockSize(enrolment);
    const range = computeBlockPayAheadCoverage({
      currentPaidThroughDate: paidThrough,
      enrolmentStartDate: asDate(enrolment.startDate) ?? today,
      enrolmentEndDate: asDate(enrolment.endDate),
      classTemplate: {
        dayOfWeek: anchorTemplate.dayOfWeek,
        startTime: anchorTemplate.startTime ?? null,
      },
      blocksPurchased: quantity,
      blockClassCount: blockSize(enrolment),
      creditsPurchased: effectiveBlockLength * quantity,
      holidays: normalizeHolidays(holidays),
    });

    return {
      coverageStart: range.coverageStart,
      nextPaidThrough: range.coverageEnd,
      creditsRemaining: (enrolment.creditsRemaining ?? 0) + range.creditsPurchased,
    };
  }

  return {};
}

export function PayAheadCard({ summary, onRefresh }: Props) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [customBlockLengths, setCustomBlockLengths] = React.useState<Record<string, string>>({});
  const [customBlockEnabled, setCustomBlockEnabled] = React.useState<Record<string, boolean>>({});
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
    setCustomBlockLengths({});
    setCustomBlockEnabled({});
  }, [summary, enrolments]);

  const handleToggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!summary) {
      toast.error("Select a family first.");
      return;
    }

    const invalidCustom = selected.find((id) => {
      const enrolment = enrolments.find((entry : any) => entry.id === id);
      if (!enrolment || enrolment.billingType !== "PER_CLASS") return false;
      if (!customBlockEnabled[id]) return false;
      const blockSizeValue = blockSize(enrolment);
      const parsedCustom = Number(customBlockLengths[id]);
      const customLength = Number.isInteger(parsedCustom) ? parsedCustom : null;
      return !customLength || customLength < blockSizeValue;
    });
    if (invalidCustom) {
      const enrolment = enrolments.find((entry : any) => entry.id === invalidCustom);
      const minValue = enrolment ? blockSize(enrolment) : 1;
      toast.error(`Custom block length must be at least ${minValue} classes.`);
      return;
    }

    const items = selected
      .map((id) => {
        const qty = quantities[id] ?? 1;
        const parsedCustom = Number(customBlockLengths[id]);
        const customLength = Number.isInteger(parsedCustom) ? parsedCustom : null;
        return {
          enrolmentId: id,
          quantity: qty > 0 ? qty : 1,
          customBlockLength: customBlockEnabled[id] && customLength ? customLength : undefined,
        };
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
    const totalCents = selectedEnrolments.reduce((sum : any, enrolment : any) => {
    const qty = quantities[enrolment.id] ?? 1;
    if (enrolment.billingType === "PER_CLASS" && customBlockEnabled[enrolment.id]) {
      const parsed = Number(customBlockLengths[enrolment.id]);
      const customLength = Number.isInteger(parsed) ? parsed : null;
      const pricing = calculateBlockPricing({
        priceCents: enrolment.planPriceCents,
        blockLength: blockSize(enrolment),
        customBlockLength: customLength ?? undefined,
      });
      return sum + pricing.totalCents * qty;
    }
    return sum + enrolment.planPriceCents * qty;
  }, 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Pay next block</CardTitle>
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
                const parsedCustom = Number(customBlockLengths[enrolment.id]);
                const customLength = Number.isInteger(parsedCustom) ? parsedCustom : null;
                const projection = projectPaidAhead(
                  enrolment,
                  qty,
                  summary.holidays ?? [],
                  customBlockEnabled[enrolment.id] ? customLength : null
                );
                const isWeekly = enrolment.billingType === "PER_WEEK";
                const isBlock = enrolment.billingType === "PER_CLASS";
                const planBlockLength = blockSize(enrolment);
                const pricing =
                  isBlock && customBlockEnabled[enrolment.id]
                    ? calculateBlockPricing({
                        priceCents: enrolment.planPriceCents,
                        blockLength: planBlockLength,
                        customBlockLength: customLength ?? undefined,
                      })
                    : null;
                const currentPaidThrough = resolveCurrentPaidThrough(enrolment);
                const currentLabel = isWeekly
                  ? `Paid to ${formatDate(currentPaidThrough)}`
                  : `Paid to ${formatDate(currentPaidThrough)}`;
                const projectedLabel = isWeekly
                  ? `→ ${projection.nextPaidThrough ? formatDate(projection.nextPaidThrough) : "—"}`
                  : projection.coverageStart && projection.nextPaidThrough
                    ? `Coverage ${formatDate(projection.coverageStart)} → ${formatDate(projection.nextPaidThrough)}`
                    : `→ ${formatDate(projection.nextPaidThrough)}`;

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
                          {formatCurrencyFromCents(
                            pricing ? pricing.totalCents * qty : enrolment.planPriceCents * qty
                          )}
                        </Badge>
                      </div>
                    </div>
                    {isBlock ? (
                      <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          {planBlockLength} classes · {formatCurrencyFromCents(enrolment.planPriceCents)}
                        </div>
                        <button
                          type="button"
                          className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                          onClick={() =>
                            setCustomBlockEnabled((prev) => {
                              const next = !prev[enrolment.id];
                              if (next) {
                                setCustomBlockLengths((current) => ({
                                  ...current,
                                  [enrolment.id]: current[enrolment.id] ?? String(planBlockLength),
                                }));
                              }
                              return { ...prev, [enrolment.id]: next };
                            })
                          }
                        >
                          {customBlockEnabled[enrolment.id] ? "Use default" : "Customize"}
                        </button>
                      </div>
                    ) : null}
                    {isBlock && customBlockEnabled[enrolment.id] ? (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`custom-block-${enrolment.id}`}>Classes</Label>
                          <Input
                            id={`custom-block-${enrolment.id}`}
                            type="number"
                            min={planBlockLength}
                            className="w-20"
                            value={customBlockLengths[enrolment.id] ?? String(planBlockLength)}
                            onChange={(e) =>
                              setCustomBlockLengths((prev) => ({
                                ...prev,
                                [enrolment.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                        {pricing ? (
                          <span>
                            Per class {formatCurrencyFromCents(pricing.perClassPriceCents)} · Total{" "}
                            {formatCurrencyFromCents(pricing.totalCents)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
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
