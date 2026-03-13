"use client";

import * as React from "react";
import type { Enrolment, EnrolmentPlan, Level } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  dayOfWeekToName,
  formatScheduleWeekdayTime,
  scheduleDateAtMinutes,
  scheduleDateKey,
  scheduleMinutesSinceMidnight,
  ScheduleView,
  type NormalizedScheduleClass,
  type ScheduleClassClickContext,
} from "@/packages/schedule";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { changeEnrolment, previewChangeEnrolment } from "@/server/enrolment/changeEnrolment";
import type { EnrolmentTransferPreview } from "@/server/enrolment/enrolmentTransfer";
import {
  isDayOfWeekCompatibleWithPlan,
  SATURDAY_DAY_INDEX,
  resolvePlanDayConstraint,
} from "@/lib/enrolment/planDayCompatibility";
import { dayOfWeekFromScheduleDate } from "./dayUtils";
import { Badge } from "@/components/ui/badge";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
import { parseCapacityError, type CapacityExceededDetails } from "@/lib/capacityError";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";

type EnrolmentWithPlan = Enrolment & { plan: EnrolmentPlan; templateId: string };
const PAYMENT_METHODS = ["Cash", "Card", "Direct debit", "Client portal"] as const;

export function ChangeEnrolmentDialog({
  enrolment,
  enrolmentPlans,
  levels,
  open,
  onOpenChange,
  initialTemplateIds,
  onChanged,
  studentLevelId,
  presentation = "dialog",
}: {
  enrolment: EnrolmentWithPlan;
  enrolmentPlans: EnrolmentPlan[];
  levels: Level[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplateIds: string[];
  onChanged?: () => void;
  studentLevelId?: string | null;
  presentation?: "dialog" | "sheet";
}) {
  const router = useRouter();
  const [selectedTemplates, setSelectedTemplates] = React.useState<Record<string, NormalizedScheduleClass>>({});
  const [planId, setPlanId] = React.useState<string>(enrolment.plan.id);
  const [startDate, setStartDate] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState<{
    preview: EnrolmentTransferPreview;
    applyOverpaidCredit: boolean;
    takePaymentNow: boolean;
    paymentMethod: (typeof PAYMENT_METHODS)[number];
    paymentNote: string;
    paymentPaidAt: string;
    idempotencyKey: string;
  } | null>(null);
  const [capacityWarning, setCapacityWarning] = React.useState<{
    details: CapacityExceededDetails;
  } | null>(null);
  const preferredLevelId = studentLevelId ?? enrolment.plan.levelId ?? null;

  const selectedPlan = React.useMemo(
    () => enrolmentPlans.find((plan) => plan.id === planId) ?? enrolment.plan,
    [enrolment.plan, enrolmentPlans, planId]
  );

  const availablePlans = React.useMemo(() => {
    const levelFiltered = enrolmentPlans.filter(
      (plan) => !preferredLevelId || plan.levelId === preferredLevelId
    );
    if (!levelFiltered.find((plan) => plan.id === enrolment.plan.id)) {
      return [enrolment.plan, ...levelFiltered];
    }
    return levelFiltered;
  }, [enrolment.plan, enrolmentPlans, preferredLevelId]);

  const selectionRequirement = React.useMemo(
    () => getSelectionRequirement(selectedPlan),
    [selectedPlan]
  );
  const planIsWeekly = selectedPlan.billingType === "PER_WEEK";
  const planDayConstraint = resolvePlanDayConstraint(selectedPlan);

  React.useEffect(() => {
    if (open) {
      const start = enrolment.startDate instanceof Date ? enrolment.startDate : new Date(enrolment.startDate);
      setStartDate(scheduleDateKey(start));
      setPlanId(enrolment.plan.id);
      setSaving(false);
    }
  }, [enrolment.plan.id, enrolment.startDate, open]);

  React.useEffect(() => {
    if (!availablePlans.find((plan) => plan.id === planId)) {
      setPlanId(availablePlans[0]?.id ?? enrolment.plan.id);
    }
  }, [availablePlans, enrolment.plan.id, planId]);

  React.useEffect(() => {
    if (!open) {
      setSelectedTemplates({});
      return;
    }
    if (!initialTemplateIds.length) return;
    const map: Record<string, NormalizedScheduleClass> = {};
    initialTemplateIds.forEach((id) => {
      const start = enrolment.startDate instanceof Date ? enrolment.startDate : new Date(enrolment.startDate);
      const end = enrolment.endDate
        ? enrolment.endDate instanceof Date
          ? enrolment.endDate
          : new Date(enrolment.endDate)
        : start;
      const dayOfWeek = enrolment.plan.isSaturdayOnly ? SATURDAY_DAY_INDEX : dayOfWeekFromScheduleDate(start);
      const dayName = dayOfWeekToName(dayOfWeek);

      map[id] = {
        id,
        templateId: id,
        startTime: start,
        endTime: end,
        durationMin: 0,
        template: { dayOfWeek } as unknown as NormalizedScheduleClass["template"],
        levelId: enrolment.plan.levelId,
        dayOfWeek,
        dayName,
      } as unknown as NormalizedScheduleClass;
    });
    setSelectedTemplates(map);
  }, [enrolment, initialTemplateIds, open]);

  React.useEffect(() => {
    if (!open) return;
    setSelectedTemplates((prev) => {
      const nextEntries = Object.entries(prev).filter(([, occurrence]) =>
        classMatchesPlan(selectedPlan, occurrence)
      );
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [open, selectedPlan]);

  const selectedTemplateIds = React.useMemo(
    () => Object.keys(selectedTemplates),
    [selectedTemplates]
  );

  const selectionSatisfied =
    selectionRequirement.requiredCount === 0
      ? selectedTemplateIds.length <= selectionRequirement.maxCount
      : selectedTemplateIds.length === selectionRequirement.requiredCount;

  const canSubmit = selectionSatisfied && Boolean(startDate) && !saving;
  const effectiveLevelId = studentLevelId ?? selectedPlan.levelId ?? null;
  const effectiveLevel = levels.find((level) => level.id === effectiveLevelId) ?? null;
  const scheduleBlocked = !effectiveLevelId;
  const scheduleClassFilter = React.useCallback(
    (occurrence: NormalizedScheduleClass) => classMatchesPlan(selectedPlan, occurrence),
    [selectedPlan]
  );
  const scheduleAvailabilityLabel = React.useMemo(() => {
    if (planDayConstraint === "saturday") {
      return "Showing Saturday classes for the selected plan.";
    }
    if (planDayConstraint === "weekday") {
      return "Showing weekday classes for the selected plan.";
    }
    return "Showing all classes for this level.";
  }, [planDayConstraint]);

  const onClassClick = (occurrence: NormalizedScheduleClass, context?: ScheduleClassClickContext) => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== selectedPlan.levelId) {
      toast.error("Select classes that match the enrolment plan level.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== effectiveLevelId) {
      toast.error("Select classes that match the student's level.");
      return;
    }

    if (!classMatchesPlan(selectedPlan, occurrence)) {
      toast.error(incompatibleClassMessage(selectedPlan, occurrence));
      return;
    }

    const alignedOccurrence =
      context?.columnDate ? alignOccurrenceToColumn(occurrence, context.columnDate) : occurrence;

    setSelectedTemplates((prev) => {
      const alreadySelected = Boolean(prev[occurrence.templateId]);
      if (alreadySelected) {
        const next = { ...prev };
        delete next[occurrence.templateId];
        return next;
      }

      if (planIsWeekly && Object.keys(prev).length >= selectionRequirement.maxCount) {
        toast.error(selectionRequirement.helper);
        return prev;
      }

      if (Object.keys(prev).length >= selectionRequirement.maxCount) {
        toast.error(selectionRequirement.helper);
        return prev;
      }
      return { ...prev, [occurrence.templateId]: alignedOccurrence };
    });
  };

  const handleSave = async (allowOverload?: boolean) => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (!canSubmit) {
      toast.error(selectionRequirement.helper);
      return;
    }
    if (!confirming) {
      toast.error("Preview the transfer first.");
      return;
    }

    setSaving(true);
    try {
      const result = await changeEnrolment({
        enrolmentId: enrolment.id,
        templateIds: selectedTemplateIds,
        startDate: `${startDate}T00:00:00`,
        effectiveLevelId,
        planId: planId || undefined,
        allowOverload,
        idempotencyKey: confirming.idempotencyKey,
        applyOverpaidCredit: confirming.applyOverpaidCredit,
        takePaymentNow: confirming.takePaymentNow,
        paymentMethod: confirming.takePaymentNow ? confirming.paymentMethod : undefined,
        paymentNote: confirming.takePaymentNow ? confirming.paymentNote : undefined,
        paymentPaidAt: confirming.takePaymentNow ? `${confirming.paymentPaidAt}T00:00:00` : undefined,
      });
      if (!result.ok) {
        if (result.error.code === "CAPACITY_EXCEEDED") {
          setCapacityWarning({ details: result.error.details });
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success("Enrolment updated.");
      onOpenChange(false);
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      const details = parseCapacityError(err);
      if (details) {
        setCapacityWarning({ details });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Unable to change enrolment.");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (!canSubmit) {
      toast.error(selectionRequirement.helper);
      return;
    }

    setSaving(true);
    try {
      const preview = await previewChangeEnrolment({
        enrolmentId: enrolment.id,
        templateIds: selectedTemplateIds,
        startDate: `${startDate}T00:00:00`,
        effectiveLevelId,
        planId: planId || undefined,
        applyOverpaidCredit: true,
      });

      if (preview.ok) {
        setConfirming({
          preview: preview.data,
          applyOverpaidCredit: true,
          takePaymentNow: false,
          paymentMethod: "Cash",
          paymentNote: "",
          paymentPaidAt: new Date().toISOString().slice(0, 10),
          idempotencyKey: crypto.randomUUID(),
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to preview enrolment changes.");
    } finally {
      setSaving(false);
    }
  };

  const formatTemplateLabel = (template: { name: string; dayOfWeek: number | null }) => {
    const dayLabel = template.dayOfWeek === null ? "—" : dayOfWeekToName(template.dayOfWeek);
    return `${template.name} · ${dayLabel}`;
  };

  const transferBreakdown = React.useMemo(() => {
    if (!confirming) return null;
    return buildTransferAllocationPlan(confirming.preview, confirming.applyOverpaidCredit);
  }, [confirming]);

  const mainContent = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plan
          </div>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="min-w-[220px]">
              <SelectValue placeholder="Select plan" />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  <span className="flex items-center gap-2">
                    <span>
                      {plan.name} · {plan.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                    </span>
                    {plan.isSaturdayOnly ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase leading-none">
                        Saturday
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            {selectionRequirement.helper}
          </div>
          {availablePlans.length === 0 ? (
            <div className="text-xs text-destructive">
              No enrolment plans are available for this selection.
            </div>
          ) : null}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Change date
          </div>
          <input
            type="date"
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div className="flex items-center gap-2 text-[11px] font-semibold leading-none">
            <Badge variant="secondary" className="font-semibold">
              Showing classes for {effectiveLevel?.name ?? "—"}
            </Badge>
          </div>
          {scheduleBlocked ? (
            <span className="text-destructive">Set student level first</span>
          ) : (
            <span>{scheduleAvailabilityLabel}</span>
          )}
        </div>
        {scheduleBlocked ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Set student level first.
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ScheduleView
              levels={levels}
              onClassClick={onClassClick}
              allowTemplateMoves={false}
              defaultViewMode="week"
              mode="enrolmentChange"
              selectedTemplateIds={selectedTemplateIds}
              classFilter={scheduleClassFilter}
              filters={{ levelId: effectiveLevelId, teacherId: null }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm">
        <div className="space-y-1">
          <div className="font-medium">Selected classes</div>
          <div className="text-muted-foreground">
            {selectionRequirement.requiredCount === 0
              ? `${selectedTemplateIds.length}/${selectionRequirement.maxCount} selected (optional)`
              : `${selectedTemplateIds.length}/${selectionRequirement.requiredCount} selected`}{" "}
            • {startDate ? `Change date ${startDate}` : "Select a change date"}
          </div>
          {selectedTemplateIds.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedTemplateIds.map((id) => {
                const entry = selectedTemplates[id];
                return (
                  <span key={id} className="rounded border bg-background px-2 py-1 text-xs">
                    {entry?.template?.name ?? "Class"} ·{" "}
                    {entry ? formatScheduleWeekdayTime(entry.startTime) : ""}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground">Select class templates on the schedule.</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handlePreview()} disabled={!canSubmit}>
            {saving ? "Loading..." : "Review transfer"}
          </Button>
        </div>
      </div>
    </div>
  );

  const confirmationContent = (
    <>
      <div className="space-y-4 text-sm">
        <div>
          <span className="font-medium">Current templates:</span>{" "}
          {confirming?.preview.oldTemplates.length
            ? confirming.preview.oldTemplates.map(formatTemplateLabel).join(", ")
            : "—"}
        </div>
        <div>
          <span className="font-medium">New templates:</span>{" "}
          {confirming?.preview.newTemplates.length
            ? confirming.preview.newTemplates.map(formatTemplateLabel).join(", ")
            : "—"}
        </div>
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Old outstanding
              </div>
              <div className="mt-1 font-semibold">
                {formatCurrencyFromCents(confirming?.preview.oldOutstandingCents ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                New block charge
              </div>
              <div className="mt-1 font-semibold">
                {formatCurrencyFromCents(confirming?.preview.newBlockChargeCents ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paid future credit
              </div>
              <div className="mt-1 font-semibold">
                {formatCurrencyFromCents(-(confirming?.preview.oldOverpaidCreditCents ?? 0))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prior invoice payments
              </div>
              <div className="mt-1 font-semibold">
                {formatCurrencyFromCents(-(confirming?.preview.releasedPaymentCreditCents ?? 0))}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total due today</span>
              <span className="font-semibold">
                {formatCurrencyFromCents(transferBreakdown?.totalDueTodayCents ?? 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border bg-background p-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="apply-transfer-credit"
              checked={confirming?.applyOverpaidCredit ?? false}
              onCheckedChange={(checked) =>
                setConfirming((prev) =>
                  prev
                    ? {
                        ...prev,
                        applyOverpaidCredit: Boolean(checked),
                      }
                    : prev
                )
              }
            />
            <div className="space-y-1">
              <Label htmlFor="apply-transfer-credit">Apply old paid credit to the new invoice</Label>
              <p className="text-xs text-muted-foreground">
                Apply {formatCurrencyFromCents(-(confirming?.preview.oldOverpaidCreditCents ?? 0))} as transfer
                account credit.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="take-transfer-payment"
              checked={confirming?.takePaymentNow ?? false}
              onCheckedChange={(checked) =>
                setConfirming((prev) =>
                  prev
                    ? {
                        ...prev,
                        takePaymentNow: Boolean(checked),
                      }
                    : prev
                )
              }
            />
            <div className="space-y-1">
              <Label htmlFor="take-transfer-payment">Take payment now</Label>
              <p className="text-xs text-muted-foreground">
                Cash will allocate to the old balance first, then the new invoice.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recommended Allocation
          </div>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>Existing payments to old invoice</span>
              <span>{formatCurrencyFromCents(transferBreakdown?.recommendedAllocations.releasedPaymentToOldInvoiceCents ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Existing payments to new invoice</span>
              <span>{formatCurrencyFromCents(transferBreakdown?.recommendedAllocations.releasedPaymentToNewInvoiceCents ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Transfer credit to new invoice</span>
              <span>{formatCurrencyFromCents(transferBreakdown?.recommendedAllocations.overpaidCreditToNewInvoiceCents ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash to old invoice</span>
              <span>{formatCurrencyFromCents(transferBreakdown?.recommendedAllocations.cashToOldInvoiceCents ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cash to new invoice</span>
              <span>{formatCurrencyFromCents(transferBreakdown?.recommendedAllocations.cashToNewInvoiceCents ?? 0)}</span>
            </div>
          </div>
        </div>

        {confirming?.takePaymentNow ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select
                value={confirming.paymentMethod}
                onValueChange={(value) =>
                  setConfirming((prev) =>
                    prev
                      ? {
                          ...prev,
                          paymentMethod: value as (typeof PAYMENT_METHODS)[number],
                        }
                      : prev
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-paid-at">Paid on</Label>
              <Input
                id="transfer-paid-at"
                type="date"
                value={confirming.paymentPaidAt}
                onChange={(event) =>
                  setConfirming((prev) =>
                    prev
                      ? {
                          ...prev,
                          paymentPaidAt: event.target.value,
                        }
                      : prev
                  )
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="transfer-payment-note">Payment note</Label>
              <Input
                id="transfer-payment-note"
                value={confirming.paymentNote}
                onChange={(event) =>
                  setConfirming((prev) =>
                    prev
                      ? {
                          ...prev,
                          paymentNote: event.target.value,
                        }
                      : prev
                  )
                }
                placeholder="Optional admin note"
              />
            </div>
          </div>
        ) : null}

        <div>
          <span className="font-medium">Old paid through:</span>{" "}
          {formatBrisbaneDate(confirming?.preview.oldPaidThroughDate ?? null)}
        </div>
      </div>
      {presentation === "sheet" ? (
        <SheetFooter className="px-0 pb-0">
          <Button
            variant="outline"
            onClick={() => setConfirming(null)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
          >
            Confirm transfer
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setConfirming(null)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
          >
            Confirm transfer
          </Button>
        </DialogFooter>
      )}
    </>
  );

  return (
    <>
      {presentation === "sheet" ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-[1100px]">
            <SheetHeader className="px-0">
              <SheetTitle>Change enrolment</SheetTitle>
              <SheetDescription>
                Select the new class templates for this enrolment. The change date applies to all selected classes.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-2">{mainContent}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="w-[calc(100vw-3rem)] max-w-[1200px]">
            <DialogHeader>
              <DialogTitle>Change enrolment</DialogTitle>
              <DialogDescription>
                Select the new class templates for this enrolment. The change date applies to all selected classes.
              </DialogDescription>
            </DialogHeader>
            {mainContent}
          </DialogContent>
        </Dialog>
      )}

      {presentation === "sheet" ? (
        <Sheet open={Boolean(confirming)} onOpenChange={(next) => (!next ? setConfirming(null) : null)}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader className="px-0">
              <SheetTitle>Review transfer</SheetTitle>
              <SheetDescription>
                Review the billing impact before moving this enrolment.
              </SheetDescription>
            </SheetHeader>
            {confirmationContent}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={Boolean(confirming)} onOpenChange={(next) => (!next ? setConfirming(null) : null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Review transfer</DialogTitle>
              <DialogDescription>
                Review the billing impact before moving this enrolment.
              </DialogDescription>
            </DialogHeader>
            {confirmationContent}
          </DialogContent>
        </Dialog>
      )}

      <CapacityOverloadDialog
        open={Boolean(capacityWarning)}
        details={capacityWarning?.details ?? null}
        busy={saving}
        presentation={presentation}
        onCancel={() => setCapacityWarning(null)}
        onConfirm={() => {
          setCapacityWarning(null);
          void handleSave(true);
        }}
      />
    </>
  );
}

function buildTransferAllocationPlan(preview: EnrolmentTransferPreview, applyOverpaidCredit: boolean) {
  let remainingOld = preview.oldOutstandingCents;
  let remainingNew = preview.newBlockChargeCents;
  let releasedRemaining = preview.releasedPaymentCreditCents;

  const releasedPaymentToOldInvoiceCents = Math.min(releasedRemaining, remainingOld);
  releasedRemaining -= releasedPaymentToOldInvoiceCents;
  remainingOld -= releasedPaymentToOldInvoiceCents;

  const releasedPaymentToNewInvoiceCents = Math.min(releasedRemaining, remainingNew);
  releasedRemaining -= releasedPaymentToNewInvoiceCents;
  remainingNew -= releasedPaymentToNewInvoiceCents;

  const overpaidCreditToNewInvoiceCents = applyOverpaidCredit
    ? Math.min(preview.oldOverpaidCreditCents, remainingNew)
    : 0;
  remainingNew -= overpaidCreditToNewInvoiceCents;

  return {
    totalDueTodayCents: remainingOld + remainingNew,
    recommendedAllocations: {
      releasedPaymentToOldInvoiceCents,
      releasedPaymentToNewInvoiceCents,
      overpaidCreditToNewInvoiceCents,
      cashToOldInvoiceCents: remainingOld,
      cashToNewInvoiceCents: remainingNew,
    },
  };
}

function alignOccurrenceToColumn(occurrence: NormalizedScheduleClass, columnDate: Date) {
  const startMinutes = scheduleMinutesSinceMidnight(occurrence.startTime);
  const alignedStart = scheduleDateAtMinutes(columnDate, startMinutes);
  const alignedEnd = new Date(alignedStart.getTime() + occurrence.durationMin * 60 * 1000);
  return {
    ...occurrence,
    startTime: alignedStart,
    endTime: alignedEnd,
  };
}

function classMatchesPlan(plan: EnrolmentPlan, occurrence: Pick<NormalizedScheduleClass, "dayOfWeek" | "template">) {
  const dayOfWeek =
    typeof occurrence.dayOfWeek === "number" ? occurrence.dayOfWeek : occurrence.template?.dayOfWeek ?? null;
  return isDayOfWeekCompatibleWithPlan(plan, dayOfWeek);
}

function incompatibleClassMessage(
  plan: EnrolmentPlan,
  occurrence: Pick<NormalizedScheduleClass, "dayOfWeek" | "template">
) {
  if (!classMatchesPlan(plan, occurrence)) {
    return planDayCompatibilityMessage(plan);
  }
  return "Select classes that match the selected plan.";
}

function planDayCompatibilityMessage(plan: EnrolmentPlan) {
  const constraint = resolvePlanDayConstraint(plan);
  if (constraint === "saturday") {
    return "Saturday-only plans can only be used for Saturday classes.";
  }
  if (constraint === "weekday") {
    return "Use a Saturday-only plan for Saturday classes.";
  }
  return "Select classes that match the selected plan.";
}
