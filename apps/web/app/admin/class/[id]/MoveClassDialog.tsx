"use client";

import * as React from "react";
import type { ClassTemplate, Enrolment, EnrolmentPlan, Level, Student } from "@prisma/client";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatScheduleWeekdayTime, scheduleDateAtMinutes } from "@/packages/schedule";
import { scheduleDateKey } from "@/packages/schedule";
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
  fromClassTemplate,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrolment: EnrolmentWithStudent;
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: Array<ClassTemplate & { level: Level | null }>;
  fromClassTemplate: Pick<ClassTemplate, "id" | "name" | "dayOfWeek" | "startTime" | "levelId">;
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [destinationOpen, setDestinationOpen] = React.useState(false);
  const [destinationSearch, setDestinationSearch] = React.useState("");
  const [destinationId, setDestinationId] = React.useState<string>("");
  const [planId, setPlanId] = React.useState<string>("");
  const [effectiveDate, setEffectiveDate] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [capacityWarning, setCapacityWarning] = React.useState<CapacityExceededDetails | null>(null);

  React.useEffect(() => {
    if (!open) {
      setDestinationOpen(false);
      setDestinationSearch("");
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

  React.useEffect(() => {
    if (!destinationOpen) setDestinationSearch("");
  }, [destinationOpen]);

  const filteredTemplates = React.useMemo(() => {
    const query = destinationSearch.trim().toLowerCase();
    const base = classTemplates.filter((template) => template.id !== fromClassTemplate.id);
    if (!query) return base;
    return base.filter((template) => {
      const label = formatTemplateLabel(template).toLowerCase();
      return label.includes(query);
    });
  }, [classTemplates, destinationSearch, fromClassTemplate.id]);

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
  const previewEndDate =
    effectiveDate && destinationTemplate
      ? formatBrisbaneDate(effectiveDate)
      : null;

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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Move class</DialogTitle>
            <DialogDescription>
              Move {enrolment.student.name ?? "student"} to another class. This ends the current enrolment and starts a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Destination class</Label>
              <Popover open={destinationOpen} onOpenChange={setDestinationOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {destinationTemplate ? formatTemplateLabel(destinationTemplate) : "Select class"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search classes"
                      value={destinationSearch}
                      onChange={(event) => setDestinationSearch(event.target.value)}
                    />
                    <CommandList>
                      <CommandEmpty>No classes found.</CommandEmpty>
                      <CommandGroup>
                        {filteredTemplates.map((template) => (
                          <CommandItem
                            key={template.id}
                            value={template.id}
                            onClick={() => {
                              setDestinationId(template.id);
                              setDestinationOpen(false);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <span>{formatTemplateLabel(template)}</span>
                              {template.active ? null : (
                                <Badge variant="secondary" className="uppercase text-[10px]">
                                  Inactive
                                </Badge>
                              )}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
              {previewEndDate ? (
                <p>Paid-through coverage and billing adjustments will be recalculated automatically.</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => submitMove()} disabled={!canSubmit}>
              {saving ? "Moving..." : "Move class"}
            </Button>
          </DialogFooter>
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
