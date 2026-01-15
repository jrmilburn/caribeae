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
import { Button } from "@/components/ui/button";
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
import { dayOfWeekFromScheduleDate, isSaturdayOccurrence, resolveSelectionDay } from "./dayUtils";
import { Badge } from "@/components/ui/badge";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
import { parseCapacityError, type CapacityExceededDetails } from "@/lib/capacityError";

type EnrolmentWithPlan = Enrolment & { plan: EnrolmentPlan; templateId: string };

export function ChangeEnrolmentDialog({
  enrolment,
  levels,
  open,
  onOpenChange,
  initialTemplateIds,
  onChanged,
  studentLevelId,
}: {
  enrolment: EnrolmentWithPlan;
  levels: Level[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplateIds: string[];
  onChanged?: () => void;
  studentLevelId?: string | null;
}) {
  const router = useRouter();
  const [selectedTemplates, setSelectedTemplates] = React.useState<Record<string, NormalizedScheduleClass>>({});
  const [startDate, setStartDate] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState<{
    oldDateKey: string | null;
    newDateKey: string | null;
    oldTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
    newTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
    wouldShorten: boolean;
  } | null>(null);
  const [capacityWarning, setCapacityWarning] = React.useState<{
    details: CapacityExceededDetails;
    confirmShorten?: boolean;
  } | null>(null);

  const selectionRequirement = React.useMemo(
    () => getSelectionRequirement(enrolment.plan),
    [enrolment.plan]
  );
  const planIsWeekly = enrolment.plan.billingType === "PER_WEEK";
  const planDay = enrolment.plan.isSaturdayOnly ? "saturday" : "weekday";

  React.useEffect(() => {
    if (open) {
      const start = enrolment.startDate instanceof Date ? enrolment.startDate : new Date(enrolment.startDate);
      setStartDate(scheduleDateKey(start));
      setSaving(false);
    }
  }, [enrolment.startDate, open]);

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
      const dayOfWeek = dayOfWeekFromScheduleDate(start);
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

  const selectedTemplateIds = React.useMemo(
    () => Object.keys(selectedTemplates),
    [selectedTemplates]
  );

  const selectionSatisfied =
    selectionRequirement.requiredCount === 0
      ? selectedTemplateIds.length > 0 && selectedTemplateIds.length <= selectionRequirement.maxCount
      : selectedTemplateIds.length === selectionRequirement.requiredCount;

  const canSubmit = selectionSatisfied && Boolean(startDate) && !saving;
  const effectiveLevelId = studentLevelId ?? enrolment.plan.levelId ?? null;
  const effectiveLevel = levels.find((level) => level.id === effectiveLevelId) ?? null;
  const scheduleBlocked = !effectiveLevelId;

  const onClassClick = (occurrence: NormalizedScheduleClass, context?: ScheduleClassClickContext) => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== enrolment.plan.levelId) {
      toast.error("Select classes that match the enrolment plan level.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== effectiveLevelId) {
      toast.error("Select classes that match the student's level.");
      return;
    }

    const occurrenceIsSaturday = isSaturdayOccurrence(occurrence);
    const currentDayType = resolveSelectionDay(selectedTemplates);
    if (planDay === "saturday" && !occurrenceIsSaturday) {
      toast.error("Saturday-only plans can only be used for Saturday classes.");
      return;
    }
    if (planDay === "weekday" && occurrenceIsSaturday) {
      toast.error("Use a Saturday-only plan for Saturday classes.");
      return;
    }
    if (currentDayType && currentDayType !== (occurrenceIsSaturday ? "saturday" : "weekday")) {
      toast.error("Select classes that match the plan's day.");
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

  const handleSave = async (confirmShorten?: boolean, allowOverload?: boolean) => {
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
      const result = await changeEnrolment({
        enrolmentId: enrolment.id,
        templateIds: selectedTemplateIds,
        startDate: `${startDate}T00:00:00`,
        effectiveLevelId,
        confirmShorten,
        allowOverload,
      });
      if (!result.ok) {
        if (result.error.code === "COVERAGE_WOULD_SHORTEN") {
          setConfirming({
            oldDateKey: result.error.oldDateKey,
            newDateKey: result.error.newDateKey,
            oldTemplates: [],
            newTemplates: [],
            wouldShorten: true,
          });
          return;
        }
      } else {
        toast.success("Enrolment updated.");
        onOpenChange(false);
        onChanged?.();
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      const details = parseCapacityError(err);
      if (details) {
        setCapacityWarning({ details, confirmShorten });
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
      });

      if (preview.ok) {
        setConfirming({
          oldDateKey: preview.data.oldPaidThroughDateKey,
          newDateKey: preview.data.newPaidThroughDateKey,
          oldTemplates: preview.data.oldTemplates,
          newTemplates: preview.data.newTemplates,
          wouldShorten: preview.data.wouldShorten,
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-3rem)] max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>Change enrolment</DialogTitle>
          <DialogDescription>
            Select the new class templates for this enrolment. Start date updates apply to all selected classes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plan
              </div>
              <div className="text-sm font-medium">{enrolment.plan.name}</div>
              <div className="text-xs text-muted-foreground">
                {selectionRequirement.helper}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Start date
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
                  mode="enrolmentChange"
                  selectedTemplateIds={selectedTemplateIds}
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
                • {startDate ? `Start date ${startDate}` : "Select a start date"}
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
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirming)} onOpenChange={(next) => (!next ? setConfirming(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm paid-through change</DialogTitle>
            <DialogDescription>
              {confirming?.wouldShorten
                ? "This class change will shorten the paid-through date."
                : "Review the paid-through update before confirming."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Current templates:</span>{" "}
              {confirming?.oldTemplates.length
                ? confirming.oldTemplates.map(formatTemplateLabel).join(", ")
                : "—"}
            </div>
            <div>
              <span className="font-medium">New templates:</span>{" "}
              {confirming?.newTemplates.length
                ? confirming.newTemplates.map(formatTemplateLabel).join(", ")
                : "—"}
            </div>
            <div>
              <span className="font-medium">Current paid-through:</span>{" "}
              {confirming?.oldDateKey ?? "—"}
            </div>
            <div>
              <span className="font-medium">New paid-through:</span>{" "}
              {confirming?.newDateKey ?? "—"}
            </div>
          </div>
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
                setConfirming(null);
                void handleSave(true);
              }}
              disabled={saving}
            >
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CapacityOverloadDialog
        open={Boolean(capacityWarning)}
        details={capacityWarning?.details ?? null}
        busy={saving}
        onCancel={() => setCapacityWarning(null)}
        onConfirm={() => {
          const pending = capacityWarning;
          setCapacityWarning(null);
          void handleSave(pending?.confirmShorten, true);
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
