"use client";

import * as React from "react";
import type { ClassTemplate, Enrolment, EnrolmentPlan, Level, Student } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
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
  ScheduleView,
  type NormalizedScheduleClass,
} from "@/packages/schedule";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { moveStudentToClass } from "@/server/enrolment/moveStudentToClass";
import { parseCapacityError, type CapacityExceededDetails } from "@/lib/capacityError";

type EnrolmentWithStudent = Enrolment & {
  student: Student;
  plan: EnrolmentPlan | null;
};

function formatTemplateLabel(template: ClassTemplate & { level: Level | null }) {
  const name = template.name?.trim() || "Untitled class";
  const levelName = template.level?.name ?? "Level";
  if (template.startTime != null && template.dayOfWeek != null) {
    const date = scheduleDateAtMinutes(new Date(), template.startTime);
    return `${name} · ${levelName} · ${formatScheduleWeekdayTime(date)}`;
  }
  return `${name} · ${levelName}`;
}

function toDateTimeInputValue(value: string) {
  if (!value) return null;
  return `${value}T00:00:00`;
}

export function MoveClassDialog({
  open,
  onOpenChange,
  enrolment,
  enrolmentPlans,
  classTemplates,
  levels,
  fromClassTemplate,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrolment: EnrolmentWithStudent;
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: Array<ClassTemplate & { level: Level | null }>;
  levels: Level[];
  fromClassTemplate: Pick<ClassTemplate, "id" | "name" | "dayOfWeek" | "startTime" | "levelId">;
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [destinationId, setDestinationId] = React.useState<string>("");
  const [planId, setPlanId] = React.useState<string>("");
  const [effectiveDate, setEffectiveDate] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [capacityWarning, setCapacityWarning] = React.useState<CapacityExceededDetails | null>(null);

  React.useEffect(() => {
    if (!open) {
      setScheduleOpen(false);
      setDestinationId("");
      setPlanId("");
      setEffectiveDate("");
      setSaving(false);
      return;
    }
    if (!effectiveDate) {
      setEffectiveDate(scheduleDateKey(new Date()));
    }
  }, [open, effectiveDate]);

  const destinationTemplate = React.useMemo(
    () => classTemplates.find((template) => template.id === destinationId) ?? null,
    [classTemplates, destinationId]
  );

  const availablePlans = React.useMemo(() => {
    if (!destinationTemplate?.levelId) return [];
    const levelFiltered = enrolmentPlans.filter((plan) => plan.levelId === destinationTemplate.levelId);
    if (destinationTemplate.dayOfWeek === 5) {
      return levelFiltered.filter(
        (plan) => plan.isSaturdayOnly || plan.billingType === "PER_WEEK"
      );
    }
    if (typeof destinationTemplate.dayOfWeek === "number") {
      return levelFiltered.filter(
        (plan) => !plan.isSaturdayOnly || plan.billingType === "PER_WEEK"
      );
    }
    return levelFiltered;
  }, [destinationTemplate, enrolmentPlans]);

  React.useEffect(() => {
    if (!availablePlans.find((plan) => plan.id === planId)) {
      setPlanId(availablePlans[0]?.id ?? "");
    }
  }, [availablePlans, planId]);

  const selectedPlan = React.useMemo(
    () => availablePlans.find((plan) => plan.id === planId) ?? null,
    [availablePlans, planId]
  );

  const selectionRequirement = React.useMemo(
    () =>
      selectedPlan
        ? getSelectionRequirement(selectedPlan)
        : { requiredCount: 1, maxCount: 1, helper: "Select a plan to continue." },
    [selectedPlan]
  );

  const requiresMultipleTemplates = selectionRequirement.maxCount > 1;
  const canSubmit =
    Boolean(destinationId) &&
    Boolean(planId) &&
    Boolean(effectiveDate) &&
    !saving &&
    !requiresMultipleTemplates;

  const previewStart = effectiveDate ? formatBrisbaneDate(effectiveDate) : null;

  const handleScheduleClassClick = (
    occurrence: NormalizedScheduleClass
  ) => {
    if (occurrence.templateId === fromClassTemplate.id) {
      toast.error("Select a different destination class.");
      return;
    }

    setDestinationId(occurrence.templateId);
    setScheduleOpen(false);
  };

  async function submitMove(allowOverload?: boolean) {
    if (!canSubmit) {
      if (requiresMultipleTemplates) {
        toast.error(selectionRequirement.helper);
      }
      return;
    }
    if (!destinationTemplate) {
      toast.error("Select a destination class.");
      return;
    }

    setSaving(true);
    try {
      const effectiveDateTime = toDateTimeInputValue(effectiveDate);
      if (!effectiveDateTime) return;
      const result = await moveStudentToClass({
        studentId: enrolment.studentId,
        fromClassId: fromClassTemplate.id,
        toClassId: destinationTemplate.id,
        toEnrolmentPlanId: planId,
        effectiveDate: effectiveDateTime,
        allowOverload,
      });

      if (!result.ok) {
        if (result.error.code === "CAPACITY_EXCEEDED") {
          setCapacityWarning(result.error.details);
          return;
        }
        toast.error(result.error.message);
        return;
      }

      onOpenChange(false);
      onMoved?.();
      router.refresh();
    } catch (error) {
      console.error(error);
      const details = parseCapacityError(error);
      if (details) {
        setCapacityWarning(details);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Unable to move class.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full p-0 gap-0 sm:max-w-xl">
          <SheetHeader className="px-6 pt-6 pb-4 sm:px-8">
            <SheetTitle>Move class</SheetTitle>
            <SheetDescription>
              Move {enrolment.student.name ?? "student"} to another class. This ends the current enrolment and starts a new one.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 sm:px-8">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Destination class</Label>
                <Button type="button" variant="outline" className="w-full" onClick={() => setScheduleOpen(true)}>
                  Select Destination Class
                </Button>
                {destinationTemplate ? (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="font-medium">{formatTemplateLabel(destinationTemplate)}</div>
                    {!destinationTemplate.active ? (
                      <Badge variant="secondary" className="mt-2 uppercase text-[10px]">
                        Inactive
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Choose the target class from the schedule popup.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Destination enrolment plan</Label>
                <Select value={planId} onValueChange={setPlanId} disabled={!destinationTemplate}>
                  <SelectTrigger>
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
                            <Badge variant="secondary" className="uppercase">
                              Saturday
                            </Badge>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {requiresMultipleTemplates ? (
                  <p className="text-xs text-muted-foreground">{selectionRequirement.helper}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Effective change date</Label>
                <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Preview</p>
                <p>
                  {previewStart
                    ? `End ${fromClassTemplate.name ?? "current class"} enrolment on ${previewStart} and start the new class on ${previewStart}.`
                    : "Select a date to preview the change."}
                </p>
                {previewStart ? (
                  <p>Paid-through coverage and billing adjustments will be recalculated automatically.</p>
                ) : null}
              </div>
            </div>
          </div>

          <SheetFooter className="border-t px-6 py-4 sm:px-8">
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => submitMove()} disabled={!canSubmit}>
                {saving ? "Moving..." : "Move class"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="w-[calc(100vw-3rem)] max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Select destination class</DialogTitle>
            <DialogDescription>
              Click a class on the schedule to select it as the destination.
            </DialogDescription>
          </DialogHeader>

          <div className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <div className="text-[11px] font-semibold leading-none">
                {destinationTemplate ? formatTemplateLabel(destinationTemplate) : "No destination selected"}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setScheduleOpen(false)}>
                Close
              </Button>
            </div>

            <div className="flex-1 min-h-0">
              <ScheduleView
                levels={levels}
                onClassClick={handleScheduleClassClick}
                allowTemplateMoves={false}
                defaultViewMode="week"
                selectedTemplateIds={destinationId ? [destinationId] : []}
                filters={{ levelId: null, teacherId: null }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CapacityOverloadDialog
        open={Boolean(capacityWarning)}
        details={capacityWarning}
        onCancel={() => setCapacityWarning(null)}
        onConfirm={() => {
          setCapacityWarning(null);
          void submitMove(true);
        }}
        busy={saving}
      />
    </>
  );
}
