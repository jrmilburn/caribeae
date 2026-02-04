"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import type { EnrolmentPlan, Level } from "@prisma/client";

import { AdminListHeader } from "@/components/admin/AdminListHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import {
  onboardingAvailabilitySchema,
  onboardingStudentSchema,
  type OnboardingAvailabilityInput,
  type OnboardingStudentInput,
} from "@/lib/onboarding/schema";
import { findMatchingFamilies } from "@/server/onboarding/findMatchingFamilies";
import { updateOnboardingStatus } from "@/server/onboarding/updateOnboardingStatus";
import { acceptOnboardingRequest } from "@/server/onboarding/acceptOnboardingRequest";
import {
  formatScheduleWeekdayTime,
  scheduleDateAtMinutes,
  scheduleDateKey,
  scheduleMinutesSinceMidnight,
  ScheduleView,
  type NormalizedScheduleClass,
  type ScheduleClassClickContext,
} from "@/packages/schedule";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { resolveSelectionDay, isSaturdayOccurrence } from "@/app/admin/student/[id]/dayUtils";

import type { OnboardingRequestSummary } from "@/server/onboarding/listOnboardingRequests";
import type { OnboardingFamilyMatch } from "@/server/onboarding/findMatchingFamilies";

const studentsSchema = z.array(onboardingStudentSchema);

