"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { parseReturnContext } from "@/lib/returnContext";
import { useSyncedQueryState } from "@/hooks/useSyncedQueryState";

import type { ClientStudentWithRelations } from "./types";
import { StudentEnrolmentsSection } from "./StudentEnrolmentsSection";
import { StudentModal } from "@/app/admin/(protected)/family/[id]/StudentModal";
import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudent } from "@/server/student/types";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";
import { StudentBillingPanel } from "@/components/admin/student/StudentBillingPanel";
import { StudentDetailsPanel } from "@/components/admin/student/StudentDetailsPanel";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { dayLabel } from "@/app/admin/(protected)/class/[id]/utils/time";
import {
  formatScheduleWeekdayTime,
  scheduleAddDays,
  scheduleDateAtMinutes,
  scheduleDayOfWeekIndex,
  scheduleMinutesSinceMidnight,
} from "@/packages/schedule";

type TabKey = "enrolment" | "billing" | "details";

type StudentStatus = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

function resolveStudentStatus(enrolments: Array<{ entitlementStatus?: string }> | undefined): StudentStatus {
  if (!enrolments || enrolments.length === 0) {
    return { label: "Not enrolled", variant: "outline" };
  }

  const statuses = enrolments.map((enrolment) => enrolment.entitlementStatus ?? "UNKNOWN");
  if (statuses.includes("OVERDUE")) return { label: "Overdue", variant: "destructive" };
  if (statuses.includes("DUE_SOON")) return { label: "Due soon", variant: "secondary" };
  if (statuses.includes("AHEAD")) return { label: "Ahead", variant: "outline" };
  return { label: "Unknown", variant: "outline" };
}

function resolveStudentPaidThrough(
  enrolments: Array<{
    projectedCoverageEnd?: Date | null;
    paidThroughDate?: Date | null;
    latestCoverageEnd?: Date | null;
  }> = []
) {
  if (!enrolments.length) return "Not enrolled";
  const dates = enrolments
    .map((enrolment) => enrolment.projectedCoverageEnd ?? enrolment.paidThroughDate ?? enrolment.latestCoverageEnd)
    .filter(Boolean) as Date[];
  const latest = dates.length
    ? dates.reduce((acc, curr) => (acc && acc > curr ? acc : curr))
    : null;
  return latest ? formatBrisbaneDate(latest) : "Not prepaid";
}

function formatTimeRange(start?: number | null, end?: number | null) {
  if (typeof start !== "number") return "";
  const startDate = minutesToDate(start);
  const endDate = typeof end === "number" ? minutesToDate(end) : null;
  return `${format(startDate, "h:mm a")}${endDate ? ` - ${format(endDate, "h:mm a")}` : ""}`;
}

