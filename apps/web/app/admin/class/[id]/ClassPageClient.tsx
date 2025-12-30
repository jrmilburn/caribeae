// /app/admin/class/[id]/ClassPageClient.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Teacher } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import type { ClassPageData } from "./types";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { EnrolmentsSection } from "./EnrolmentsSection";
import { AttendanceSection } from "./AttendanceSection";
import { DateSelector } from "./DateSelector";
import { ClassActionsMenu } from "./ClassActionsMenu";
import { SubstituteTeacherDialog } from "./SubstituteTeacherDialog";
import { minutesToTimeInput } from "./utils/time";
import { isSameDateKey } from "@/lib/dateKey";
import { cancelClassOccurrence } from "@/server/class/cancelClassOccurrence";
import { uncancelClassOccurrence } from "@/server/class/uncancelClassOccurrence";

type TabValue = "enrolments" | "attendance";

type ClassPageClientProps = {
  data: ClassPageData;
  requestedDateKey: string | null;
  initialTab: string | null;
};

export default function ClassPageClient({ data, requestedDateKey, initialTab }: ClassPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTabValue: TabValue =
    data.selectedDateKey && (initialTab === "attendance" || requestedDateKey) ? "attendance" : "enrolments";
  const [tab, setTab] = React.useState<TabValue>(initialTabValue);
  const [effectiveTeacher, setEffectiveTeacher] = React.useState<Teacher | null>(data.effectiveTeacher);
  const [teacherSubstitution, setTeacherSubstitution] = React.useState(data.teacherSubstitution);
  const [selectedDateKey, setSelectedDateKey] = React.useState(data.selectedDateKey);
  const [cancellation, setCancellation] = React.useState(data.cancellation);
  const [cancellationCredits, setCancellationCredits] = React.useState(data.cancellationCredits);
  const [subDialogOpen, setSubDialogOpen] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionPending, startAction] = React.useTransition();

  React.useEffect(() => {
    setEffectiveTeacher(data.effectiveTeacher);
    setTeacherSubstitution(data.teacherSubstitution);
    setSelectedDateKey(data.selectedDateKey);
    setCancellation(data.cancellation);
    setCancellationCredits(data.cancellationCredits);
    setActionMessage(null);
    setActionError(null);
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

  const classHeading = buildClassHeading(data);

  const handleDateChange = (nextDateKey: string) => {
    setSelectedDateKey(nextDateKey);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDateKey);
    params.set("tab", tab);
    router.push(`/admin/class/${data.template.id}?${params.toString()}`);
  };

  const handleTabChange = (next: string) => {
    const nextTab: TabValue = next === "attendance" ? "attendance" : "enrolments";
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

  const handleCancel = () => {
    if (!selectedDateKey) {
      setActionError("Select an occurrence date before cancelling.");
      return;
    }

    const confirm = window.confirm("Cancel this class occurrence? Enrolled students will be credited.");
    if (!confirm) return;

    const reason = window.prompt("Add a cancellation reason (optional):", cancellation?.reason ?? undefined) ?? undefined;

    setActionError(null);
    setActionMessage(null);

    startAction(() => {
      (async () => {
        try {
          await cancelClassOccurrence({
            templateId: data.template.id,
            dateKey: selectedDateKey,
            reason,
          });
          setActionMessage("Class occurrence cancelled and students credited.");
          router.refresh();
        } catch (e) {
          if (e instanceof Error) {
            setActionError(e.message);
          } else {
            setActionError("Unable to cancel this class occurrence.");
          }
        }
      })();
    });
  };

  const handleUncancel = () => {
    if (!selectedDateKey) {
      setActionError("Select an occurrence date before reopening.");
      return;
    }

    const confirm = window.confirm("Reopen this class occurrence and remove credits?");
    if (!confirm) return;

    setActionError(null);
    setActionMessage(null);

    startAction(() => {
      (async () => {
        try {
          await uncancelClassOccurrence({
            templateId: data.template.id,
            dateKey: selectedDateKey,
          });
          setActionMessage("Cancellation removed.");
          router.refresh();
        } catch (e) {
          if (e instanceof Error) {
            setActionError(e.message);
          } else {
            setActionError("Unable to reopen this class occurrence.");
          }
        }
      })();
    });
  };

  const hasOccurrence = Boolean(selectedDateKey);
  const isCancelled = Boolean(cancellation);

  return (
    <div className="mx-auto w-full space-y-4">
      <div className="flex flex-col gap-2 border-b bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{classHeading}</h1>
          <p className="text-sm text-muted-foreground">
            Effective teacher:{" "}
            <span className="font-medium text-foreground">
              {effectiveTeacher?.name ?? "Unassigned"}
            </span>
            {teacherSubstitution ? " (substitution applied)" : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateSelector
            availableDateKeys={data.availableDateKeys}
            selectedDateKey={selectedDateKey}
            onChange={handleDateChange}
            disabled={!data.availableDateKeys.length}
            autoSelectKey={!data.requestedDateValid ? data.selectedDateKey : null}
          />
          <ClassActionsMenu
            templateId={data.template.id}
            dateKey={selectedDateKey}
            onSubstituteClick={() => setSubDialogOpen(true)}
            onCancelClick={handleCancel}
            onUncancelClick={handleUncancel}
            isCancelled={isCancelled}
            busy={actionPending}
          />
        </div>
      </div>

      {selectedDateKey && cancellation ? (
        <CancellationBanner
          dateKey={selectedDateKey}
          cancellation={cancellation}
          credits={cancellationCredits}
        />
      ) : null}
      {actionMessage ? <p className="px-6 text-sm text-foreground">{actionMessage}</p> : null}
      {actionError ? <p className="px-6 text-sm text-destructive">{actionError}</p> : null}

      <Card className="border-l-0! border-r-0! border-b-0!">
        <CardHeader>
          <CardTitle className="text-base">Class details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassTemplateForm classTemplate={data.template} teachers={data.teachers} levels={data.levels} />
        </CardContent>
      </Card>

      <div className="px-2 sm:px-0">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="w-fit">
              <TabsTrigger value="enrolments">Enrolments</TabsTrigger>
              <TabsTrigger value="attendance" disabled={!hasOccurrence}>
                Attendance
              </TabsTrigger>
            </TabsList>
            <div className="text-sm text-muted-foreground">
              {hasOccurrence ? `Occurrence date: ${selectedDateKey}` : "No scheduled occurrences"}
            </div>
          </div>
          <Separator className="my-2" />

          <TabsContent value="enrolments">
            <EnrolmentsSection
              classTemplate={{ ...data.template, enrolments: data.enrolmentsForDate }}
              students={data.students}
              enrolmentPlans={data.enrolmentPlans}
              dateKey={selectedDateKey}
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
        </Tabs>
      </div>

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
    </div>
  );
}

function buildClassHeading(data: ClassPageData) {
  const dayName = typeof data.template.dayOfWeek === "number" ? DAY_NAMES[data.template.dayOfWeek] : "Unscheduled";
  const time =
    typeof data.template.startTime === "number" ? minutesToTimeInput(data.template.startTime) : "—";
  return `${data.template.level.name} - ${dayName} - ${time}`;
}

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function CancellationBanner({
  dateKey,
  cancellation,
  credits,
}: {
  dateKey: string;
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
          <span className="text-sm font-medium text-destructive">
            The class on {dateKey} has been cancelled.
          </span>
        </div>
        {cancellation.reason ? (
          <p className="text-sm text-destructive">Reason: {cancellation.reason}</p>
        ) : null}
        {creditedNames ? (
          <p className="text-xs text-muted-foreground">
            Students credited: {creditedNames}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
