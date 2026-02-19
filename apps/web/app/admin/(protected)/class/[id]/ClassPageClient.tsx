// /app/admin/class/[id]/ClassPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { useRouter, useSearchParams } from "next/navigation";
import type { Teacher } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { ClassPageData } from "./types";
import { EnrolmentsSection } from "./EnrolmentsSection";
import { AttendanceSection } from "./AttendanceSection";
import { DateSelector } from "./DateSelector";
import { SubstituteTeacherDialog } from "./SubstituteTeacherDialog";
import { minutesToTimeInput } from "./utils/time";
import { isSameDateKey } from "@/lib/dateKey";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { cancelClassOccurrence } from "@/server/class/cancelClassOccurrence";
import { uncancelClassOccurrence } from "@/server/class/uncancelClassOccurrence";
import { brisbaneCompare, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { parseReturnContext } from "@/lib/returnContext";
import { scheduleDateKey } from "@/packages/schedule";

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type TabValue = "enrolments" | "attendance" | "template";

type ClassPageClientProps = {
  data: ClassPageData;
  requestedDateKey: string | null;
  initialTab: string | null;
};

export default function ClassPageClient({ data, requestedDateKey, initialTab }: ClassPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTabValue: TabValue =
    initialTab === "attendance" ? "attendance" : initialTab === "template" ? "template" : "enrolments";
  const [tab, setTab] = React.useState<TabValue>(initialTabValue);
  const [effectiveTeacher, setEffectiveTeacher] = React.useState<Teacher | null>(data.effectiveTeacher);
  const [teacherSubstitution, setTeacherSubstitution] = React.useState(data.teacherSubstitution);
  const [selectedDateKey, setSelectedDateKey] = React.useState(data.selectedDateKey);
  const [cancellation, setCancellation] = React.useState(data.cancellation);
  const [cancellationCredits, setCancellationCredits] = React.useState(data.cancellationCredits);
  const [subDialogOpen, setSubDialogOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = React.useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = React.useState(false);
  const [pendingCancelReason, setPendingCancelReason] = React.useState<string | null>(null);
  const [selectedCreditIds, setSelectedCreditIds] = React.useState<string[]>([]);
  const [actionPending, startAction] = React.useTransition();

  const returnTo = parseReturnContext(searchParams);
  const todayDateKey = React.useMemo(() => toBrisbaneDayKey(new Date()), []);
  const fallbackSchedule = React.useMemo(() => {
    const params = new URLSearchParams({
      view: "week",
      date: scheduleDateKey(new Date()),
    });
    return `/admin/schedule?${params.toString()}`;
  }, []);
  const scheduleHref = returnTo ?? fallbackSchedule;
  const handleBackToSchedule = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        event.preventDefault();
        router.back();
      }
    },
    [router]
  );

  React.useEffect(() => {
    setEffectiveTeacher(data.effectiveTeacher);
    setTeacherSubstitution(data.teacherSubstitution);
    setSelectedDateKey(data.selectedDateKey);
    setCancellation(data.cancellation);
    setCancellationCredits(data.cancellationCredits);
  }, [data]);

  React.useEffect(() => {
    if (!data.selectedDateKey && tab === "attendance") {
      setTab("enrolments");
    }
  }, [data.selectedDateKey, tab]);

  React.useEffect(() => {
    if (data.requestedDateValid) return;
    if (!data.selectedDateKey) return;
    if (isSameDateKey(data.selectedDateKey, requestedDateKey)) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("date", data.selectedDateKey);
    params.set("tab", tab);

    const targetSearch = params.toString();
    if (targetSearch === searchParams.toString()) return;

    router.replace(`/admin/class/${data.template.id}?${targetSearch}`);
  }, [data.requestedDateValid, data.selectedDateKey, requestedDateKey, router, searchParams, tab, data.template.id]);

  const classHeading = data.template.name?.trim() || "Untitled class";
  const levelName = data.template.level?.name ?? "Level";
  const scheduleSummary = buildScheduleSummary(data);

  const handleDateChange = (nextDateKey: string) => {
    setSelectedDateKey(nextDateKey);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDateKey);
    params.set("tab", tab);
    router.push(`/admin/class/${data.template.id}?${params.toString()}`);
  };

  const handleTabChange = (next: string) => {
    const nextTab: TabValue = next === "attendance" ? "attendance" : next === "template" ? "template" : "enrolments";
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (selectedDateKey) {
      params.set("date", selectedDateKey);
    } else {
      params.delete("date");
    }
    params.set("tab", nextTab);
    router.replace(`/admin/class/${data.template.id}?${params.toString()}`);
  };

  const handleCancel = (reason?: string | null) => {
    if (!selectedDateKey) return;
    setPendingCancelReason(reason ?? null);
    setCancelDialogOpen(false);
    setCreditDialogOpen(true);
  };

  const handleCreditConfirm = (creditIds: string[]) => {
    if (!selectedDateKey) return;

    startAction(() => {
      void runMutationWithToast(
        () =>
          cancelClassOccurrence({
            templateId: data.template.id,
            dateKey: selectedDateKey,
            reason: pendingCancelReason ?? undefined,
            creditedEnrolmentIds: creditIds,
          }),
        {
          pending: { title: "Cancelling class..." },
          success: {
            title: "Class cancelled",
            description: creditIds.length ? "Credits saved for selected students." : "No credits applied.",
          },
          error: (message) => ({
            title: "Unable to cancel class",
            description: message,
          }),
          onSuccess: () => {
            setCreditDialogOpen(false);
            setPendingCancelReason(null);
            router.refresh();
          },
        }
      );
    });
  };

  const handleUncancel = () => {
    if (!selectedDateKey) return;

    startAction(() => {
      void runMutationWithToast(
        () =>
          uncancelClassOccurrence({
            templateId: data.template.id,
            dateKey: selectedDateKey,
          }),
        {
          pending: { title: "Reopening class..." },
          success: { title: "Class reopened" },
          error: (message) => ({
            title: "Unable to reopen class",
            description: message,
          }),
          onSuccess: () => {
            setReopenDialogOpen(false);
            router.refresh();
          },
        }
      );
    });
  };

  const hasOccurrence = Boolean(selectedDateKey);
  const isCancelled = Boolean(cancellation);
  const attendanceActionLabel = buildAttendanceActionLabel(selectedDateKey, todayDateKey);

  return (
    <div className="mx-auto w-full space-y-4">
      <Tabs value={tab} onValueChange={handleTabChange} className="gap-0">
        <ClassOccurrenceHeader
          classHeading={classHeading}
          levelName={levelName}
          isCancelled={isCancelled}
          scheduleSummary={scheduleSummary}
          selectedDateKey={selectedDateKey}
          teacherName={effectiveTeacher?.name ?? null}
          teacherSubstitution={Boolean(teacherSubstitution)}
          scheduleHref={scheduleHref}
          onBackToSchedule={handleBackToSchedule}
          availableDateKeys={data.availableDateKeys}
          onDateChange={handleDateChange}
          autoSelectDateKey={!data.requestedDateValid ? data.selectedDateKey : null}
          hasOccurrence={hasOccurrence}
          attendanceActionLabel={attendanceActionLabel}
          onTakeAttendance={() => handleTabChange("attendance")}
          onSubstituteTeacher={() => setSubDialogOpen(true)}
          onCancelClass={() => setCancelDialogOpen(true)}
          onReopenClass={() => setReopenDialogOpen(true)}
          actionPending={actionPending}
        />

        {selectedDateKey && cancellation ? (
          <CancellationBanner cancellation={cancellation} credits={cancellationCredits} />
        ) : null}

        <div className="px-2 sm:px-0">
          <Separator className="my-2" />

          <TabsContent value="enrolments">
            <EnrolmentsSection
              classTemplate={{ ...data.template, enrolments: data.enrolmentsForDate }}
              classTemplates={data.classTemplates}
              students={data.students}
              enrolmentPlans={data.enrolmentPlans}
              dateKey={selectedDateKey}
              levels={data.levels}
              isCancelled={isCancelled}
            />
          </TabsContent>

          <TabsContent value="attendance">
            <AttendanceSection
              templateId={data.template.id}
              dateKey={selectedDateKey}
              roster={data.roster}
              isCancelled={isCancelled}
              cancellationCredits={cancellationCredits}
            />
          </TabsContent>

          <TabsContent value="template">
            <Card className="border-none shadow-none">
              <CardHeader className="gap-1">
                <CardTitle className="text-base">Template settings</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Update the schedule, capacity, and default teacher for future occurrences.
                </p>
              </CardHeader>
              <CardContent>
                <ClassTemplateForm
                  classTemplate={data.template}
                  teachers={data.teachers}
                  levels={data.levels}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <SubstituteTeacherDialog
        open={subDialogOpen}
        onOpenChange={setSubDialogOpen}
        templateId={data.template.id}
        dateKey={selectedDateKey}
        teachers={data.teachers}
        effectiveTeacher={effectiveTeacher}
        onUpdated={(payload) => {
          setTeacherSubstitution(payload.teacherSubstitution);
          setEffectiveTeacher(payload.effectiveTeacher);
        }}
      />

      <CancelClassDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        dateKey={selectedDateKey}
        busy={actionPending}
        onConfirm={handleCancel}
      />

      <CreditStudentsDialog
        open={creditDialogOpen}
        onOpenChange={(open) => {
          setCreditDialogOpen(open);
          if (!open) {
            setPendingCancelReason(null);
            setSelectedCreditIds([]);
          }
        }}
        dateKey={selectedDateKey}
        busy={actionPending}
        enrolments={data.cancellationCandidates}
        selectedIds={selectedCreditIds}
        onSelectionChange={setSelectedCreditIds}
        onConfirm={handleCreditConfirm}
      />

      <ReopenClassDialog
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        dateKey={selectedDateKey}
        busy={actionPending}
        onConfirm={handleUncancel}
      />
    </div>
  );
}

