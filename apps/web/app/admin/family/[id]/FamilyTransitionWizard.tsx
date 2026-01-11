"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClassTemplate, EnrolmentPlan, Level, Teacher } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyFromCents, dollarsToCents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { dayOfWeekToName } from "@/packages/schedule";
import { transitionFamily } from "@/server/family/transitionFamily";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";

const STEPS = ["Select students", "Set plans", "Opening balance", "Review"] as const;

const todayString = () => new Date().toISOString().slice(0, 10);

type ClassTemplateOption = ClassTemplate & { level: Level; teacher: Teacher | null };

type StudentDraft = {
  studentId: string;
  selected: boolean;
  planId: string;
  classTemplateId: string;
  startDate: string;
  paidThroughDate: string;
  credits: number;
};

type FamilyTransitionWizardProps = {
  family: FamilyWithStudentsAndInvoices;
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: ClassTemplateOption[];
  openingState: { id: string; createdAt: string | Date } | null;
};

export function FamilyTransitionWizard({
  family,
  enrolmentPlans,
  classTemplates,
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
  const defaultTemplateId = sortedTemplates[0]?.id ?? "";
  const defaultDate = todayString();

  const [step, setStep] = React.useState(0);
  const [force, setForce] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [openingBalance, setOpeningBalance] = React.useState("0.00");
  const [submitting, setSubmitting] = React.useState(false);

  const [students, setStudents] = React.useState<StudentDraft[]>(() =>
    family.students.map((student) => ({
      studentId: student.id,
      selected: true,
      planId: defaultPlanId,
      classTemplateId: defaultTemplateId,
      startDate: defaultDate,
      paidThroughDate: defaultDate,
      credits: 0,
    }))
  );

  React.useEffect(() => {
    setStudents((prev) =>
      prev.map((student) => ({
        ...student,
        planId: student.planId || defaultPlanId,
        classTemplateId: student.classTemplateId || defaultTemplateId,
      }))
    );
  }, [defaultPlanId, defaultTemplateId]);

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

  const updateStudent = (studentId: string, updates: Partial<StudentDraft>) => {
    setStudents((prev) =>
      prev.map((student) => (student.studentId === studentId ? { ...student, ...updates } : student))
    );
  };

  const canContinue = React.useMemo(() => {
    if (!setupReady) return false;
    if (step === 0) return selectedStudents.length > 0;
    if (step === 1) {
      return selectedStudents.every((student) => {
        if (!student.planId || !student.classTemplateId || !student.startDate) return false;
        const plan = planById.get(student.planId);
        if (!plan) return false;
        if (plan.billingType === "PER_WEEK") {
          return Boolean(student.paidThroughDate);
        }
        return Number.isFinite(student.credits);
      });
    }
    return true;
  }, [planById, selectedStudents, setupReady, step]);

  const handleSubmit = async () => {
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
      await transitionFamily({
        familyId: family.id,
        openingBalanceCents,
        notes: notes.trim() || undefined,
        force,
        students: selectedStudents.map((student) => ({
          studentId: student.studentId,
          planId: student.planId,
          classTemplateId: student.classTemplateId,
          startDate: new Date(student.startDate),
          paidThroughDate: student.paidThroughDate ? new Date(student.paidThroughDate) : undefined,
          credits: student.credits,
        })),
      });
      toast.success("Family transitioned successfully.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to transition family.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-l-0 border-r-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Family transition</CardTitle>
        <p className="text-sm text-muted-foreground">
          Move a paper-billed family into the digital workflow in under two minutes.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {sortedPlans.length === 0 || sortedTemplates.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Add at least one enrolment plan and class template before running this transition.
          </div>
        ) : null}
        {hasExisting ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This family already has a transition recorded on {openingDate?.toDateString() ?? "an earlier date"}. Enable
            force to override.
          </div>
        ) : null}

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
              const template = templateById.get(student.classTemplateId);
              const billingType = plan?.billingType ?? null;

              return (
                <div key={student.studentId} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      {family.students.find((s) => s.id === student.studentId)?.name}
                    </h4>
                    <span className="text-xs text-muted-foreground">{plan?.name ?? "Select plan"}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Class template</Label>
                      <Select
                        value={student.classTemplateId}
                        onValueChange={(value) => updateStudent(student.studentId, { classTemplateId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedTemplates.map((option) => {
                            const dayLabel =
                              typeof option.dayOfWeek === "number" ? dayOfWeekToName(option.dayOfWeek) : "Unscheduled";
                            return (
                              <SelectItem key={option.id} value={option.id}>
                                {option.name ?? option.level.name} · {dayLabel}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {template ? (
                        <p className="text-xs text-muted-foreground">
                          Level: {template.level.name}
                          {template.teacher?.name ? ` · ${template.teacher.name}` : ""}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <Label>Enrolment plan</Label>
                      <Select
                        value={student.planId}
                        onValueChange={(value) => {
                          const plan = planById.get(value);
                          updateStudent(student.studentId, {
                            planId: value,
                            paidThroughDate: plan?.billingType === "PER_WEEK" ? student.startDate : "",
                            credits: plan?.billingType === "PER_CLASS" ? student.credits : 0,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedPlans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} · {formatCurrencyFromCents(plan.priceCents)} ·
                              {plan.billingType === "PER_WEEK" ? "Weekly" : "Per class"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Start date</Label>
                      <Input
                        type="date"
                        value={student.startDate}
                        onChange={(e) =>
                          updateStudent(student.studentId, {
                            startDate: e.target.value,
                            paidThroughDate:
                              billingType === "PER_WEEK" ? e.target.value : student.paidThroughDate,
                          })
                        }
                      />
                    </div>

                    {billingType === "PER_WEEK" ? (
                      <div className="space-y-1">
                        <Label>Paid through date</Label>
                        <Input
                          type="date"
                          value={student.paidThroughDate}
                          onChange={(e) => updateStudent(student.studentId, { paidThroughDate: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">Set to the last date already paid on paper.</p>
                      </div>
                    ) : (
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
                    )}
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
                  const template = templateById.get(student.classTemplateId);
                  const dayLabel =
                    typeof template?.dayOfWeek === "number" ? dayOfWeekToName(template.dayOfWeek) : "Unscheduled";
                  return (
                    <div key={student.studentId} className="flex flex-col gap-1">
                      <span className="font-medium">
                        {family.students.find((s) => s.id === student.studentId)?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {template?.name ?? template?.level.name ?? "Class"} · {dayLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {plan?.name} · Start {student.startDate}
                        {plan?.billingType === "PER_WEEK"
                          ? ` · Paid through ${student.paidThroughDate || student.startDate}`
                          : ` · Credits ${student.credits}`}
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
                onClick={handleSubmit}
                disabled={!setupReady || submitting || (!force && hasExisting)}
              >
                {submitting ? "Submitting…" : "Submit transition"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