function minutesToDate(minutes: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

type EnrolmentRow = ClientStudentWithRelations["enrolments"][number];

type EnrolmentTemplate =
  | NonNullable<EnrolmentRow["template"]>
  | NonNullable<EnrolmentRow["classAssignments"]>[number]["template"];

type SessionSnapshot = {
  classLabel: string;
  scheduleLabel?: string | null;
  nextSessionLabel?: string | null;
};

type NextSession = {
  template: EnrolmentTemplate;
  date: Date;
};

function resolvePrimaryEnrolment(enrolments: EnrolmentRow[]) {
  const active = enrolments.find((enrolment) =>
    enrolment.status === "ACTIVE" || enrolment.status === "CHANGEOVER"
  );
  return active ?? enrolments[0] ?? null;
}

function resolveEnrolmentTemplates(enrolment: EnrolmentRow): EnrolmentTemplate[] {
  const assignments = enrolment.classAssignments?.length
    ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
    : [];
  if (assignments.length) return assignments as EnrolmentTemplate[];
  return enrolment.template ? [enrolment.template] : [];
}

function resolveScheduleLabel(template: EnrolmentTemplate | undefined) {
  if (!template) return null;
  const day = typeof template.dayOfWeek === "number" ? dayLabel(template.dayOfWeek) : null;
  const time = formatTimeRange(template.startTime, template.endTime);
  if (day && time) return `${day} ${time}`;
  return day ?? time ?? null;
}

function resolveNextSession(templates: EnrolmentTemplate[]): NextSession | null {
  if (!templates.length) return null;
  const now = new Date();
  const todayIndex = scheduleDayOfWeekIndex(now);
  const nowMinutes = scheduleMinutesSinceMidnight(now);
  const baseDate = scheduleDateAtMinutes(now, 0);

  const sessions = templates
    .map((template) => {
      if (typeof template.dayOfWeek !== "number") return null;
      if (typeof template.startTime !== "number") return null;
      let daysUntil = (template.dayOfWeek - todayIndex + 7) % 7;
      if (daysUntil === 0 && nowMinutes >= template.startTime) {
        daysUntil = 7;
      }
      const day = scheduleAddDays(baseDate, daysUntil);
      const date = scheduleDateAtMinutes(day, template.startTime);
      return { template, date } as NextSession;
    })
    .filter(Boolean) as NextSession[];

  if (!sessions.length) return null;
  return sessions.sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null;
}

export default function StudentPageClient({
  student,
  levels,
  enrolmentPlans,
  billingPosition,
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
  billingPosition: FamilyBillingPosition;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = parseReturnContext(searchParams);

  const [activeTab, setActiveTab] = useSyncedQueryState<TabKey>("tab", {
    defaultValue: "enrolment",
    parse: (value) => {
      if (value === "billing") return "billing";
      if (value === "details") return "details";
      return "enrolment";
    },
    serialize: (value) => (value === "enrolment" ? null : value),
  });

  const [enrolmentAction, setEnrolmentAction] = React.useState<
    "add-enrolment" | "change-enrolment" | null
  >(null);
  const [studentSheetOpen, setStudentSheetOpen] = React.useState(false);
  const [paidThroughTarget, setPaidThroughTarget] = React.useState<{
    enrolmentId: string;
    currentPaidThrough: Date | null;
  } | null>(null);

  const familyId = student.family?.id ?? student.familyId;

  const billingStudent = billingPosition.students.find((entry) => entry.id === student.id) ?? null;
  const status = resolveStudentStatus(billingStudent?.enrolments);
  const paidThroughLabel = resolveStudentPaidThrough(billingStudent?.enrolments ?? []);

  const enrolmentSnapshot = React.useMemo<SessionSnapshot | null>(() => {
    const primaryEnrolment = resolvePrimaryEnrolment(student.enrolments);
    if (!primaryEnrolment) return null;
    const templates = resolveEnrolmentTemplates(primaryEnrolment);
    if (!templates.length) return null;
    const nextSession = resolveNextSession(templates);
    const templateForLabel = nextSession?.template ?? templates[0];
    const classLabel = templateForLabel?.name ?? templateForLabel?.level?.name ?? "Class";
    const scheduleLabel = resolveScheduleLabel(templateForLabel);
    return {
      classLabel,
      scheduleLabel,
      nextSessionLabel: nextSession ? formatScheduleWeekdayTime(nextSession.date) : null,
    };
  }, [student.enrolments]);

  const handleEnrolmentAction = (action: "add-enrolment" | "change-enrolment") => {
    setActiveTab("enrolment");
    setEnrolmentAction(action);
  };

  const handleSaveStudent = async (payload: ClientStudent & { familyId: string; id?: string }) => {
    try {
      await updateStudent({ ...payload, id: student.id, familyId: student.familyId });
      toast.success("Student updated.");
      return { success: true };
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Unable to update student.");
      return { success: false };
    }
  };

  const paidThroughOptions = billingStudent?.enrolments ?? [];
  type BillingEnrolment = FamilyBillingPosition["students"][number]["enrolments"][number];
  const paidThroughDetail = paidThroughOptions.length
    ? `${paidThroughOptions.length} billing enrolment${paidThroughOptions.length === 1 ? "" : "s"}`
    : "No billing enrolments yet";
  const enrolmentLabel = enrolmentSnapshot?.classLabel ?? "Not enrolled";
  const enrolmentDetail = enrolmentSnapshot?.scheduleLabel ?? "No active class schedule yet";
  const nextSessionLabel = enrolmentSnapshot?.nextSessionLabel ?? "Not scheduled";
  const nextSessionDetail = enrolmentSnapshot
    ? "Based on assigned class schedule"
    : "No upcoming session for this student";
  const familyBalanceLabel = formatCurrencyFromCents(billingPosition.outstandingCents);
  const familyBalanceDetail =
    billingPosition.outstandingCents > 0
      ? "Outstanding across the family account"
      : "Family account is currently settled or in credit";
  const breadcrumbHref = returnTo?.startsWith("/admin/family")
    ? returnTo
    : "/admin/family?view=students";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-scroll">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="border-b border-gray-200 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <Link href={breadcrumbHref} className="hover:text-gray-900">
                    Students
                  </Link>
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  <span className="font-medium text-gray-900">{student.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{student.name}</h1>
                  <Badge variant={status.variant} className="text-[11px]">
                    {status.label}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">
                  Manage enrolments, billing, and profile details for this student.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <RecordPaymentSheet
                  familyId={familyId}
                  enrolments={billingPosition.enrolments}
                  openInvoices={billingPosition.openInvoices ?? []}
                  trigger={<Button size="sm">Take payment</Button>}
                />
                <PayAheadSheet
                  familyId={familyId}
                  trigger={
                    <Button size="sm" variant="outline">
                      Pay ahead
                    </Button>
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="secondary">
                      Enrol / change class
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Enrolment actions</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => handleEnrolmentAction("add-enrolment")}>
                      Add enrolment
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleEnrolmentAction("change-enrolment")}>
                      Change enrolment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={paidThroughOptions.length === 0}>
                      Edit paid-through
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Select enrolment</DropdownMenuLabel>
                    {paidThroughOptions.length === 0 ? (
                      <DropdownMenuItem disabled>No enrolments available</DropdownMenuItem>
                    ) : (
                      paidThroughOptions.map((enrolment: BillingEnrolment) => {
                        const paidThrough =
                          enrolment.projectedCoverageEnd ??
                          enrolment.paidThroughDate ??
                          enrolment.latestCoverageEnd ??
                          null;
                        const label = enrolment.templateName
                          ? `${enrolment.planName} - ${enrolment.templateName}`
                          : enrolment.planName;
                        return (
                          <DropdownMenuItem
                            key={enrolment.id}
                            onSelect={() =>
                              setPaidThroughTarget({
                                enrolmentId: enrolment.id,
                                currentPaidThrough: paidThrough,
                              })
                            }
                          >
                            {label}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="outline" onClick={() => setStudentSheetOpen(true)}>
                  Edit student
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/admin/family/${familyId}`}>Open family</Link>
                </Button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Paid through" value={paidThroughLabel} detail={paidThroughDetail} />
            <SummaryCard label="Current class" value={enrolmentLabel} detail={enrolmentDetail} />
            <SummaryCard label="Next session" value={nextSessionLabel} detail={nextSessionDetail} />
            <SummaryCard label="Family balance" value={familyBalanceLabel} detail={familyBalanceDetail} />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "billing" || value === "details") {
                setActiveTab(value);
              } else {
                setActiveTab("enrolment");
              }
            }}
            className="space-y-4"
          >
            <div className="border-b border-gray-200">
              <TabsList className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="enrolment"
                  className="h-11 flex-none cursor-pointer rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  Enrolment
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="h-11 flex-none cursor-pointer rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  Billing
                </TabsTrigger>
                <TabsTrigger
                  value="details"
                  className="h-11 flex-none cursor-pointer rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  Details
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="enrolment" className="m-0 space-y-3">
              {activeTab === "enrolment" ? (
                <StudentEnrolmentsSection
                  student={student}
                  levels={levels}
                  enrolmentPlans={enrolmentPlans}
                  layout="plain"
                  onUpdated={() => {
                    setEnrolmentAction(null);
                    router.refresh();
                  }}
                  action={enrolmentAction}
                  onActionHandled={() => setEnrolmentAction(null)}
                  showPaidThroughAction={false}
                  editContextSource="student"
                />
              ) : null}
            </TabsContent>
            <TabsContent value="billing" className="m-0 space-y-3">
              {activeTab === "billing" ? (
                <StudentBillingPanel
                  billing={billingPosition}
                  studentId={student.id}
                  familyId={familyId}
                  layout="plain"
                />
              ) : null}
            </TabsContent>
            <TabsContent value="details" className="m-0 space-y-3">
              {activeTab === "details" ? <StudentDetailsPanel student={student} layout="plain" /> : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <StudentModal
        open={studentSheetOpen}
        onOpenChange={setStudentSheetOpen}
        familyId={student.familyId}
        student={student}
        onSave={handleSaveStudent}
        levels={levels}
      />

      {paidThroughTarget ? (
        <EditPaidThroughDialog
          enrolmentId={paidThroughTarget.enrolmentId}
          currentPaidThrough={paidThroughTarget.currentPaidThrough}
          open={Boolean(paidThroughTarget)}
          onOpenChange={(open) => {
            if (!open) setPaidThroughTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{detail}</div>
    </div>
  );
}
