"use client";

import * as React from "react";
import { format } from "date-fns";
import type { Enrolment, EnrolmentPlan, Level } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScheduleView, type NormalizedScheduleClass } from "@/packages/schedule";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { changeEnrolment } from "@/server/enrolment/changeEnrolment";
import { dayOfWeekFromDate, isSaturdayOccurrence, resolveSelectionDay } from "./dayUtils";

type EnrolmentWithPlan = Enrolment & { plan: EnrolmentPlan; templateId: string };

export function ChangeEnrolmentDialog({
  enrolment,
  levels,
  open,
  onOpenChange,
  initialTemplateIds,
  onChanged,
}: {
  enrolment: EnrolmentWithPlan;
  levels: Level[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplateIds: string[];
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [selectedTemplates, setSelectedTemplates] = React.useState<Record<string, NormalizedScheduleClass>>({});
  const [startDate, setStartDate] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const selectionRequirement = React.useMemo(
    () => getSelectionRequirement(enrolment.plan),
    [enrolment.plan]
  );
  const planIsWeekly = enrolment.plan.billingType === "PER_WEEK";
  const planDay = enrolment.plan.isSaturdayOnly ? "saturday" : "weekday";

  React.useEffect(() => {
    if (open) {
      setStartDate(format(enrolment.startDate, "yyyy-MM-dd"));
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
      const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
        start.getDay()
      ] as NormalizedScheduleClass["dayName"];
      const dayOfWeek = dayOfWeekFromDate(start);

      map[id] = {
        id,
        templateId: id,
        startTime: start,
        endTime: end,
        durationMin: 0,
        template: { dayOfWeek } as unknown as NormalizedScheduleClass["template"],
        levelId: enrolment.plan.levelId,
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
      ? selectedTemplateIds.length <= 1
      : selectedTemplateIds.length === selectionRequirement.requiredCount;

  const canSubmit = selectionSatisfied && Boolean(startDate) && !saving;

  const onClassClick = (occurrence: NormalizedScheduleClass) => {
    if (occurrence.levelId && occurrence.levelId !== enrolment.plan.levelId) {
      toast.error("Select classes that match the enrolment plan level.");
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

    setSelectedTemplates((prev) => {
      const alreadySelected = Boolean(prev[occurrence.templateId]);
      if (alreadySelected) {
        const next = { ...prev };
        delete next[occurrence.templateId];
        return next;
      }

      if (planIsWeekly && Object.keys(prev).length >= 1) {
        return { [occurrence.templateId]: occurrence };
      }

      if (Object.keys(prev).length >= selectionRequirement.requiredCount) {
        toast.error(selectionRequirement.helper);
        return prev;
      }
      return { ...prev, [occurrence.templateId]: occurrence };
    });
  };

  const handleSave = async () => {
    if (!canSubmit) {
      toast.error(selectionRequirement.helper);
      return;
    }

    setSaving(true);
    try {
      await changeEnrolment({
        enrolmentId: enrolment.id,
        templateIds: selectedTemplateIds,
        startDate: `${startDate}T00:00:00`,
      });
      toast.success("Enrolment updated.");
      onOpenChange(false);
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to change enrolment.");
    } finally {
      setSaving(false);
    }
  };

  return (
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

          <div className="h-[520px] overflow-hidden rounded border">
            <ScheduleView
              levels={levels}
              onClassClick={onClassClick}
              allowTemplateMoves={false}
              defaultViewMode="week"
              selectedTemplateIds={selectedTemplateIds}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <div className="space-y-1">
              <div className="font-medium">Selected classes</div>
              <div className="text-muted-foreground">
                {selectionRequirement.requiredCount === 0
                  ? `${selectedTemplateIds.length} selected (optional)`
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
                        {entry ? format(entry.startTime, "EEE h:mm a") : ""}
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
              <Button onClick={handleSave} disabled={!canSubmit}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