const statusOptions = [
  { value: "all", label: "All" },
  { value: "NEW", label: "New" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
] as const;

type OnboardingRequest = Omit<OnboardingRequestSummary, "students" | "availability"> & {
  students: OnboardingStudentInput[];
  availability: OnboardingAvailabilityInput | null;
};

type AssignmentState = {
  studentIndex: number;
  levelId: string | null;
  planId: string;
  templateIds: string[];
  startDate: string;
};

type AssignmentDraft = AssignmentState & {
  selectedTemplates: Record<string, NormalizedScheduleClass>;
  startDateTouched: boolean;
};

function parseStudents(value: unknown): OnboardingStudentInput[] {
  const parsed = studentsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseAvailability(value: unknown): OnboardingAvailabilityInput | null {
  const parsed = onboardingAvailabilitySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function statusBadge(status: OnboardingRequestSummary["status"]) {
  if (status === "ACCEPTED") return "secondary";
  if (status === "DECLINED") return "destructive";
  return "default";
}

function formatPhone(value: string | null) {
  return value ?? "—";
}

function buildSelectionSummary(selectedTemplates: Record<string, NormalizedScheduleClass>) {
  return Object.values(selectedTemplates).map((template) => {
    const label = template.template?.name ?? template.templateName ?? template.level?.name ?? "Class";
    const time = formatScheduleWeekdayTime(template.startTime);
    return `${label} · ${time}`;
  });
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

function ScheduleSelectionDialog({
  open,
  onOpenChange,
  levels,
  assignment,
  plan,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levels: Level[];
  assignment: AssignmentDraft;
  plan: EnrolmentPlan | null;
  onUpdate: (updater: (prev: AssignmentDraft) => AssignmentDraft) => void;
}) {
  const selectionRequirement = plan
    ? getSelectionRequirement(plan)
    : { requiredCount: 1, maxCount: 1, helper: "Select a plan to choose classes." };

  const planIsWeekly = plan?.billingType === "PER_WEEK";
  const planDay = plan
    ? plan.isSaturdayOnly
      ? "saturday"
      : planIsWeekly
        ? "any"
        : "weekday"
    : null;

  const selectedTemplateIds = Object.keys(assignment.selectedTemplates);

  const handleClassClick = (occurrence: NormalizedScheduleClass, context?: ScheduleClassClickContext) => {
    if (!assignment.levelId) {
      toast.error("Select a student level first.");
      return;
    }
    if (occurrence.levelId && occurrence.levelId !== assignment.levelId) {
      toast.error("Select classes that match the student's level.");
      return;
    }
    if (plan?.levelId && occurrence.levelId && occurrence.levelId !== plan.levelId) {
      toast.error("Select classes that match the enrolment plan level.");
      return;
    }

    const occurrenceIsSaturday = isSaturdayOccurrence(occurrence);
    const currentDayType = resolveSelectionDay(assignment.selectedTemplates);
    if (!planIsWeekly && planDay === "saturday" && !occurrenceIsSaturday) {
      toast.error("Saturday-only plans can only be used for Saturday classes.");
      return;
    }
    if (!planIsWeekly && planDay === "weekday" && occurrenceIsSaturday) {
      toast.error("Use a Saturday-only plan for Saturday classes.");
      return;
    }
    if (!planIsWeekly && currentDayType && currentDayType !== (occurrenceIsSaturday ? "saturday" : "weekday")) {
      toast.error("Select classes that match the plan's day.");
      return;
    }

    const alignedOccurrence =
      context?.columnDate ? alignOccurrenceToColumn(occurrence, context.columnDate) : occurrence;
    const occurrenceDateKey = context?.columnDateKey ?? scheduleDateKey(occurrence.startTime);

    onUpdate((prev) => {
      const alreadySelected = Boolean(prev.selectedTemplates[occurrence.templateId]);
      if (alreadySelected) {
        const next = { ...prev.selectedTemplates };
        delete next[occurrence.templateId];
        return { ...prev, selectedTemplates: next, templateIds: Object.keys(next) };
      }

      if (planIsWeekly && Object.keys(prev.selectedTemplates).length >= selectionRequirement.maxCount) {
        if (!prev.startDateTouched) {
          return { ...prev, startDate: occurrenceDateKey };
        }
        return prev;
      }

      const count = Object.keys(prev.selectedTemplates).length;
      const maxSelectable = selectionRequirement.maxCount;
      if (count >= maxSelectable) {
        toast.error(`You can select up to ${maxSelectable} classes at once. Deselect one to add another.`);
        return prev;
      }

      const nextSelection = {
        ...prev.selectedTemplates,
        [occurrence.templateId]: alignedOccurrence,
      };
      const nextDayType = resolveSelectionDay(nextSelection);
      if (nextDayType === "mixed") {
        toast.error("Select classes on the same day type for this enrolment.");
        return prev;
      }

      const nextIds = Object.keys(nextSelection);
      return {
        ...prev,
        selectedTemplates: nextSelection,
        templateIds: nextIds,
        startDate: !prev.startDateTouched ? occurrenceDateKey : prev.startDate,
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Select classes</DialogTitle>
          <DialogDescription>{selectionRequirement.helper}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <div className="flex items-center gap-2 text-[11px] font-semibold leading-none">
                {assignment.levelId ? (
                  <Badge variant="secondary" className="font-semibold">
                    Showing classes for {levels.find((level) => level.id === assignment.levelId)?.name ?? "—"}
                  </Badge>
                ) : null}
              </div>
              {!assignment.levelId ? <span className="text-destructive">Set level first</span> : null}
            </div>
            {!assignment.levelId ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a level to browse classes.
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <ScheduleView
                  levels={levels}
                  onClassClick={handleClassClick}
                  allowTemplateMoves={false}
                  defaultViewMode="week"
                  selectedTemplateIds={selectedTemplateIds}
                  filters={{ levelId: assignment.levelId, teacherId: null }}
                />
              </div>
            )}
          </div>

          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <div className="space-y-2">
              <div className="font-medium">{selectionRequirement.helper}</div>
              <div className="text-muted-foreground">
                {selectionRequirement.requiredCount === 0
                  ? `${selectedTemplateIds.length}/${selectionRequirement.maxCount} selected (optional)`
                  : `${selectedTemplateIds.length}/${selectionRequirement.requiredCount} selected`} ·{" "}
                {assignment.startDate ? `Start date ${assignment.startDate}` : "Choose a start date"}
              </div>
              {selectedTemplateIds.length ? (
                <div className="flex flex-wrap gap-2">
                  {buildSelectionSummary(assignment.selectedTemplates).map((label) => (
                    <span key={label} className="rounded border bg-background px-2 py-1 text-xs">
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">Select class templates on the schedule.</div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StudentAssignmentCard({
  student,
  assignment,
  plans,
  levels,
  onUpdate,
}: {
  student: OnboardingStudentInput;
  assignment: AssignmentDraft;
  plans: (EnrolmentPlan & { level: Level })[];
  levels: Level[];
  onUpdate: (next: AssignmentDraft) => void;
}) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false);

  const selectedTemplates = assignment.selectedTemplates;
  const selectedTemplateIds = Object.keys(selectedTemplates);
  const selectionDayType = resolveSelectionDay(selectedTemplates);

  const availablePlans = React.useMemo(() => {
    const levelFiltered = plans.filter((plan) => !assignment.levelId || plan.levelId === assignment.levelId);
    if (selectionDayType === "saturday") {
      return levelFiltered.filter((plan) => plan.isSaturdayOnly || plan.billingType === "PER_WEEK");
    }
    if (selectionDayType === "weekday") {
      return levelFiltered.filter((plan) => !plan.isSaturdayOnly || plan.billingType === "PER_WEEK");
    }
    return levelFiltered;
  }, [assignment.levelId, plans, selectionDayType]);

  const selectedPlan = React.useMemo(
    () => availablePlans.find((plan) => plan.id === assignment.planId) ?? null,
    [availablePlans, assignment.planId]
  );

  React.useEffect(() => {
    if (!availablePlans.find((plan) => plan.id === assignment.planId)) {
      onUpdate({ ...assignment, planId: availablePlans[0]?.id ?? "" });
    }
  }, [assignment, availablePlans, onUpdate]);

  React.useEffect(() => {
    if (!selectedTemplateIds.length || assignment.startDateTouched) return;
    const sortedDates = selectedTemplateIds
      .map((id) => selectedTemplates[id]?.startTime)
      .filter(Boolean)
      .map((date) => scheduleDateKey(date as Date))
      .sort();
    if (sortedDates.length) {
      onUpdate({ ...assignment, startDate: sortedDates[0] });
    }
  }, [assignment, onUpdate, selectedTemplateIds, selectedTemplates]);

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">
          {student.firstName} {student.lastName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Student level</Label>
          <Select
            value={assignment.levelId ?? ""}
            onValueChange={(value) => onUpdate({ ...assignment, levelId: value || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Select level</SelectItem>
              {levels.map((level) => (
                <SelectItem key={level.id} value={level.id}>
                  {level.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Enrolment plan</Label>
          <Select
            value={assignment.planId}
            onValueChange={(value) => onUpdate({ ...assignment, planId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select plan" />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Selected classes</Label>
          <Button type="button" variant="outline" onClick={() => setScheduleOpen(true)}>
            {selectedTemplateIds.length ? "Edit schedule" : "Select on schedule"}
          </Button>
          <div className="text-xs text-muted-foreground">
            {selectedTemplateIds.length
              ? `${selectedTemplateIds.length} selected`
              : "Use the schedule view to pick classes."}
          </div>
          {selectedTemplateIds.length ? (
            <div className="flex flex-wrap gap-2">
              {buildSelectionSummary(selectedTemplates).map((label) => (
                <span key={label} className="rounded border bg-background px-2 py-1 text-xs">
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label>Start date</Label>
          <Input
            type="date"
            value={assignment.startDate}
            onChange={(event) =>
              onUpdate({ ...assignment, startDate: event.target.value, startDateTouched: true })
            }
          />
        </div>

        <ScheduleSelectionDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          levels={levels}
          assignment={assignment}
          plan={selectedPlan}
          onUpdate={(updater) => onUpdate(updater(assignment))}
        />
      </CardContent>
    </Card>
  );
}

function AcceptOnboardingDialog({
  open,
  onOpenChange,
  request,
  levels,
  enrolmentPlans,
  onAccepted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: OnboardingRequest;
  levels: Level[];
  enrolmentPlans: (EnrolmentPlan & { level: Level })[];
  onAccepted: () => void;
}) {
  const [mode, setMode] = React.useState<"later" | "assign">("later");
  const [matches, setMatches] = React.useState<OnboardingFamilyMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = React.useState(false);
  const [familyMode, setFamilyMode] = React.useState<"new" | "existing">("new");
  const [selectedFamilyId, setSelectedFamilyId] = React.useState<string | null>(null);
  const [assignments, setAssignments] = React.useState<AssignmentDraft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setMode("later");
    const defaultLevelId = request.availability?.desiredLevelId ?? null;
    setAssignments(
      request.students.map((_, index) => ({
        studentIndex: index,
        levelId: defaultLevelId,
        planId: "",
        templateIds: [],
        startDate: scheduleDateKey(new Date()),
        selectedTemplates: {},
        startDateTouched: false,
      }))
    );
  }, [open, request.availability, request.students]);

  React.useEffect(() => {
    if (!open) return;
    const loadMatches = async () => {
      setLoadingMatches(true);
      try {
        const data = await findMatchingFamilies({ email: request.email, phone: request.phone });
        setMatches(data);
        if (data.length > 0) {
          setFamilyMode("existing");
          setSelectedFamilyId(data[0]?.id ?? null);
        } else {
          setFamilyMode("new");
          setSelectedFamilyId(null);
        }
      } finally {
        setLoadingMatches(false);
      }
    };
    void loadMatches();
  }, [open, request.email, request.phone]);

  const planById = React.useMemo(
    () => new Map(enrolmentPlans.map((plan) => [plan.id, plan])),
    [enrolmentPlans]
  );

  const canSubmitAssignments = React.useMemo(() => {
    if (!assignments.length) return false;
    return assignments.every((assignment) => {
      if (!assignment.levelId || !assignment.planId || !assignment.startDate) return false;
      const plan = planById.get(assignment.planId);
      if (!plan) return false;
      const requirement = getSelectionRequirement(plan);
      const count = assignment.templateIds.length;
      if (requirement.requiredCount === 0) {
        return count <= requirement.maxCount;
      }
      return count === requirement.requiredCount;
    });
  }, [assignments, planById]);

  const handleAccept = async () => {
    if (familyMode === "existing" && !selectedFamilyId) {
      toast.error("Select an existing family or choose to create a new one.");
      return;
    }
    const familyId = familyMode === "existing" ? selectedFamilyId : null;

    const result = await runMutationWithToast(
      () =>
        acceptOnboardingRequest({
          id: request.id,
          familyId,
          mode: "later",
          assignments: assignments.map((assignment) => ({
            studentIndex: assignment.studentIndex,
            levelId: assignment.levelId,
          })),
        }),
      {
        pending: { title: "Accepting onboarding..." },
        success: { title: "Onboarding accepted" },
        error: (message) => ({ title: "Unable to accept", description: message }),
        onSuccess: () => {
          onOpenChange(false);
          onAccepted();
        },
      }
    );

    if (!result) return;
  };

  const handleAssign = async () => {
    if (!canSubmitAssignments) {
      toast.error("Complete the class selections for each student.");
      return;
    }
    if (familyMode === "existing" && !selectedFamilyId) {
      toast.error("Select an existing family or choose to create a new one.");
      return;
    }

    const familyId = familyMode === "existing" ? selectedFamilyId : null;

    const result = await runMutationWithToast(
      () =>
        acceptOnboardingRequest({
          id: request.id,
          familyId,
          mode: "assign",
          assignments: assignments.map((assignment) => ({
            studentIndex: assignment.studentIndex,
            levelId: assignment.levelId,
            planId: assignment.planId,
            templateIds: assignment.templateIds,
            startDate: assignment.startDate,
          })),
        }),
      {
        pending: { title: "Accepting and assigning..." },
        success: { title: "Classes assigned" },
        error: (message) => ({ title: "Unable to assign", description: message }),
        onSuccess: () => {
          onOpenChange(false);
          onAccepted();
        },
      }
    );

    if (!result) return;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Accept onboarding request</DialogTitle>
          <DialogDescription>Choose how you&apos;d like to move this family forward.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Potential matches</p>
                <p className="text-xs text-muted-foreground">Attach to an existing family if it already exists.</p>
              </div>
              {loadingMatches ? <Badge variant="secondary">Checking...</Badge> : null}
            </div>
            {matches.length ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2">
                  <Label>Family choice</Label>
                  <Select
                    value={familyMode}
                    onValueChange={(value) => setFamilyMode(value === "existing" ? "existing" : "new")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="existing">Attach to existing family</SelectItem>
                      <SelectItem value="new">Create new family</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {familyMode === "existing" ? (
                  <div className="grid gap-2">
                    <Label>Select family</Label>
                    <Select
                      value={selectedFamilyId ?? ""}
                      onValueChange={(value) => setSelectedFamilyId(value || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select family" />
                      </SelectTrigger>
                      <SelectContent>
                        {matches.map((match) => (
                          <SelectItem key={match.id} value={match.id}>
                            {match.name} · {match.primaryEmail ?? match.primaryPhone ?? "No contact"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No matching families found.</p>
            )}
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value === "assign" ? "assign" : "later")}>
            <TabsList>
              <TabsTrigger value="later">Accept now, assign later</TabsTrigger>
              <TabsTrigger value="assign">Accept + assign classes</TabsTrigger>
            </TabsList>

            <TabsContent value="later" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Create family + students</CardTitle>
                  <p className="text-sm text-muted-foreground">We&apos;ll leave class placements unassigned for now.</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>Next steps:</p>
                  <ul className="list-disc pl-5">
                    <li>Review the new family record.</li>
                    <li>Assign classes when you are ready.</li>
                  </ul>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link href="/admin/family" className="text-primary hover:underline">
                      Go to families
                    </Link>
                    <Link href="/admin/enrolment" className="text-primary hover:underline">
                      Assign classes later
                    </Link>
                  </div>
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button type="button" onClick={handleAccept}>
                  Accept request
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="assign" className="space-y-4">
              <div className="space-y-4">
                {assignments.map((assignment, index) => (
                  <StudentAssignmentCard
                    key={assignment.studentIndex}
                    student={request.students[index]}
                    assignment={assignment}
                    plans={enrolmentPlans}
                    levels={levels}
                    onUpdate={(next) =>
                      setAssignments((prev) =>
                        prev.map((item) => (item.studentIndex === assignment.studentIndex ? next : item))
                      )
                    }
                  />
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={handleAssign} disabled={!canSubmitAssignments}>
                  Accept and assign
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingReviewClient({
  requests,
  totalCount,
  nextCursor,
  pageSize,
  statusFilter,
  levels,
  enrolmentPlans,
}: {
  requests: OnboardingRequestSummary[];
  totalCount: number;
  nextCursor: string | null;
  pageSize: number;
  statusFilter: "NEW" | "ACCEPTED" | "DECLINED" | null;
  levels: Level[];
  enrolmentPlans: (EnrolmentPlan & { level: Level })[];
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const router = useRouter();

  const parsedRequests = React.useMemo(() => {
    return requests.map((request) => ({
      ...request,
      students: parseStudents(request.students),
      availability: parseAvailability(request.availability),
    }));
  }, [requests]);

  const selected = parsedRequests.find((request) => request.id === selectedId) ?? null;

  const handleDecline = async (request: OnboardingRequest) => {
    const ok = window.confirm("Decline this onboarding request?");
    if (!ok) return;

    await runMutationWithToast(
      () => updateOnboardingStatus({ id: request.id, status: "DECLINED" }),
      {
        pending: { title: "Declining request..." },
        success: { title: "Request declined" },
        error: (message) => ({ title: "Unable to decline", description: message }),
        onSuccess: () => {
          setSelectedId(null);
          router.refresh();
        },
      }
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <AdminListHeader
        title="Onboarding"
        totalCount={totalCount}
        searchPlaceholder="Search by guardian, phone, or email..."
        onNew={() => undefined}
        showNew={false}
        extraActions={
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(value) => {
              const params = new URLSearchParams(window.location.search);
              if (value === "all") {
                params.delete("status");
              } else {
                params.set("status", value);
              }
              params.delete("cursor");
              params.delete("cursors");
              const qs = params.toString();
              window.location.search = qs ? `?${qs}` : "";
            }}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        sticky
      />

      <div className="space-y-3 px-4 pb-4">
        {parsedRequests.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No onboarding requests yet.
            </CardContent>
          </Card>
        ) : (
          parsedRequests.map((request) => (
            <Card key={request.id} className="cursor-pointer" onClick={() => setSelectedId(request.id)}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{request.guardianName}</p>
                    <Badge variant={statusBadge(request.status)}>{request.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(request.createdAt, "d MMM yyyy, h:mm a")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatPhone(request.phone)} · {request.email ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div>{request.students.length} student{request.students.length === 1 ? "" : "s"}</div>
                  <Button variant="ghost" size="sm">
                    Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AdminPagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentCount={parsedRequests.length}
        nextCursor={nextCursor}
      />

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.guardianName}</SheetTitle>
                <SheetDescription>
                  Submitted {format(selected.createdAt, "d MMM yyyy, h:mm a")}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Family contact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>{selected.guardianName}</p>
                    <p>{selected.email ?? "—"}</p>
                    <p>{formatPhone(selected.phone)}</p>
                    {selected.address ? <p>{selected.address}</p> : null}
                    {selected.emergencyContactName ? (
                      <p className="text-xs text-muted-foreground">
                        Emergency contact: {selected.emergencyContactName} {selected.emergencyContactPhone ?? ""}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Students</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {selected.students.map((student, index) => (
                      <div key={`${student.firstName}-${index}`} className="rounded border bg-muted/40 p-2">
                        <p className="font-medium">
                          {student.firstName} {student.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {student.dateOfBirth ? `DOB ${student.dateOfBirth}` : "DOB not provided"} · {student.experience}
                        </p>
                        {student.notes ? <p className="text-xs text-muted-foreground">{student.notes}</p> : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Availability</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>
                      Days: {selected.availability?.preferredDays?.join(", ") ?? "—"}
                    </p>
                    <p>
                      Time windows: {selected.availability?.preferredWindows?.join(", ") ?? "—"}
                    </p>
                    <p>
                      Desired level: {selected.availability?.desiredLevelId
                        ? levels.find((level) => level.id === selected.availability?.desiredLevelId)?.name ?? "—"
                        : "No preference"}
                    </p>
                    {selected.availability?.notes ? (
                      <p className="text-xs text-muted-foreground">{selected.availability.notes}</p>
                    ) : null}
                  </CardContent>
                </Card>

                {selected.familyId ? (
                  <Card>
                    <CardContent className="flex items-center justify-between p-4 text-sm">
                      <div>
                        <p className="font-medium">Family created</p>
                        <p className="text-xs text-muted-foreground">This onboarding is linked to a family.</p>
                      </div>
                      <Link href={`/admin/family/${selected.familyId}`} className="text-primary hover:underline">
                        View family
                      </Link>
                    </CardContent>
                  </Card>
                ) : null}
              </div>

              <SheetFooter>
                <div className="flex flex-col gap-2">
                  <Badge variant={statusBadge(selected.status)} className="w-fit">
                    {selected.status}
                  </Badge>
                  {selected.status === "NEW" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => setAcceptOpen(true)}>
                        Accept
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handleDecline(selected)}>
                        Decline
                      </Button>
                    </div>
                  ) : null}
                </div>
              </SheetFooter>

              <AcceptOnboardingDialog
                open={acceptOpen}
                onOpenChange={setAcceptOpen}
                request={selected}
                levels={levels}
                enrolmentPlans={enrolmentPlans}
                onAccepted={() => {
                  setAcceptOpen(false);
                  setSelectedId(null);
                  router.refresh();
                }}
              />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