type ClassOccurrenceHeaderProps = {
  classHeading: string;
  levelName: string;
  isCancelled: boolean;
  scheduleSummary: string;
  selectedDateKey: string | null;
  teacherName: string | null;
  teacherSubstitution: boolean;
  scheduleHref: string;
  onBackToSchedule: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  availableDateKeys: string[];
  onDateChange: (nextDateKey: string) => void;
  autoSelectDateKey: string | null;
  hasOccurrence: boolean;
  attendanceActionLabel: string;
  onTakeAttendance: () => void;
  onSubstituteTeacher: () => void;
  onCancelClass: () => void;
  onReopenClass: () => void;
  actionPending: boolean;
};

function ClassOccurrenceHeader({
  classHeading,
  levelName,
  isCancelled,
  scheduleSummary,
  selectedDateKey,
  teacherName,
  teacherSubstitution,
  scheduleHref,
  onBackToSchedule,
  availableDateKeys,
  onDateChange,
  autoSelectDateKey,
  hasOccurrence,
  attendanceActionLabel,
  onTakeAttendance,
  onSubstituteTeacher,
  onCancelClass,
  onReopenClass,
  actionPending,
}: ClassOccurrenceHeaderProps) {
  return (
    <header className="border-b bg-white px-4 py-4 sm:px-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Link
                href={scheduleHref}
                onClick={onBackToSchedule}
                className="inline-flex items-center rounded-sm py-0.5 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Schedule
              </Link>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-foreground" aria-current="page">
                {classHeading}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{classHeading}</h1>
              <Badge variant="secondary" className="text-xs">
                {levelName}
              </Badge>
              {isCancelled ? (
                <Badge variant="destructive" className="text-xs">
                  Cancelled
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {[
                scheduleSummary,
                selectedDateKey ? formatBrisbaneDate(selectedDateKey) : "Select an occurrence date",
                `Teacher: ${teacherName ?? "Unassigned"}`,
              ]
                .filter(Boolean)
                .join(" • ")}
              {teacherSubstitution ? " • Substitution applied" : null}
            </p>
          </div>

          <div className="w-full sm:w-auto">
            <DateSelector
              className="w-full sm:w-auto"
              availableDateKeys={availableDateKeys}
              selectedDateKey={selectedDateKey}
              onChange={onDateChange}
              disabled={!availableDateKeys.length}
              autoSelectKey={autoSelectDateKey}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-11 w-full justify-start overflow-x-auto p-1 sm:w-fit">
            <TabsTrigger value="enrolments" className="px-4">
              Enrolments
            </TabsTrigger>
            <TabsTrigger value="attendance" disabled={!hasOccurrence} className="px-4">
              Attendance
            </TabsTrigger>
            <TabsTrigger value="template" className="px-4">
              Template
            </TabsTrigger>
          </TabsList>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
            <Button onClick={onTakeAttendance} disabled={!hasOccurrence} className="w-full lg:w-auto">
              {attendanceActionLabel}
            </Button>
            <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={onSubstituteTeacher}
                disabled={!hasOccurrence}
                className="w-full lg:w-auto"
              >
                Substitute teacher
              </Button>
              {isCancelled ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onReopenClass}
                  disabled={!hasOccurrence || actionPending}
                  className="w-full lg:w-auto"
                >
                  Reopen class
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancelClass}
                  disabled={!hasOccurrence || actionPending}
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 lg:w-auto"
                >
                  Cancel class
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function buildAttendanceActionLabel(selectedDateKey: string | null, todayDateKey: string) {
  if (!selectedDateKey || isSameDateKey(selectedDateKey, todayDateKey)) return "Take attendance";
  return `Attendance - ${formatBrisbaneDate(selectedDateKey)}`;
}

function buildScheduleSummary(data: ClassPageData) {
  const dayName = typeof data.template.dayOfWeek === "number" ? DAY_NAMES[data.template.dayOfWeek] : null;
  const start = typeof data.template.startTime === "number" ? minutesToTimeInput(data.template.startTime) : null;
  const end = typeof data.template.endTime === "number" ? minutesToTimeInput(data.template.endTime) : null;

  if (!dayName && !start && !end) return "Schedule TBD";

  const timeRange = start && end ? `${toMeridiem(start)}–${toMeridiem(end)}` : start ? toMeridiem(start) : "";
  return [dayName, timeRange].filter(Boolean).join(" ").trim();
}

function toMeridiem(time: string) {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${normalizedHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function CancellationBanner({
  cancellation,
  credits,
}: {
  cancellation: ClassPageData["cancellation"];
  credits: ClassPageData["cancellationCredits"];
}) {
  if (!cancellation) return null;

  const creditedNames = credits
    .map((c) => c.enrolment.student.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="px-6">
      <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">Cancelled</Badge>
          <span className="text-sm font-medium text-destructive">This occurrence has been cancelled.</span>
        </div>
        {cancellation.reason ? (
          <p className="text-sm text-destructive">Reason: {cancellation.reason}</p>
        ) : null}
        {creditedNames ? (
          <p className="text-xs text-muted-foreground">Students credited: {creditedNames}.</p>
        ) : null}
      </div>
    </div>
  );
}

function CancelClassDialog({
  open,
  onOpenChange,
  dateKey,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateKey: string | null;
  busy: boolean;
  onConfirm: (reason?: string | null) => void;
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Cancel class</DialogTitle>
          <DialogDescription>
            This will cancel the selected occurrence. You can choose which students to credit next.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This action is irreversible for {dateKey ? formatBrisbaneDate(dateKey) : "the selected date"}.
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Add a note for families or staff"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep class
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={busy || !dateKey}
          >
            {busy ? "Cancelling..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditStudentsDialog({
  open,
  onOpenChange,
  dateKey,
  busy,
  enrolments,
  selectedIds,
  onSelectionChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateKey: string | null;
  busy: boolean;
  enrolments: ClassPageData["cancellationCandidates"];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onConfirm: (ids: string[]) => void;
}) {
  const eligibleIds = React.useMemo(() => {
    if (!dateKey) return new Set<string>();
    return new Set(
      enrolments
        .filter((enrolment) => {
          const paidThrough = enrolment.paidThroughDate ?? null;
          if (!paidThrough) return false;
          return brisbaneCompare(toBrisbaneDayKey(paidThrough), dateKey) >= 0;
        })
        .map((enrolment) => enrolment.id)
    );
  }, [dateKey, enrolments]);

  React.useEffect(() => {
    if (!open) return;
    const defaults = enrolments
      .filter((enrolment) => eligibleIds.has(enrolment.id))
      .map((enrolment) => enrolment.id);
    onSelectionChange(defaults);
  }, [eligibleIds, enrolments, onSelectionChange, open]);

  const toggleSelection = (enrolmentId: string, checked: boolean | "indeterminate") => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(enrolmentId);
    } else {
      next.delete(enrolmentId);
    }
    onSelectionChange(Array.from(next));
  };

  const selectionCount = selectedIds.length;
  const unpaidCount = enrolments.filter((enrolment) => !eligibleIds.has(enrolment.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Credit students?</DialogTitle>
          <DialogDescription>
            Choose who should receive a credit for {dateKey ? formatBrisbaneDate(dateKey) : "this date"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {enrolments.length ? (
            <ScrollArea className="max-h-64 rounded-md border">
              <div className="space-y-2 p-3">
                {enrolments.map((enrolment) => {
                  const checked = selectedIds.includes(enrolment.id);
                  const eligible = eligibleIds.has(enrolment.id);
                  return (
                    <label key={enrolment.id} className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleSelection(enrolment.id, value)}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{enrolment.student.name}</span>
                        {!eligible ? (
                          <span className="text-xs text-muted-foreground">
                            Not paid through this date.
                          </span>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              No enrolled students for this occurrence.
            </div>
          )}
          {unpaidCount ? (
            <p className="text-xs text-muted-foreground">
              Unpaid students can still be credited; their coverage will update once payments catch up.
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selectionCount} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Back
            </Button>
            <Button onClick={() => onConfirm(selectedIds)} disabled={busy || !dateKey}>
              {busy ? "Saving..." : "Confirm cancellation"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenClassDialog({
  open,
  onOpenChange,
  dateKey,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateKey: string | null;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Reopen class</DialogTitle>
          <DialogDescription>
            Reopen the cancelled occurrence and remove any credits that were issued.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Occurrence: {dateKey ? formatBrisbaneDate(dateKey) : "Select a date"}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep cancelled
          </Button>
          <Button onClick={onConfirm} disabled={busy || !dateKey}>
            {busy ? "Reopening..." : "Reopen class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
