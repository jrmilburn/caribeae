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
import { createEnrolment } from "@/server/enrolment/createEnrolment";

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
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSelected(null);
      setPlanId("");
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

  const canSubmit = Boolean(selected) && Boolean(planId) && !saving;

  const onClassClick = (occurrence: NormalizedScheduleClass) => {
    setSelected(occurrence);
  };

  const handleCreate = async () => {
    if (!selected) return;
    setSaving(true);

    try {
      const startDate = new Date(selected.startTime);
      const templateEnd = parseMaybeDate(selected.template?.endDate);

      await createEnrolment({
        templateId: selected.templateId,
        studentId,
        startDate,
        endDate: templateEnd,
        status: "ACTIVE",
        planId: planId as string,
      });

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
          <DialogTitle>Select a class</DialogTitle>
          <DialogDescription>
            Pick an existing class from the schedule to enrol this student. Editing actions are
            disabled — click a class to select it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
            <div className="h-[520px] overflow-hidden rounded border">
              <ScheduleView
                levels={levels}
                onClassClick={onClassClick}
                allowTemplateMoves={false}
                defaultViewMode="week"
              />
            </div>

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
              <div className="text-muted-foreground">Select a class to enrol the student.</div>
            )}

            <div className="flex items-center gap-2">
                <Select
                  value={planId}
                  onValueChange={setPlanId}
                  disabled={!selected || availablePlans.length === 0}
                >
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} · {plan.billingType === "PER_CLASS" ? "Per class" : "Per week"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
