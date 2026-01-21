"use client";

import * as React from "react";
import type { Prisma, Student } from "@prisma/client";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FamilyHeaderSummary } from "@/components/admin/FamilyHeaderSummary";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";

import FamilyDetails from "./FamilyDetails";
import StudentDetails from "./StudentDetails";
import FamilyInvoices from "./FamilyInvoices";
import { FamilyBillingPositionCard } from "./FamilyBillingPositionCard";
import { StudentModal } from "./StudentModal";
import { FamilyTransitionWizard } from "./FamilyTransitionWizard";
import { CatchUpPaymentDialog } from "./CatchUpPaymentDialog";

import type { EnrolmentPlan, Level } from "@prisma/client";
import type { UnpaidFamiliesSummary } from "@/server/invoicing";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import type getClassTemplates from "@/server/classTemplate/getClassTemplates";
import type { getAccountOpeningState } from "@/server/family/getAccountOpeningState";
import { createStudent } from "@/server/student/createStudent";
import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudent } from "@/server/student/types";

export type FamilyWithStudentsAndInvoices = Prisma.FamilyGetPayload<{
  include: {
    students: {
      include: {
        enrolments: {
          select: {
            id: true;
            templateId: true;
            startDate: true;
            endDate: true;
            paidThroughDate: true;
            status: true;
            plan: { select: { name: true; billingType: true } };
            classAssignments: {
              select: {
                templateId: true;
                template: { select: { id: true; name: true; dayOfWeek: true; startTime: true; endTime: true } };
              };
            };
          };
        };
        levelChanges: {
          include: {
            fromLevel: true;
            toLevel: true;
          };
          orderBy: { effectiveDate: "desc" };
        };
      };
    };
    invoices: {
      include: {
        enrolment: {
          select: {
            id: true;
            startDate: true;
            endDate: true;
            templateId: true;
            plan: { select: { name: true; billingType: true } };
          };
        };
        lineItems: true;
      };
    };
  };
}>;

export type EnrolContext = {
  templateId: string;
  startDate?: string;
};

type FamilyFormProps = {
  family: FamilyWithStudentsAndInvoices | null;
  enrolContext?: EnrolContext | null;
  levels: Level[];
  unpaidSummary: UnpaidFamiliesSummary;
  billing: Awaited<ReturnType<typeof getFamilyBillingData>>;
  billingPosition: FamilyBillingPosition;
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: Awaited<ReturnType<typeof getClassTemplates>>;
  openingState: Awaited<ReturnType<typeof getAccountOpeningState>>;
};

export default function FamilyForm({
  family,
  enrolContext,
  levels,
  billing,
  billingPosition,
  enrolmentPlans,
  classTemplates,
  openingState,
}: FamilyFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("overview");
  const [visitedTabs, setVisitedTabs] = React.useState<Set<string>>(new Set(["overview"]));
  const [familySheetOpen, setFamilySheetOpen] = React.useState(false);
  const [studentSheetOpen, setStudentSheetOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);

  if (!family) return null;

  const lastPayment = billing.payments?.[0] ?? null;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setVisitedTabs((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  };

  const handleAddStudent = () => {
    setEditingStudent(null);
    setStudentSheetOpen(true);
  };

  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentSheetOpen(true);
  };

  const handleSaveStudent = async (payload: ClientStudent & { familyId: string; id?: string }) => {
    try {
      if (payload.id) {
        await updateStudent({ ...payload, id: payload.id });
      } else {
        await createStudent(payload);
      }
      router.refresh();
      setStudentSheetOpen(false);
      setEditingStudent(null);
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false };
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FamilyHeaderSummary
        familyName={family.name}
        contact={{
          name: family.primaryContactName,
          phone: family.primaryPhone,
          email: family.primaryEmail,
        }}
        lastPayment={lastPayment ? { amountCents: lastPayment.amountCents, paidAt: lastPayment.paidAt } : null}
        actions={
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              onClick={() => {
                handleTabChange("billing");
                setPaymentSheetOpen(true);
              }}
            >
              Record payment
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                handleTabChange("students");
                handleAddStudent();
              }}
            >
              Add student
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                handleTabChange("overview");
                setFamilySheetOpen(true);
              }}
            >
              Edit family
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto space-y-4">
          <FamilyTabs
            activeTab={activeTab}
            visitedTabs={visitedTabs}
            onTabChange={handleTabChange}
            family={family}
            billing={billing}
            billingPosition={billingPosition}
            enrolContext={enrolContext}
            levels={levels}
            onAddStudent={handleAddStudent}
            onEditStudent={handleEditStudent}
            paymentSheetOpen={paymentSheetOpen}
            onPaymentSheetChange={setPaymentSheetOpen}
            enrolmentPlans={enrolmentPlans}
            classTemplates={classTemplates}
            openingState={openingState}
          />
        </div>
      </div>

      <FamilyActionSheet open={familySheetOpen} onOpenChange={setFamilySheetOpen}>
        <FamilyDetails family={family} layout="plain" onSaved={() => setFamilySheetOpen(false)} />
      </FamilyActionSheet>

      <StudentModal
        open={studentSheetOpen}
        onOpenChange={(next) => {
          setStudentSheetOpen(next);
          if (!next) setEditingStudent(null);
        }}
        familyId={family.id}
        student={editingStudent}
        onSave={async (payload) => handleSaveStudent(payload)}
        levels={levels}
      />
    </div>
  );
}

