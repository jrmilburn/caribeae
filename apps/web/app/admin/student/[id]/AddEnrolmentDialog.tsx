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
import { enrolStudentWithPlan } from "@/server/enrolment/enrolStudentWithPlan";

function parseMaybeDate(input?: Date | string | null) {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
  const [selected, setSelected] = React.useState<NormalizedScheduleClass | null>(null);
  const [planId, setPlanId] = React.useState<string>("");
  const [rangeStart, setRangeStart] = React.useState<string>("");
  const [rangeEnd, setRangeEnd] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSelected(null);
      setPlanId("");
      setRangeStart("");
      setRangeEnd("");
      setSaving(false);
    }
  }, [open]);

  const availablePlans = React.useMemo(() => {
    const levelId = selected?.levelId ?? selected?.template?.levelId ?? null;
    return enrolmentPlans.filter((p) => !levelId || p.levelId === levelId);
  }, [enrolmentPlans, selected]);

  React.useEffect(() => {
    if (!availablePlans.find((p) => p.id === planId)) {
      setPlanId(availablePlans[0]?.id ?? "");
    }
  }, [availablePlans, planId]);

  const selectedPlan = React.useMemo(
    () => availablePlans.find((p) => p.id === planId) ?? null,
    [availablePlans, planId]
  );
  const isWeeklyPlan = selectedPlan?.billingType === "PER_WEEK";
  const canSubmit =
    !!planId &&
    !saving &&
    (isWeeklyPlan ? Boolean(rangeStart) : Boolean(selected));

  const onClassClick = (occurrence: NormalizedScheduleClass) => {
    setSelected(occurrence);
  };

  const handleCreate = async () => {
    if (!selectedPlan) return;
    setSaving(true);

    try {
      if (isWeeklyPlan) {
        if (!rangeStart) return;
        await enrolStudentWithPlan({
          studentId,
          planId,
          startDate: new Date(`${rangeStart}T00:00:00`),
          endDate: rangeEnd ? new Date(`${rangeEnd}T00:00:00`) : null,
        });
      } else {
        if (!selected) return;

        const startDate = new Date(selected.startTime);
        const templateEnd = parseMaybeDate(selected.template?.endDate);

        await enrolStudentWithPlan({
          templateId: selected.templateId,
          studentId,
          planId,
          startDate,
          endDate: templateEnd,
        });
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Unable to enrol student. Please ensure a valid plan is selected.");
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
            Choose a plan. Weekly plans enrol the student into all matching classes; per-class and
            block plans require selecting a specific class from the schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
            {isWeeklyPlan ? (
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Start date
                  </div>
                  <input
                    type="date"
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    End date (optional)
                  </div>
                  <input
                    type="date"
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {!isWeeklyPlan ? (
            <div className="h-[520px] overflow-hidden rounded border">
              <ScheduleView
                levels={levels}
                onClassClick={onClassClick}
                allowTemplateMoves={false}
                defaultViewMode="week"
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm">
            {selected ? (
              <div className="space-y-0.5">
                <div className="font-medium">
                  {selected.template?.name ?? selected.level?.name ?? "Class template"}
                </div>
                <div className="text-muted-foreground">
                  {format(selected.startTime, "EEE, MMM d")} ·{" "}
                  {format(selected.startTime, "h:mm a")} – {format(selected.endTime, "h:mm a")}
                </div>
                <div className="text-muted-foreground">
                  Plan:{" "}
                  {availablePlans.find((p) => p.id === planId)?.name ??
                    (availablePlans.length ? "Select a plan" : "No matching plans")}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">
                {isWeeklyPlan
                  ? "Select dates for the weekly plan."
                  : "Select a class to enrol the student."}
              </div>
            )}

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
