"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { parseReturnContext } from "@/lib/returnContext";
import { useSyncedQueryState } from "@/hooks/useSyncedQueryState";

import type { ClientStudentWithRelations } from "./types";
import { StudentEnrolmentsSection } from "./StudentEnrolmentsSection";
import { StudentModal } from "@/app/admin/family/[id]/StudentModal";
import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudent } from "@/server/student/types";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";
import { StudentBillingPanel } from "@/components/admin/student/StudentBillingPanel";
import { StudentDetailsPanel } from "@/components/admin/student/StudentDetailsPanel";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { dayLabel } from "@/app/admin/class/[id]/utils/time";
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
  const familyName = student.family?.name ?? "Family";

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

  const backHref = returnTo ?? `/admin/family/${familyId}`;
  const backLabel = returnTo?.startsWith("/admin/reception") ? "Back to Reception" : "Back";

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student</div>
              <div className="text-2xl font-semibold leading-tight">{student.name}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{student.level?.name ?? "Level not set"}</span>
                <Badge variant={status.variant} className="text-[11px]">
                  {status.label}
                </Badge>
              </div>
              {enrolmentSnapshot ? (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Enrolment snapshot
                  </div>
                  <div className="mt-1 font-medium text-foreground">{enrolmentSnapshot.classLabel}</div>
                  {enrolmentSnapshot.scheduleLabel ? (
                    <div className="text-xs text-muted-foreground">{enrolmentSnapshot.scheduleLabel}</div>
                  ) : null}
                  {enrolmentSnapshot.nextSessionLabel ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Next session {enrolmentSnapshot.nextSessionLabel}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No current enrolment snapshot yet.</div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <div className="rounded-lg border bg-muted/30 p-4 text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid through</div>
                <div className="mt-1 text-xl font-semibold">{paidThroughLabel}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Family</div>
                <div className="mt-1 text-sm font-semibold">{familyName}</div>
                <Button size="sm" variant="outline" asChild className="mt-2">
                  <Link href={`/admin/family/${familyId}`}>Go to family</Link>
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStudentSheetOpen(true)}>
            Edit student
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                Enrol / change class
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
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
            <DropdownMenuContent align="start">
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
        </CardContent>
      </Card>

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
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Action workspace</CardTitle>
              <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                <TabsTrigger value="enrolment">Enrolment</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <TabsContent value="enrolment" className="m-0 space-y-3">
              {activeTab === "enrolment" ? (
                <StudentEnrolmentsSection
                  student={student}
                  levels={levels}
                  enrolmentPlans={enrolmentPlans}
                  onUpdated={() => {
                    setEnrolmentAction(null);
                  }}
                  action={enrolmentAction}
                  onActionHandled={() => setEnrolmentAction(null)}
                  showPaidThroughAction={false}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="billing" className="m-0 space-y-3">
              {activeTab === "billing" ? (
                <StudentBillingPanel billing={billingPosition} studentId={student.id} familyId={familyId} />
              ) : null}
            </TabsContent>
            <TabsContent value="details" className="m-0 space-y-3">
              {activeTab === "details" ? <StudentDetailsPanel student={student} /> : null}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

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