type FamilyTabsProps = {
  activeTab: string;
  visitedTabs: Set<string>;
  onTabChange: (value: string) => void;
  family: FamilyWithStudentsAndInvoices;
  billing: Awaited<ReturnType<typeof getFamilyBillingData>>;
  billingPosition: FamilyBillingPosition;
  enrolContext?: EnrolContext | null;
  levels: Level[];
  onAddStudent: () => void;
  onEditStudent: (student: Student) => void;
  paymentSheetOpen: boolean;
  onPaymentSheetChange: (open: boolean) => void;
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: Awaited<ReturnType<typeof getClassTemplates>>;
  openingState: Awaited<ReturnType<typeof getAccountOpeningState>>;
};

function FamilyTabs({
  activeTab,
  visitedTabs,
  onTabChange,
  family,
  billing,
  billingPosition,
  enrolContext,
  levels,
  onAddStudent,
  onEditStudent,
  paymentSheetOpen,
  onPaymentSheetChange,
  enrolmentPlans,
  classTemplates,
  openingState,
}: FamilyTabsProps) {
  return (
    <Card className="border-none shadow-none">
      <CardHeader className="space-y-3 p-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-2">
          <Badge variant="secondary">{family.students.length} students</Badge>
        </div>

        <Tabs value={activeTab} onValueChange={onTabChange} className="px-2">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="transition">Transition</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4">
            <OverviewTab family={family} billingPosition={billingPosition} billing={billing} />
          </TabsContent>

          {visitedTabs.has("billing") ? (
            <TabsContent value="billing" className="pt-4 max-w-none ">
              <BillingTab
                family={family}
                billing={billing}
                billingPosition={billingPosition}
                paymentSheetOpen={paymentSheetOpen}
                onPaymentSheetChange={onPaymentSheetChange}
              />
            </TabsContent>
          ) : null}

          {visitedTabs.has("students") ? (
            <TabsContent value="students" className="pt-4">
              <StudentsTab
                family={family}
                enrolContext={enrolContext}
                levels={levels}
                onAddStudent={onAddStudent}
                onEditStudent={onEditStudent}
                enrolmentPlans={enrolmentPlans}
              />
            </TabsContent>
          ) : null}

          {visitedTabs.has("transition") ? (
            <TabsContent value="transition" className="pt-4">
              <FamilyTransitionWizard
                family={family}
                enrolmentPlans={enrolmentPlans}
                classTemplates={classTemplates}
                levels={levels}
                openingState={openingState}
              />
            </TabsContent>
          ) : null}

          {visitedTabs.has("history") ? (
            <TabsContent value="history" className="pt-4">
              <HistoryTab billing={billing} />
            </TabsContent>
          ) : null}
        </Tabs>
      </CardHeader>
    </Card>
  );
}

function OverviewTab({
  family,
  billingPosition,
}: {
  family: FamilyWithStudentsAndInvoices;
  billingPosition: FamilyBillingPosition;
  billing: Awaited<ReturnType<typeof getFamilyBillingData>>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
        <div className="text-sm text-muted-foreground">Billing actions</div>
        <CatchUpPaymentDialog familyId={family.id} familyName={family.name} />
      </div>
      <FamilyBillingPositionCard billing={billingPosition} />

      <Card className="border-l-0 border-r-0 border-b-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ContactRow label="Primary contact" value={family.primaryContactName ?? "—"} />
          <ContactRow label="Primary phone" value={family.primaryPhone ?? "—"} />
          <ContactRow label="Primary email" value={family.primaryEmail ?? "—"} className="sm:col-span-2" />
        </CardContent>
      </Card>
    </div>
  );
}

