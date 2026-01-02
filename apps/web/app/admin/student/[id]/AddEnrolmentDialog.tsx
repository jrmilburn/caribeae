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

export function AddEnrolmentDialog({
  open,
  onOpenChange,
  studentId,
  levels,
  enrolmentPlans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
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

  const selectedTemplateIds = React.useMemo(
    () => Object.keys(selectedTemplates),
    [selectedTemplates]
  );
  const selectedLevelId = React.useMemo(() => {
    const first = selectedTemplateIds[0];
    if (!first) return null;
    const template = selectedTemplates[first];
    return template?.levelId ?? template?.template?.levelId ?? null;
  }, [selectedTemplateIds, selectedTemplates]);

  const availablePlans = React.useMemo(() => {
    return enrolmentPlans.filter((p) => !selectedLevelId || p.levelId === selectedLevelId);
  }, [enrolmentPlans, selectedLevelId]);

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

  const selectionRequirement = React.useMemo(
    () =>
      selectedPlan
        ? getSelectionRequirement(selectedPlan)
        : { requiredCount: 1, helper: "Select a plan to see class requirements." },
    [selectedPlan]
  );

  const canSubmit =
    !!planId &&
    !saving &&
    Boolean(startDate) &&
    selectedTemplateIds.length === selectionRequirement.requiredCount;

  const onClassClick = (occurrence: NormalizedScheduleClass) => {
    const planLevelId = selectedPlan?.levelId ?? null;
    if (planLevelId && occurrence.levelId && occurrence.levelId !== planLevelId) {
      toast.error("Select classes that match the enrolment plan level.");
      return;
    }

    setSelectedTemplates((prev) => {
      const alreadySelected = Boolean(prev[occurrence.templateId]);
      if (alreadySelected) {
        const next = { ...prev };
        delete next[occurrence.templateId];
        return next;
      }

      const count = Object.keys(prev).length;
      const maxSelectable = Math.max(selectionRequirement.requiredCount, 6);
      if (count >= maxSelectable) {
        toast.error(`You can select up to ${maxSelectable} classes at once. Deselect one to add another.`);
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
            Select the classes that match the plan requirements. Multi-session plans require
            multiple class templates per week.
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
                      {plan.name} ·{" "}
                      {plan.billingType === "PER_WEEK"
                        ? "Per week"
                        : plan.billingType === "BLOCK"
                          ? "Block"
                          : "Per class"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <div className="font-medium">{selectionRequirement.helper}</div>
              <div className="text-muted-foreground">
                {selectedTemplateIds.length}/{selectionRequirement.requiredCount} selected •{" "}
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
