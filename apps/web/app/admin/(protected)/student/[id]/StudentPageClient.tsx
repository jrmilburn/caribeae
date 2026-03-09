"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

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
import { StudentHeader, type StudentHeaderStatus } from "./StudentHeader";
import { StudentSummaryRow } from "./StudentSummaryRow";

type TabKey = "enrolments" | "billing" | "details";

function resolveStudentStatus(
  enrolments: Array<{ entitlementStatus?: string }> | undefined
): StudentHeaderStatus {
  if (!enrolments || enrolments.length === 0) {
    return { label: "Not enrolled", variant: "outline" };
  }

  const statuses = enrolments.map((enrolment) => enrolment.entitlementStatus ?? "UNKNOWN");
  if (statuses.includes("OVERDUE")) return { label: "Payment overdue", variant: "destructive" };
  if (statuses.includes("DUE_SOON")) return { label: "Payment due soon", variant: "secondary" };
  if (statuses.includes("AHEAD")) return { label: "Paid ahead", variant: "outline" };
  return { label: "Billing pending", variant: "outline" };
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
    defaultValue: "enrolments",
    parse: (value) => {
      if (value === "enrolment" || value === "enrolments") return "enrolments";
      if (value === "billing") return "billing";
      if (value === "details") return "details";
      return "enrolments";
    },
    serialize: (value) => (value === "enrolments" ? null : value),
  });

  const [enrolmentAction, setEnrolmentAction] = React.useState<
    "add-enrolment" | "change-enrolment" | null
  >(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);
  const [payAheadSheetOpen, setPayAheadSheetOpen] = React.useState(false);
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
  const paidThroughDetail = paidThroughOptions.length
    ? `${paidThroughOptions.length} active billing plan${paidThroughOptions.length === 1 ? "" : "s"}`
    : "No billing plan yet";
  const enrolmentLabel = enrolmentSnapshot?.classLabel ?? "Not enrolled";
  const enrolmentDetail = enrolmentSnapshot?.scheduleLabel ?? "No active class schedule yet";
  const nextSessionLabel = enrolmentSnapshot?.nextSessionLabel ?? "Not scheduled";
  const nextSessionDetail = enrolmentSnapshot
    ? "Based on assigned class schedule"
    : "No upcoming session for this student";
  const familyBalanceValue =
    billingPosition.outstandingCents > 0
      ? formatCurrencyFromCents(billingPosition.outstandingCents)
      : billingPosition.unallocatedCents > 0
        ? formatCurrencyFromCents(billingPosition.unallocatedCents)
        : "Settled";
  const familyBalanceLabel =
    billingPosition.outstandingCents > 0
      ? "Outstanding"
      : billingPosition.unallocatedCents > 0
        ? "Credit available"
        : "Balance";
  const familyBalanceDetail =
    billingPosition.outstandingCents > 0
      ? "Shared across the whole family account."
      : billingPosition.unallocatedCents > 0
        ? "Family credit can be used across siblings."
        : "No balance due across the family account.";
  const breadcrumbHref = returnTo?.startsWith("/admin/family")
    ? returnTo
    : "/admin/family?view=students";
  const breadcrumbLabel = returnTo?.startsWith("/admin/family")
    ? student.family?.name ?? "Family"
    : "Students";
  const subtitleParts = [student.level?.name ? `Level ${student.level.name}` : null, student.family?.name]
    .filter(Boolean)
    .join(" • ");
  const familyMeta = billingPosition.nextDueInvoice?.dueAt
    ? `Next family invoice due ${formatBrisbaneDate(billingPosition.nextDueInvoice.dueAt)}`
    : billingPosition.unallocatedCents > 0
      ? "Family credit is available."
      : "Family billing is up to date.";
  type BillingEnrolment = FamilyBillingPosition["students"][number]["enrolments"][number];
  const paidThroughMenuOptions = paidThroughOptions.map((enrolment: BillingEnrolment) => {
    const currentPaidThrough =
      enrolment.projectedCoverageEnd ??
      enrolment.paidThroughDate ??
      enrolment.latestCoverageEnd ??
      null;
    const label = enrolment.templateName
      ? `${enrolment.planName} • ${enrolment.templateName}`
      : enrolment.planName;
    return {
      id: enrolment.id,
      label,
      currentPaidThrough,
    };
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-scroll">
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <StudentHeader
            breadcrumbHref={breadcrumbHref}
            breadcrumbLabel={breadcrumbLabel}
            title={student.name}
            subtitle={subtitleParts || null}
            status={status}
            familyHref={`/admin/family/${familyId}`}
            paidThroughOptions={paidThroughMenuOptions}
            onOpenPayment={() => setPaymentSheetOpen(true)}
            onOpenPayAhead={() => setPayAheadSheetOpen(true)}
            onEditStudent={() => setStudentSheetOpen(true)}
            onEditPaidThrough={(option) =>
              setPaidThroughTarget({
                enrolmentId: option.id,
                currentPaidThrough: option.currentPaidThrough,
              })
            }
          />

          <StudentSummaryRow
            items={[
              { label: "Paid through", value: paidThroughLabel, detail: paidThroughDetail },
              { label: "Current class", value: enrolmentLabel, detail: enrolmentDetail },
              { label: "Next session", value: nextSessionLabel, detail: nextSessionDetail },
            ]}
            familyBalanceLabel={familyBalanceLabel}
            familyBalanceValue={familyBalanceValue}
            familyBalanceDetail={familyBalanceDetail}
            familyMeta={familyMeta}
          />

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "billing" || value === "details") {
                setActiveTab(value);
              } else {
                setActiveTab("enrolments");
              }
            }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-auto w-fit justify-start rounded-lg bg-muted/60 p-1">
                <TabsTrigger
                  value="enrolments"
                  className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Enrolments
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Billing
                </TabsTrigger>
                <TabsTrigger
                  value="details"
                  className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Details
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="enrolments" className="m-0">
              {activeTab === "enrolments" ? (
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
            <TabsContent value="billing" className="m-0">
              {activeTab === "billing" ? (
                <StudentBillingPanel
                  billing={billingPosition}
                  studentId={student.id}
                  familyId={familyId}
                  layout="plain"
                />
              ) : null}
            </TabsContent>
            <TabsContent value="details" className="m-0">
              {activeTab === "details" ? (
                <StudentDetailsPanel
                  student={student}
                  layout="plain"
                  onEdit={() => setStudentSheetOpen(true)}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <RecordPaymentSheet
        familyId={familyId}
        enrolments={billingPosition.enrolments}
        openInvoices={billingPosition.openInvoices ?? []}
        open={paymentSheetOpen}
        onOpenChange={setPaymentSheetOpen}
        trigger={null}
      />

      <PayAheadSheet
        familyId={familyId}
        open={payAheadSheetOpen}
        onOpenChange={setPayAheadSheetOpen}
        trigger={null}
      />

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
          presentation="sheet"
          onOpenChange={(open) => {
            if (!open) setPaidThroughTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
