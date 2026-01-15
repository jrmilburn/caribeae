"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EnrolmentPlan, Level } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatScheduleWeekdayTime,
  scheduleDateAtMinutes,
  scheduleDateKey,
  scheduleMinutesSinceMidnight,
  ScheduleView,
  type NormalizedScheduleClass,
  type ScheduleClassClickContext,
} from "@/packages/schedule";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
import { createEnrolmentsFromSelection } from "@/server/enrolment/createEnrolmentsFromSelection";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { toast } from "sonner";
import { isSaturdayOccurrence, resolveSelectionDay } from "./dayUtils";
import { Badge } from "@/components/ui/badge";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";
import { formatCurrencyFromCents } from "@/lib/currency";
import { parseCapacityError, type CapacityExceededDetails } from "@/lib/capacityError";

export function AddEnrolmentDialog({
  open,
  onOpenChange,
  studentId,
  levels,
  enrolmentPlans,
  studentLevelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
  studentLevelId?: string | null;
}) {
  const router = useRouter();
  const [selectedTemplates, setSelectedTemplates] = React.useState<Record<string, NormalizedScheduleClass>>(
    {}
  );
  const [planId, setPlanId] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [startDateTouched, setStartDateTouched] = React.useState(false);
  const [customBlockEnabled, setCustomBlockEnabled] = React.useState(false);
  const [customBlockLength, setCustomBlockLength] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [capacityWarning, setCapacityWarning] = React.useState<CapacityExceededDetails | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSelectedTemplates({});
      setPlanId("");
      setStartDate("");
      setStartDateTouched(false);
      setCustomBlockEnabled(false);
      setCustomBlockLength("");
      setSaving(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && !startDate) {
      setStartDate(scheduleDateKey(new Date()));
    }
  }, [open, startDate]);

  const selectedTemplateIds = React.useMemo(
    () => Object.keys(selectedTemplates),
    [selectedTemplates]
  );
  const selectionDayType = React.useMemo(
    () => resolveSelectionDay(selectedTemplates),
    [selectedTemplates]
  );
  const selectedLevelId = React.useMemo(() => {
    const first = selectedTemplateIds[0];
    if (!first) return null;
    const template = selectedTemplates[first];
    return template?.levelId ?? template?.template?.levelId ?? null;
  }, [selectedTemplateIds, selectedTemplates]);

  const availablePlans = React.useMemo(() => {
    const levelFiltered = enrolmentPlans.filter((p) => !selectedLevelId || p.levelId === selectedLevelId);
    if (selectionDayType === "saturday") {
      return levelFiltered.filter((plan) => plan.isSaturdayOnly || plan.billingType === "PER_WEEK");
    }
    if (selectionDayType === "weekday") {
      return levelFiltered.filter((plan) => !plan.isSaturdayOnly || plan.billingType === "PER_WEEK");
    }
    return levelFiltered;
  }, [enrolmentPlans, selectedLevelId, selectionDayType]);

  React.useEffect(() => {
    if (!availablePlans.find((p) => p.id === planId)) {
      setPlanId(availablePlans[0]?.id ?? "");
    }
  }, [availablePlans, planId]);

  React.useEffect(() => {
    if (!selectedTemplateIds.length) return;
    const sortedDates = selectedTemplateIds
      .map((id) => selectedTemplates[id]?.startTime)
      .filter(Boolean)
      .map((date) => scheduleDateKey(date as Date))
      .sort();
    if (!sortedDates.length) return;
    if (!startDateTouched) {
      setStartDate(sortedDates[0]);
    }
  }, [selectedTemplateIds, selectedTemplates, startDateTouched]);

  const selectedPlan = React.useMemo(
    () => availablePlans.find((p) => p.id === planId) ?? null,
    [availablePlans, planId]
  );
  const planIsWeekly = selectedPlan?.billingType === "PER_WEEK";
  const planIsBlock = selectedPlan?.billingType === "PER_CLASS";
  const planBlockLength = selectedPlan ? resolveBlockLength(selectedPlan.blockClassCount) : 1;
  const parsedCustomBlockLength = Number(customBlockLength);
  const customBlockValue = Number.isInteger(parsedCustomBlockLength) ? parsedCustomBlockLength : null;
  const blockPricing =
    selectedPlan && planIsBlock
      ? calculateBlockPricing({
          priceCents: selectedPlan.priceCents,
          blockLength: planBlockLength,
          customBlockLength: customBlockEnabled ? customBlockValue ?? undefined : undefined,
        })
      : null;
  const planDay = selectedPlan
    ? selectedPlan.isSaturdayOnly
      ? "saturday"
      : planIsWeekly
        ? "any"
        : "weekday"
    : null;

  const selectionRequirement = React.useMemo(
    () =>
      selectedPlan
        ? getSelectionRequirement(selectedPlan)
        : { requiredCount: 1, maxCount: 1, helper: "Select a plan to see class requirements." },
    [selectedPlan]
  );

  const selectionSatisfied =
    selectionRequirement.requiredCount === 0
      ? selectedTemplateIds.length <= selectionRequirement.maxCount
      : selectedTemplateIds.length === selectionRequirement.requiredCount;

  const canSubmit = !!planId && !saving && Boolean(startDate) && selectionSatisfied;
  const effectiveLevelId = studentLevelId ?? null;
  const effectiveLevel = levels.find((level) => level.id === effectiveLevelId) ?? null;
  const scheduleBlocked = !effectiveLevelId;

  React.useEffect(() => {
    if (!selectedPlan || !planIsBlock) {
      setCustomBlockEnabled(false);
      setCustomBlockLength("");
      return;
    }
    if (!customBlockEnabled) {
      setCustomBlockLength(String(planBlockLength));
    }
  }, [selectedPlan, planIsBlock, planBlockLength, customBlockEnabled]);

  const onClassClick = (
    occurrence: NormalizedScheduleClass,
    context?: ScheduleClassClickContext
  ) => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    const planLevelId = selectedPlan?.levelId ?? null;
    if (planLevelId && occurrence.levelId && occurrence.levelId !== planLevelId) {
      toast.error("Select classes that match the enrolment plan level.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== effectiveLevelId) {
      toast.error("Select classes that match the student's level.");
      return;
    }

    const occurrenceIsSaturday = isSaturdayOccurrence(occurrence);
    const currentDayType = resolveSelectionDay(selectedTemplates);
    if (!planIsWeekly && planDay === "saturday" && !occurrenceIsSaturday) {
      toast.error("Saturday-only plans can only be used for Saturday classes.");
      return;
    }
    if (!planIsWeekly && planDay === "weekday" && occurrenceIsSaturday) {
      toast.error("Use a Saturday-only plan for Saturday classes.");
      return;
    }
    if (
      !planIsWeekly &&
      currentDayType &&
      currentDayType !== (occurrenceIsSaturday ? "saturday" : "weekday")
    ) {
      toast.error("Select classes that match the plan's day.");
      return;
    }

    const alignedOccurrence =
      context?.columnDate ? alignOccurrenceToColumn(occurrence, context.columnDate) : occurrence;
    const occurrenceDateKey = context?.columnDateKey ?? scheduleDateKey(occurrence.startTime);

    setSelectedTemplates((prev) => {
      const alreadySelected = Boolean(prev[occurrence.templateId]);
      if (alreadySelected) {
        const next = { ...prev };
        delete next[occurrence.templateId];
        return next;
      }

      if (planIsWeekly && Object.keys(prev).length >= selectionRequirement.maxCount) {
        if (!startDateTouched) {
          setStartDate(occurrenceDateKey);
        }
        return prev;
      }

      const count = Object.keys(prev).length;
      const maxSelectable = selectionRequirement.maxCount;
      if (count >= maxSelectable) {
        toast.error(`You can select up to ${maxSelectable} classes at once. Deselect one to add another.`);
        return prev;
      }

      const nextDayType = resolveSelectionDay({
        ...prev,
        [occurrence.templateId]: alignedOccurrence,
      });
      if (nextDayType === "mixed") {
        toast.error("Select classes on the same day type for this enrolment.");
        return prev;
      }

      const next = { ...prev, [occurrence.templateId]: alignedOccurrence };
      if (!startDateTouched) {
        setStartDate(occurrenceDateKey);
      }
      return next;
    });
  };

  const handleCreate = async (allowOverload?: boolean) => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (!selectedPlan || !canSubmit) {
      toast.error("Select a plan, classes, and start date.");
      return;
    }
    if (customBlockEnabled && planIsBlock && (!customBlockValue || customBlockValue < planBlockLength)) {
      toast.error(`Custom block length must be at least ${planBlockLength} classes.`);
      return;
    }
    setSaving(true);

    try {
      await createEnrolmentsFromSelection({
        studentId,
        planId,
        templateIds: selectedTemplateIds,
        startDate: `${startDate}T00:00:00`,
        effectiveLevelId,
        customBlockLength: customBlockEnabled && planIsBlock && customBlockValue ? customBlockValue : undefined,
        allowOverload,
      });

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      const details = parseCapacityError(err);
      if (details) {
        setCapacityWarning(details);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Unable to enrol student. Please check the plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-3rem)] max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Add enrolment</DialogTitle>
            <DialogDescription>
              Select classes when needed for the plan. Weekly plans allow attendance in any class at the
              student&apos;s level.
            </DialogDescription>
          </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
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
              {availablePlans.length === 0 ? (
                <p className="text-xs text-destructive">
                  {selectionDayType === "saturday"
                    ? "No Saturday plans exist for this level. Create one in Plans."
                    : selectionDayType === "weekday"
                      ? "No weekday plans exist for this level. Create one in Plans."
                      : "No enrolment plans are available for the selected level."}
                </p>
              ) : null}
              {planIsBlock && selectedPlan ? (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>
                      {planBlockLength} classes · {formatCurrencyFromCents(selectedPlan.priceCents)}
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
                        <Label htmlFor="custom-block-length-student">Number of classes</Label>
                        <Input
                          id="custom-block-length-student"
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
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Start date
              </div>
              <input
                type="date"
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={startDate}
                onChange={(e) => {
                  setStartDateTouched(true);
                  setStartDate(e.target.value);
                }}
                placeholder="YYYY-MM-DD"
              />
              <p className="text-xs text-muted-foreground">
                Defaults to the earliest selected class if left blank.
              </p>
            </div>
          </div>

          <div className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <div className="flex items-center gap-2 text-[11px] font-semibold leading-none">
                <Badge variant="secondary" className="font-semibold">
                  Showing classes for {effectiveLevel?.name ?? "—"}
                </Badge>
              </div>
              {scheduleBlocked ? <span className="text-destructive">Set student level first</span> : null}
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
                  selectedTemplateIds={selectedTemplateIds}
                  filters={{ levelId: effectiveLevelId, teacherId: null }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <div className="space-y-1">
              <div className="font-medium">{selectionRequirement.helper}</div>
              <div className="text-muted-foreground">
                {selectionRequirement.requiredCount === 0
                  ? `${selectedTemplateIds.length}/${selectionRequirement.maxCount} selected (optional)`
                  : `${selectedTemplateIds.length}/${selectionRequirement.requiredCount} selected`}{" "}
                •{" "}
                {startDate ? `Start date ${startDate}` : "Start date will follow the first class"}
              </div>
              {selectedTemplateIds.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedTemplateIds.map((id) => {
                    const entry = selectedTemplates[id];
                    return (
                      <span key={id} className="rounded border bg-background px-2 py-1 text-xs">
                        {entry?.template?.name ?? entry?.level?.name ?? "Class"} ·{" "}
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
              <Button onClick={() => void handleCreate()} disabled={!canSubmit}>
                {saving ? "Enrolling..." : "Add enrolment"}
              </Button>
            </div>
          </div>
        </div>

        </DialogContent>
      </Dialog>

      <CapacityOverloadDialog
        open={Boolean(capacityWarning)}
        details={capacityWarning}
        busy={saving}
        onCancel={() => setCapacityWarning(null)}
        onConfirm={() => {
          setCapacityWarning(null);
          void handleCreate(true);
        }}
      />
    </>
  );
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
