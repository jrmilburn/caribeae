"use client";

import * as React from "react";
import { format } from "date-fns";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScheduleView, type NormalizedScheduleClass } from "@/packages/schedule";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { changeStudentLevelAndReenrol } from "@/server/student/changeStudentLevelAndReenrol";
import { getTemplatesForLevelAndDate } from "@/server/classTemplate/getTemplatesForLevelAndDate";
import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import { BillingType } from "@prisma/client";

type StudentWithHistory = FamilyWithStudentsAndInvoices["students"][number];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentWithHistory;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ChangeStudentLevelDialog({ open, onOpenChange, student, levels, enrolmentPlans }: Props) {
  const router = useRouter();
  const today = React.useMemo(() => toDateInputValue(new Date()), []);

  const [step, setStep] = React.useState<1 | 2>(1);
  const [selectedLevelId, setSelectedLevelId] = React.useState<string>(student.levelId ?? levels[0]?.id ?? "");
  const [effectiveDate, setEffectiveDate] = React.useState<string>(today);
  const [selectedTemplates, setSelectedTemplates] = React.useState<Record<string, NormalizedScheduleClass>>({});
  const [planId, setPlanId] = React.useState<string>("");
  const [note, setNote] = React.useState<string>("");
  const [availabilityCount, setAvailabilityCount] = React.useState<number | null>(null);
  const [checkingAvailability, startCheckingAvailability] = React.useTransition();
  const [submitting, setSubmitting] = React.useState(false);

  const selectedTemplateIds = React.useMemo(() => Object.keys(selectedTemplates), [selectedTemplates]);
  const weekAnchor = React.useMemo(
    () => (effectiveDate ? new Date(`${effectiveDate}T00:00:00`) : new Date()),
    [effectiveDate]
  );

  const availablePlans = React.useMemo(
    () => enrolmentPlans.filter((plan) => plan.levelId === selectedLevelId),
    [enrolmentPlans, selectedLevelId]
  );

  const selectedPlan = React.useMemo(
    () => availablePlans.find((plan) => plan.id === planId) ?? null,
    [availablePlans, planId]
  );

  const requiredSelectionCount = React.useMemo(() => {
    if (!selectedPlan) return 1;
    if (selectedPlan.billingType === BillingType.PER_WEEK) return 1;
    const requirement = getSelectionRequirement(selectedPlan);
    return Math.max(1, requirement.requiredCount);
  }, [selectedPlan]);

  const selectionMeetsPlan =
    selectedTemplateIds.length > 0 &&
    (selectedPlan?.billingType === BillingType.PER_WEEK
      ? selectedTemplateIds.length === 1
      : selectedTemplateIds.length === requiredSelectionCount);

  const availabilityKnown = availabilityCount !== null;
  const hasAvailableTemplates = !availabilityKnown || (availabilityCount ?? 0) > 0;

  React.useEffect(() => {
    if (!open) return;
    startCheckingAvailability(async () => {
      try {
        const res = await getTemplatesForLevelAndDate(selectedLevelId, `${effectiveDate}T00:00:00`);
        setAvailabilityCount(res.count);
      } catch (err) {
        console.error(err);
        setAvailabilityCount(null);
      }
    });
  }, [effectiveDate, open, selectedLevelId]);

  React.useEffect(() => {
    if (!open) return;
    setPlanId((prev) => {
      const exists = availablePlans.find((plan) => plan.id === prev);
      return exists ? prev : availablePlans[0]?.id ?? "";
    });
  }, [availablePlans, open]);

  React.useEffect(() => {
    if (!open) return;
    setSelectedTemplates({});
    setStep(1);
    setNote("");
  }, [open, selectedLevelId]);

  React.useEffect(() => {
    if (!open) return;
    setSelectedLevelId(student.levelId ?? levels[0]?.id ?? "");
    setEffectiveDate(today);
  }, [levels, open, student.levelId, today]);

  const onClassClick = (occurrence: NormalizedScheduleClass) => {
    if (occurrence.levelId && occurrence.levelId !== selectedLevelId) {
      toast.error("Select classes that match the new level.");
      return;
    }

    setSelectedTemplates((prev) => {
      const alreadySelected = Boolean(prev[occurrence.templateId]);
      if (alreadySelected) {
        const next = { ...prev };
        delete next[occurrence.templateId];
        return next;
      }

      const maxSelectable = Math.max(requiredSelectionCount, 6);
      if (Object.keys(prev).length >= maxSelectable) {
        toast.error(`You can select up to ${maxSelectable} classes. Deselect one to add another.`);
        return prev;
      }

      return { ...prev, [occurrence.templateId]: occurrence };
    });
  };

  const canContinue = selectedTemplateIds.length > 0 && hasAvailableTemplates;
  const canSubmit = Boolean(selectedPlan) && canContinue && selectionMeetsPlan && !submitting;

  const handleSubmit = async () => {
    if (!selectedPlan) {
      toast.error("Select an enrolment plan for the new level.");
      return;
    }
    if (!selectionMeetsPlan) {
      toast.error(`Select ${requiredSelectionCount} class${requiredSelectionCount === 1 ? "" : "es"} for this plan.`);
      return;
    }
    setSubmitting(true);
    try {
      await changeStudentLevelAndReenrol({
        studentId: student.id,
        toLevelId: selectedLevelId,
        effectiveDate: `${effectiveDate}T00:00:00`,
        templateIds: selectedTemplateIds,
        planId: selectedPlan.id,
        note,
      });
      toast.success("Level updated and enrolments created.");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to change level.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-3rem)] max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>Change level for {student.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={step === 1 ? "default" : "secondary"}>Step 1: Select level & classes</Badge>
            <Badge variant={step === 2 ? "default" : "secondary"}>Step 2: Pick plan & confirm</Badge>
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    New level
                  </div>
                  <Select value={selectedLevelId} onValueChange={setSelectedLevelId}>
                    <SelectTrigger className="min-w-[220px]">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Effective date
                  </div>
                  <input
                    type="date"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
                Select at least one class template for the new level. Level changes are blocked unless enrolments are created.
              </div>

              <div className="h-[520px] overflow-hidden rounded border">
                <ScheduleView
                  levels={levels}
                  onClassClick={onClassClick}
                  allowTemplateMoves={false}
                  defaultViewMode="week"
                  selectedTemplateIds={selectedTemplateIds}
                  filters={{ levelId: selectedLevelId, teacherId: null }}
                  weekAnchor={weekAnchor}
                />
              </div>

              <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Selected classes</div>
                  <div className="text-muted-foreground">
                    {selectedTemplateIds.length === 0
                      ? "No classes selected yet."
                      : `${selectedTemplateIds.length} selected • Effective ${effectiveDate}`}
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
                  ) : null}
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  {checkingAvailability ? "Checking class availability..." : null}
                  {!hasAvailableTemplates && !checkingAvailability ? (
                    <span className="text-destructive">No classes available for this level/date.</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setStep(2)} disabled={!canContinue}>
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Enrolment plan
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
                    <p className="text-xs text-destructive">Create a plan for this level before changing levels.</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {selectedPlan
                      ? selectedPlan.billingType === BillingType.PER_WEEK
                        ? "Weekly plans require one anchor class."
                        : `Select ${requiredSelectionCount} class${requiredSelectionCount === 1 ? "" : "es"} for this plan.`
                      : "Choose a plan to continue."}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Note (optional)
                  </div>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add context for this level change."
                    className="min-h-[96px]"
                  />
                </div>
              </div>

              <div className="rounded border bg-muted/30 p-3">
                <div className="text-sm font-semibold">Summary</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Level: {levels.find((l) => l.id === selectedLevelId)?.name ?? "—"} · Effective {effectiveDate}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {selectedTemplateIds.map((id) => {
                    const entry = selectedTemplates[id];
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1">
                        <div>
                          <div className="font-medium">{entry?.template?.name ?? "Class"}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry ? format(entry.startTime, "EEE h:mm a") : ""} · Template ID {id}
                          </div>
                        </div>
                        <Badge variant="outline">New enrolment</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Ready to confirm?</div>
                  <div className="text-muted-foreground">
                    {selectionMeetsPlan
                      ? `${selectedTemplateIds.length} class${selectedTemplateIds.length === 1 ? "" : "es"} selected`
                      : `Select ${requiredSelectionCount} class${requiredSelectionCount === 1 ? "" : "es"} for this plan.`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {submitting ? "Saving..." : "Confirm change"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