function BillingTab({
  family,
  billing,
  billingPosition,
  paymentSheetOpen,
  onPaymentSheetChange,
}: {
  family: FamilyWithStudentsAndInvoices;
  billing: Awaited<ReturnType<typeof getFamilyBillingData>>;
  billingPosition: FamilyBillingPosition;
  paymentSheetOpen: boolean;
  onPaymentSheetChange: (open: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <FamilyInvoices
        family={family}
        billing={billing}
        billingPosition={billingPosition}
        paymentSheetOpen={paymentSheetOpen}
        onPaymentSheetChange={onPaymentSheetChange}
      />
    </div>
  );
}

function StudentsTab({
  family,
  enrolContext,
  levels,
  onAddStudent,
  onEditStudent,
  enrolmentPlans,
}: {
  family: FamilyWithStudentsAndInvoices;
  enrolContext?: EnrolContext | null;
  levels: Level[];
  onAddStudent: () => void;
  onEditStudent: (student: Student) => void;
  enrolmentPlans: EnrolmentPlan[];
}) {
  return (
    <div className="space-y-3">
      <StudentDetails
        students={family.students}
        familyId={family.id}
        enrolContext={enrolContext ?? null}
        levels={levels}
        layout="plain"
        onAddStudent={onAddStudent}
        onEditStudent={onEditStudent}
        renderModal={false}
        enrolmentPlans={enrolmentPlans}
      />
    </div>
  );
}

function HistoryTab({ billing }: { billing: Awaited<ReturnType<typeof getFamilyBillingData>> }) {
  const auditsByStudent = React.useMemo(() => {
    const map = new Map<string, { studentId: string; studentName: string; items: typeof billing.coverageAudits }>();
    billing.coverageAudits.forEach((audit) => {
      const student = audit.enrolment.student;
      if (!map.has(student.id)) {
        map.set(student.id, { studentId: student.id, studentName: student.name, items: [] });
      }
      map.get(student.id)?.items.push(audit);
    });
    return Array.from(map.values());
  }, [billing.coverageAudits]);

  const reasonMeta: Record<string, { label: string; source: string }> = {
    PAIDTHROUGH_MANUAL_EDIT: { label: "Paid-through updated", source: "Manual edit" },
    INVOICE_APPLIED: { label: "Payment applied", source: "Payment" },
    HOLIDAY_ADDED: { label: "Holiday updated", source: "Recalculation" },
    HOLIDAY_REMOVED: { label: "Holiday updated", source: "Recalculation" },
    HOLIDAY_UPDATED: { label: "Holiday updated", source: "Recalculation" },
    CLASS_CHANGED: { label: "Schedule updated", source: "Recalculation" },
    PLAN_CHANGED: { label: "Plan updated", source: "Recalculation" },
    CANCELLATION_CREATED: { label: "Cancellation recorded", source: "Cancellation" },
    CANCELLATION_REVERSED: { label: "Cancellation reversed", source: "Cancellation" },
  };

  return (
    <Card className="border-l-0 border-r-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Enrolment audit log</CardTitle>
        <Badge variant="outline">{billing.coverageAudits.length} items</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {billing.coverageAudits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrolment changes yet.</p>
        ) : (
          auditsByStudent.map((group) => (
            <div key={group.studentId} className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{group.studentName}</div>
                <Badge variant="outline" className="text-[11px] font-normal">
                  {group.items.length} change{group.items.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="space-y-2">
                {group.items.map((audit) => {
                  const meta = reasonMeta[audit.reason] ?? {
                    label: "Coverage recalculated",
                    source: "System",
                  };
                  const previous = formatBrisbaneDate(audit.previousPaidThroughDate ?? null);
                  const next = formatBrisbaneDate(audit.nextPaidThroughDate ?? null);
                  return (
                    <div key={audit.id} className="rounded-lg border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">
                            {audit.enrolment.plan?.name ?? "Enrolment"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {meta.source} · {format(new Date(audit.createdAt), "d MMM yyyy · h:mm a")}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[11px]">
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Paid-through changed from {previous} to {next}.
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FamilyActionSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-xl sm:px-8">
        <SheetHeader>
          <SheetTitle>Edit family</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <Separator />
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContactRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
