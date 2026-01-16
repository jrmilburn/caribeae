"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClassTemplate, EnrolmentPlan, Level, Teacher } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyFromCents, dollarsToCents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { dayOfWeekToName } from "@/packages/schedule";
import {
  scheduleDateAtMinutes,
  scheduleMinutesSinceMidnight,
  ScheduleView,
  type NormalizedScheduleClass,
  type ScheduleClassClickContext,
} from "@/packages/schedule";
import { transitionFamily } from "@/server/family/transitionFamily";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
import { parseCapacityError, type CapacityExceededDetails } from "@/lib/capacityError";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";

const STEPS = ["Select students", "Set plans", "Opening balance", "Review"] as const;

const todayString = () => new Date().toISOString().slice(0, 10);

type ClassTemplateOption = ClassTemplate & { level: Level; teacher: Teacher | null };

type StudentDraft = {
  studentId: string;
  selected: boolean;
  planId: string;
  classTemplateIds: string[];
  startDate: string;
  paidThroughDate: string;
  credits: number;
};

type FamilyTransitionWizardProps = {
  family: FamilyWithStudentsAndInvoices;
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: ClassTemplateOption[];
  levels: Level[];
  openingState: { id: string; createdAt: string | Date } | null;
};

export function FamilyTransitionWizard({
  family,
  enrolmentPlans,
  classTemplates,
  levels,
  openingState,
}: FamilyTransitionWizardProps) {
  const router = useRouter();
  const sortedPlans = React.useMemo(
    () => [...enrolmentPlans].sort((a, b) => a.name.localeCompare(b.name)),
    [enrolmentPlans]
  );
  const sortedTemplates = React.useMemo(
    () =>
      [...classTemplates].sort((a, b) => {
        const levelCompare = a.level.name.localeCompare(b.level.name);
        if (levelCompare !== 0) return levelCompare;
        return (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0);
      }),
    [classTemplates]
  );

  const defaultPlanId = sortedPlans[0]?.id ?? "";
  const defaultDate = todayString();

  const [step, setStep] = React.useState(0);
  const [force, setForce] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [openingBalance, setOpeningBalance] = React.useState("0.00");
  const [submitting, setSubmitting] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [scheduleStudentId, setScheduleStudentId] = React.useState<string | null>(null);
  const [capacityWarning, setCapacityWarning] = React.useState<CapacityExceededDetails | null>(null);

  const [students, setStudents] = React.useState<StudentDraft[]>(() =>
    family.students.map((student) => ({
      studentId: student.id,
      selected: true,
      planId: defaultPlanId,
      classTemplateIds: [],
      startDate: defaultDate,
      paidThroughDate: defaultDate,
      credits: 0,
    }))
  );

  const selectedStudents = students.filter((student) => student.selected);
  const openingBalanceCents = dollarsToCents(openingBalance);
  const hasExisting = Boolean(openingState);
  const openingDate = openingState ? new Date(openingState.createdAt) : null;
  const setupReady = sortedPlans.length > 0 && sortedTemplates.length > 0;

  const planById = React.useMemo(
    () => new Map(sortedPlans.map((plan) => [plan.id, plan])),
    [sortedPlans]
  );
  const templateById = React.useMemo(
    () => new Map(sortedTemplates.map((template) => [template.id, template])),
    [sortedTemplates]
  );
  const studentById = React.useMemo(
    () => new Map(family.students.map((student) => [student.id, student])),
    [family.students]
  );
  const plansByLevel = React.useMemo(() => {
    const map = new Map<string, EnrolmentPlan[]>();
    sortedPlans.forEach((plan) => {
      const list = map.get(plan.levelId) ?? [];
      list.push(plan);
      map.set(plan.levelId, list);
    });
    return map;
  }, [sortedPlans]);

  React.useEffect(() => {
    setStudents((prev) =>
      prev.map((student) => {
        const levelId = studentById.get(student.studentId)?.levelId ?? null;
        const availablePlans = levelId ? plansByLevel.get(levelId) ?? [] : [];
        const planId = availablePlans.find((plan) => plan.id === student.planId)?.id ?? availablePlans[0]?.id ?? "";
        return {
          ...student,
          planId,
        };
      })
    );
  }, [defaultPlanId, plansByLevel, studentById]);

  const updateStudent = (studentId: string, updates: Partial<StudentDraft>) => {
    setStudents((prev) =>
      prev.map((student) => {
        if (student.studentId !== studentId) return student;
        const next = { ...student, ...updates };
        return next;
      })
    );
  };

  const canContinue = React.useMemo(() => {
    if (!setupReady) return false;
    if (step === 0) return selectedStudents.length > 0;
    if (step === 1) {
      return selectedStudents.every((student) => {
        if (!student.planId || !student.startDate) return false;
        const plan = planById.get(student.planId);
        if (!plan) return false;
        if (!student.paidThroughDate) return false;
        if (plan.billingType === "PER_CLASS") {
          const requiredCount = Math.max(1, plan.sessionsPerWeek ?? 1);
          if (student.classTemplateIds.length !== requiredCount) return false;
          return Number.isFinite(student.credits);
        }
        return true;
      });
    }
    return true;
  }, [planById, selectedStudents, setupReady, step]);

  const handleSubmit = async (allowOverload?: boolean) => {
    if (!setupReady) {
      toast.error("Add at least one plan and class template first.");
      return;
    }

    if (selectedStudents.length === 0) {
      toast.error("Select at least one student.");
      return;
    }

    if (hasExisting && !force) {
      toast.error("This family has already been transitioned. Enable force to continue.");
      return;
    }

    try {
      setSubmitting(true);
      const result = await transitionFamily({
        familyId: family.id,
        openingBalanceCents,
        notes: notes.trim() || undefined,
        force,
        allowOverload,
        students: selectedStudents.map((student) => ({
          studentId: student.studentId,
          planId: student.planId,
          templateIds: student.classTemplateIds,
          startDate: new Date(student.startDate),
          paidThroughDate: new Date(student.paidThroughDate) || new Date(student.startDate),
          credits: student.credits,
        })),
      });
      if (!result.ok) {
        if (result.error.code === "CAPACITY_EXCEEDED") {
          setCapacityWarning(result.error.details);
          return;
        }
        toast.error(result.error.message);
        return;
      }
      toast.success("Family transitioned successfully.");
      setWizardOpen(false);
      router.refresh();
    } catch (error) {
      const details = parseCapacityError(error);
      if (details) {
        setCapacityWarning(details);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Unable to transition family.");
    } finally {
      setSubmitting(false);
    }
  };

  const scheduleStudent = scheduleStudentId ? studentById.get(scheduleStudentId) ?? null : null;
  const scheduleDraft = scheduleStudentId
    ? students.find((student) => student.studentId === scheduleStudentId) ?? null
    : null;
  const schedulePlan = scheduleDraft ? planById.get(scheduleDraft.planId) ?? null : null;
  const scheduleBlocked = !scheduleStudent?.levelId;
  const scheduleSelectedIds = scheduleDraft?.classTemplateIds ?? [];
  const scheduleAllowsMultiple = schedulePlan
    ? schedulePlan.billingType === "PER_CLASS" && Math.max(1, schedulePlan.sessionsPerWeek ?? 1) > 1
    : false;

  const onScheduleClassClick = (
    occurrence: NormalizedScheduleClass,
    context?: ScheduleClassClickContext
  ) => {
    if (!scheduleDraft || !scheduleStudentId) return;
    if (!schedulePlan || schedulePlan.billingType !== "PER_CLASS") return;
    const studentLevelId = scheduleStudent?.levelId ?? null;
    if (!studentLevelId) {
      toast.error("Set the student's level first.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== studentLevelId) {
      toast.error("Select classes that match the student's level.");
      return;
    }
    if (schedulePlan?.levelId && occurrence.levelId && occurrence.levelId !== schedulePlan.levelId) {
      toast.error("Select classes that match the enrolment plan level.");
      return;
    }
    const isSaturday = occurrence.dayOfWeek === 5;
    if (schedulePlan.isSaturdayOnly && !isSaturday) {
      toast.error("Saturday-only plans can only use Saturday classes.");
      return;
    }
    if (!schedulePlan.isSaturdayOnly && isSaturday) {
      toast.error("Saturday classes require a Saturday-only enrolment plan.");
      return;
    }

    const alignedOccurrence =
      context?.columnDate ? alignOccurrenceToColumn(occurrence, context.columnDate) : occurrence;

    if (scheduleAllowsMultiple) {
      const current = new Set(scheduleDraft.classTemplateIds);
      if (current.has(alignedOccurrence.templateId)) {
        current.delete(alignedOccurrence.templateId);
      } else {
        const maxCount = Math.max(1, schedulePlan.sessionsPerWeek ?? 1);
        if (current.size >= maxCount) {
          toast.error(`Select ${maxCount} classes for this plan.`);
          return;
        }
        current.add(alignedOccurrence.templateId);
      }
      updateStudent(scheduleStudentId, { classTemplateIds: Array.from(current) });
    } else {
      updateStudent(scheduleStudentId, { classTemplateIds: [alignedOccurrence.templateId] });
      setScheduleStudentId(null);
    }
  };

  return (
    <>
      <Card className="border-l-0 border-r-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Family transition</CardTitle>
          <p className="text-sm text-muted-foreground">
            Move a paper-billed family into the digital workflow in under two minutes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasExisting ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This family already has a transition recorded on {openingDate?.toDateString() ?? "an earlier date"}. Enable
              force to override.
            </div>
          ) : null}
          <Button onClick={() => setWizardOpen(true)} disabled={!setupReady}>
            Open transition wizard
          </Button>
          {sortedPlans.length === 0 || sortedTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Add at least one enrolment plan and class template before running this transition.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="w-[calc(100vw-3rem)] max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>Transition family</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {STEPS.map((label, index) => (
                <div
                  key={label}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    index === step ? "border-primary bg-primary/10 text-primary" : "border-muted text-muted-foreground"
                  )}
                >
                  {index + 1}. {label}
                </div>
              ))}
            </div>

        {step === 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select students to transition</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setStudents((prev) => prev.map((student) => ({ ...student, selected: true })))
                }
              >
                Select all
              </Button>
            </div>
            <div className="grid gap-2">
              {family.students.map((student) => {
                const draft = students.find((item) => item.studentId === student.id);
                return (
                  <label
                    key={student.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-muted-foreground">Student ID: {student.id}</div>
                    </div>
                    <Checkbox
                      checked={draft?.selected ?? false}
                      onCheckedChange={(value) => updateStudent(student.id, { selected: Boolean(value) })}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            {selectedStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select at least one student to continue.</p>
            ) : null}
            {selectedStudents.map((student) => {
              const plan = planById.get(student.planId);
              const templates = student.classTemplateIds
                .map((templateId) => templateById.get(templateId))
                .filter((template): template is ClassTemplateOption => Boolean(template));
              const billingType = plan?.billingType ?? null;
              const studentInfo = studentById.get(student.studentId);
              const studentLevelId = studentInfo?.levelId ?? null;
              const availablePlans = studentLevelId
                ? plansByLevel.get(studentLevelId) ?? []
                : [];
              const planSessions = plan ? Math.max(1, plan.sessionsPerWeek ?? 1) : 1;
              const levelClasses = studentLevelId
                ? sortedTemplates.filter((templateOption) => templateOption.levelId === studentLevelId)
                : [];

              return (
                <div key={student.studentId} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      {family.students.find((s) => s.id === student.studentId)?.name}
                    </h4>
                    <span className="text-xs text-muted-foreground">{plan?.name ?? "Select plan"}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {billingType === "PER_CLASS" ? (
                      <div className="space-y-1">
                        <Label>Class template</Label>
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start"
                          onClick={() => setScheduleStudentId(student.studentId)}
                        >
                          {templates.length > 0
                            ? planSessions > 1
                              ? `${templates.length} class${templates.length === 1 ? "" : "es"} selected`
                              : `${templates[0]?.name ?? templates[0]?.level.name ?? "Class"} · ${
                                  typeof templates[0]?.dayOfWeek === "number"
                                    ? dayOfWeekToName(templates[0].dayOfWeek)
                                    : "Unscheduled"
                                }`
                            : "Select class on schedule"}
                        </Button>
                        {templates.length > 0 ? (
                          <div className="space-y-1">
                            {templates.map((template) => (
                              <p key={template.id} className="text-xs text-muted-foreground">
                                {template.name ?? template.level.name ?? "Class"} ·{" "}
                                {typeof template.dayOfWeek === "number"
                                  ? dayOfWeekToName(template.dayOfWeek)
                                  : "Unscheduled"}
                                {template.teacher?.name ? ` · ${template.teacher.name}` : ""}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Choose a class from the schedule view.</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>Weekly plan</Label>
                        <p className="text-sm text-muted-foreground">
                          Weekly plan: student will be enrolled in all classes for their level.
                        </p>
                        {levelClasses.length > 0 ? (
                          <div className="space-y-1">
                            {levelClasses.map((template) => (
                              <p key={template.id} className="text-xs text-muted-foreground">
                                {template.name ?? template.level.name ?? "Class"} ·{" "}
                                {typeof template.dayOfWeek === "number"
                                  ? dayOfWeekToName(template.dayOfWeek)
                                  : "Unscheduled"}
                                {template.teacher?.name ? ` · ${template.teacher.name}` : ""}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No active classes found for this level.</p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label>Enrolment plan</Label>
                      <Select
                        value={student.planId}
                        onValueChange={(value) => {
                          const plan = planById.get(value);
                          updateStudent(student.studentId, {
                            planId: value,
                            classTemplateIds: [],
                            paidThroughDate: student.startDate,
                            credits: plan?.billingType === "PER_CLASS" ? student.credits : 0,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePlans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} · {formatCurrencyFromCents(plan.priceCents)} ·
                              {plan.billingType === "PER_WEEK" ? "Weekly" : "Per class"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {studentLevelId && availablePlans.length === 0 ? (
                        <p className="text-xs text-destructive">No enrolment plans exist for this student level.</p>
                      ) : null}
                      {!studentLevelId ? (
                        <p className="text-xs text-destructive">Set the student level to choose a plan.</p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <Label>Start date</Label>
                      <Input
                        type="date"
                        value={student.startDate}
                        onChange={(e) =>
                          updateStudent(student.studentId, {
                            startDate: e.target.value,
                            paidThroughDate: student.paidThroughDate ? student.paidThroughDate : e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Paid through date</Label>
                      <Input
                        type="date"
                        value={student.paidThroughDate}
                        onChange={(e) => updateStudent(student.studentId, { paidThroughDate: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Invoices will start after {student.paidThroughDate || "—"}.
                      </p>
                    </div>
                    {billingType === "PER_CLASS" ? (
                      <div className="space-y-1">
                        <Label>Credits on hand</Label>
                        <Input
                          type="number"
                          min={0}
                          value={Number.isFinite(student.credits) ? student.credits : 0}
                          onChange={(e) => {
                            const nextValue = e.target.value === "" ? 0 : Number(e.target.value);
                            updateStudent(student.studentId, { credits: Number.isNaN(nextValue) ? 0 : nextValue });
                          }}
                        />
                        <p className="text-xs text-muted-foreground">Enter remaining prepaid class credits.</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="opening-balance">Opening balance (positive = debt, negative = credit)</Label>
              <Input
                id="opening-balance"
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Example: 120.00 = owes $120, -45.50 = credit of $45.50.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="opening-notes">Notes (optional)</Label>
              <Textarea
                id="opening-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paper ledger context, payment notes, or batch references."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={force} onCheckedChange={(value) => setForce(Boolean(value))} />
              Allow re-run if a previous transition exists
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-semibold">Students</h4>
              <div className="mt-2 space-y-2 text-sm">
                {selectedStudents.map((student) => {
                  const plan = planById.get(student.planId);
                  const templates = student.classTemplateIds
                    .map((templateId) => templateById.get(templateId))
                    .filter((template): template is ClassTemplateOption => Boolean(template));
                  const studentInfo = studentById.get(student.studentId);
                  const levelTemplates = studentInfo?.levelId
                    ? sortedTemplates.filter((template) => template.levelId === studentInfo.levelId)
                    : [];
                  return (
                    <div key={student.studentId} className="flex flex-col gap-1">
                      <span className="font-medium">
                        {family.students.find((s) => s.id === student.studentId)?.name}
                      </span>
                      {plan?.billingType === "PER_WEEK" ? (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>Weekly plan · All classes for this level</div>
                          {levelTemplates.length > 0 ? (
                            levelTemplates.map((template) => (
                              <div key={template.id}>
                                {template.name ?? template.level.name ?? "Class"} ·{" "}
                                {typeof template.dayOfWeek === "number"
                                  ? dayOfWeekToName(template.dayOfWeek)
                                  : "Unscheduled"}
                              </div>
                            ))
                          ) : (
                            <div>No active classes found.</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {templates.length > 0
                            ? templates.map((template) => {
                                const dayLabel =
                                  typeof template.dayOfWeek === "number"
                                    ? dayOfWeekToName(template.dayOfWeek)
                                    : "Unscheduled";
                                return (
                                  <div key={template.id}>
                                    {template.name ?? template.level.name ?? "Class"} · {dayLabel}
                                  </div>
                                );
                              })
                            : "No classes selected"}
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {plan?.name} · Start {student.startDate}
                        {student.paidThroughDate ? ` · Paid through ${student.paidThroughDate}` : ""}
                        {plan?.billingType === "PER_CLASS" ? ` · Credits ${student.credits}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Opening balance</span>
                <span className="font-semibold">{formatCurrencyFromCents(openingBalanceCents)}</span>
              </div>
              {notes ? <p className="mt-2 text-xs text-muted-foreground">Notes: {notes}</p> : null}
            </div>
          </div>
        ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep((prev) => Math.max(prev - 1, 0))}>
                Back
              </Button>
              <div className="flex gap-2">
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={() => setStep((prev) => prev + 1)} disabled={!canContinue}>
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!setupReady || submitting || (!force && hasExisting)}
                  >
                    {submitting ? "Submitting…" : "Submit transition"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(scheduleStudentId)}
        onOpenChange={(open) => {
          if (!open) setScheduleStudentId(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-3rem)] max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Select class template</DialogTitle>
          </DialogHeader>
          <div className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <div className="flex items-center gap-2 text-[11px] font-semibold leading-none">
                {scheduleStudent?.name ?? "Select class"}
              </div>
              <div className="flex items-center gap-2">
                {scheduleAllowsMultiple ? (
                  <span>
                    {scheduleSelectedIds.length} selected
                  </span>
                ) : null}
                {scheduleBlocked ? <span className="text-destructive">Set student level first</span> : null}
                {scheduleAllowsMultiple ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setScheduleStudentId(null)}>
                    Done
                  </Button>
                ) : null}
              </div>
            </div>
            {scheduleBlocked ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Set student level first.
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <ScheduleView
                  levels={levels}
                  onClassClick={onScheduleClassClick}
                  allowTemplateMoves={false}
                  defaultViewMode="week"
                  selectedTemplateIds={scheduleSelectedIds}
                  filters={{ levelId: scheduleStudent?.levelId ?? null, teacherId: null }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CapacityOverloadDialog
        open={Boolean(capacityWarning)}
        details={capacityWarning}
        busy={submitting}
        onCancel={() => setCapacityWarning(null)}
        onConfirm={() => {
          setCapacityWarning(null);
          void handleSubmit(true);
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
