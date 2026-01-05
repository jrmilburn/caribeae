"use client";

import * as React from "react";
import { format } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScheduleView, type NormalizedScheduleClass } from "@/packages/schedule";
import { createEnrolmentsFromSelection } from "@/server/enrolment/createEnrolmentsFromSelection";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { toast } from "sonner";
import { isSaturdayOccurrence, resolveSelectionDay } from "./dayUtils";
import { Badge } from "@/components/ui/badge";

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
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSelectedTemplates({});
      setPlanId("");
      setStartDate("");
      setSaving(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && !startDate) {
      setStartDate(format(new Date(), "yyyy-MM-dd"));
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
      return levelFiltered.filter((plan) => plan.isSaturdayOnly);
    }
    if (selectionDayType === "weekday") {
      return levelFiltered.filter((plan) => !plan.isSaturdayOnly);
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
      .map((date) => format(date as Date, "yyyy-MM-dd"))
      .sort();
    if (!sortedDates.length) return;
    setStartDate((prev) => {
      if (!prev) return sortedDates[0];
      return prev > sortedDates[0] ? sortedDates[0] : prev;
    });
  }, [selectedTemplateIds, selectedTemplates]);

  const selectedPlan = React.useMemo(
    () => availablePlans.find((p) => p.id === planId) ?? null,
    [availablePlans, planId]
  );
  const planIsWeekly = selectedPlan?.billingType === "PER_WEEK";
  const planDay = selectedPlan ? (selectedPlan.isSaturdayOnly ? "saturday" : "weekday") : null;

  const selectionRequirement = React.useMemo(
    () =>
      selectedPlan
        ? getSelectionRequirement(selectedPlan)
        : { requiredCount: 1, helper: "Select a plan to see class requirements." },
    [selectedPlan]
  );

  const selectionSatisfied =
    selectionRequirement.requiredCount === 0
      ? selectedTemplateIds.length <= 1
      : selectedTemplateIds.length === selectionRequirement.requiredCount;

  const canSubmit = !!planId && !saving && Boolean(startDate) && selectionSatisfied;
  const effectiveLevelId = studentLevelId ?? null;
  const effectiveLevel = levels.find((level) => level.id === effectiveLevelId) ?? null;
  const scheduleBlocked = !effectiveLevelId;

  const onClassClick = (occurrence: NormalizedScheduleClass) => {
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
        const occurrenceDate = format(occurrence.startTime, "yyyy-MM-dd");
        setStartDate((prevStart) => {
          if (!prevStart) return occurrenceDate;
          return occurrenceDate < prevStart ? occurrenceDate : prevStart;
        });
        return { [occurrence.templateId]: occurrence };
      }

      const count = Object.keys(prev).length;
      const maxSelectable = Math.max(selectionRequirement.requiredCount, 6);
      if (count >= maxSelectable) {
        toast.error(`You can select up to ${maxSelectable} classes at once. Deselect one to add another.`);
        return prev;
      }

      const nextDayType = resolveSelectionDay({ ...prev, [occurrence.templateId]: occurrence });
      if (nextDayType === "mixed") {
        toast.error("Select classes on the same day type for this enrolment.");
        return prev;
      }

      const next = { ...prev, [occurrence.templateId]: occurrence };
      const occurrenceDate = format(occurrence.startTime, "yyyy-MM-dd");
      setStartDate((prevStart) => {
        if (!prevStart) return occurrenceDate;
        return occurrenceDate < prevStart ? occurrenceDate : prevStart;
      });
      return next;
    });
  };

  const handleCreate = async () => {
    if (!effectiveLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (!selectedPlan || !canSubmit) {
      toast.error("Select a plan, classes, and start date.");
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
      });

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to enrol student. Please check the plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
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
                  ? `${selectedTemplateIds.length} selected (optional)`
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
              <Button onClick={handleCreate} disabled={!canSubmit}>
                {saving ? "Enrolling..." : "Add enrolment"}
              </Button>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
