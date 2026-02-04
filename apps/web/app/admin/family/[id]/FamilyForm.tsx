"use client";

import * as React from "react";
import type { Prisma, Student } from "@prisma/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Loader2, Mail, MoreVertical, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { cn } from "@/lib/utils";

import FamilyDetails from "./FamilyDetails";
import FamilyInvoices from "./FamilyInvoices";
import { StudentModal } from "./StudentModal";
import { FamilyTransitionWizard } from "./FamilyTransitionWizard";

import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { FamilyHeaderSummary } from "@/components/admin/FamilyHeaderSummary";

import type { EnrolmentPlan, Level } from "@prisma/client";
import type { UnpaidFamiliesSummary } from "@/server/invoicing";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import type getClassTemplates from "@/server/classTemplate/getClassTemplates";
import type { getAccountOpeningState } from "@/server/family/getAccountOpeningState";
import { createStudent } from "@/server/student/createStudent";
import { deleteStudent } from "@/server/student/deleteStudent";
import { getStudent } from "@/server/student/getStudent";
import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudent } from "@/server/student/types";
import type { ClientStudentWithRelations } from "@/app/admin/student/[id]/types";
import { StudentEnrolmentsSection } from "@/app/admin/student/[id]/StudentEnrolmentsSection";
import { useSyncedQueryState } from "@/hooks/useSyncedQueryState";
import { buildReturnUrl, parseReturnContext } from "@/lib/returnContext";
import { ChangeStudentLevelDialog } from "./ChangeStudentLevelDialog";
import { CatchUpPaymentDialog } from "./CatchUpPaymentDialog";
import { FamilyBillingPositionCard } from "./FamilyBillingPositionCard";

export type FamilyWithStudentsAndInvoices = Prisma.FamilyGetPayload<{
  include: {
    students: {
      include: {
        level: true;
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
  const searchParams = useSearchParams();
  const returnTo = parseReturnContext(searchParams);
  const [activeTab, setActiveTab] = useSyncedQueryState<string>("tab", {
    defaultValue: "overview",
    parse: (value) =>
      value === "billing" || value === "students" || value === "transition" || value === "history"
        ? value
        : "overview",
    serialize: (value) => (value === "overview" ? null : value),
  });
  const [visitedTabs, setVisitedTabs] = React.useState<Set<string>>(() => new Set([activeTab]));
  const [familySheetOpen, setFamilySheetOpen] = React.useState(false);
  const [studentSheetOpen, setStudentSheetOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);

  if (!family) return null;

  const lastPayment = billing.payments?.[0] ?? null;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  React.useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

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
            <Button size="sm" variant="ghost" asChild>
              <Link href={returnTo ?? "/admin/family"}>Back to Families</Link>
            </Button>
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
              <HistoryTab billing={billing} family={family} />
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

type AuditCategory = "ALL" | "PAIDTHROUGH" | "CLASS_CHANGE" | "LEVEL_CHANGE" | "COVERAGE";

type AuditEntry = {
  id: string;
  studentId: string;
  studentName: string;
  createdAt: Date;
  category: AuditCategory;
  title: string;
  subtitle: string;
  details?: string;
};

function HistoryTab({
  billing,
  family,
}: {
  billing: Awaited<ReturnType<typeof getFamilyBillingData>>;
  family: FamilyWithStudentsAndInvoices;
}) {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = React.useState<AuditCategory>("ALL");

  const students = React.useMemo(
    () => family.students.map((student) => ({ id: student.id, name: student.name })),
    [family.students]
  );

  const auditEntries = React.useMemo(() => {
    const entries: AuditEntry[] = [];

    const reasonMeta: Record<
      string,
      { label: string; source: string; category: AuditCategory }
    > = {
      PAIDTHROUGH_MANUAL_EDIT: { label: "Paid-through updated", source: "Manual edit", category: "PAIDTHROUGH" },
      INVOICE_APPLIED: { label: "Payment applied", source: "Payment", category: "PAIDTHROUGH" },
      HOLIDAY_ADDED: { label: "Holiday updated", source: "Recalculation", category: "COVERAGE" },
      HOLIDAY_REMOVED: { label: "Holiday updated", source: "Recalculation", category: "COVERAGE" },
      HOLIDAY_UPDATED: { label: "Holiday updated", source: "Recalculation", category: "COVERAGE" },
      CLASS_CHANGED: { label: "Schedule updated", source: "Recalculation", category: "CLASS_CHANGE" },
      PLAN_CHANGED: { label: "Plan updated", source: "Recalculation", category: "CLASS_CHANGE" },
      CANCELLATION_CREATED: { label: "Cancellation recorded", source: "Cancellation", category: "COVERAGE" },
      CANCELLATION_REVERSED: { label: "Cancellation reversed", source: "Cancellation", category: "COVERAGE" },
    };

    billing.coverageAudits.forEach((audit) => {
      const student = audit.enrolment.student;
      const meta = reasonMeta[audit.reason] ?? {
        label: "Coverage recalculated",
        source: "System",
        category: "COVERAGE" as AuditCategory,
      };
      const previous = formatBrisbaneDate(audit.previousPaidThroughDate ?? null);
      const next = formatBrisbaneDate(audit.nextPaidThroughDate ?? null);

      entries.push({
        id: audit.id,
        studentId: student.id,
        studentName: student.name,
        createdAt: new Date(audit.createdAt),
        category: meta.category,
        title: meta.label,
        subtitle: `${meta.source} · ${format(new Date(audit.createdAt), "d MMM yyyy · h:mm a")}`,
        details: `Paid-through changed from ${previous} to ${next}.`,
      });
    });

    family.students.forEach((student) => {
      student.levelChanges.forEach((change) => {
        entries.push({
          id: `level-${change.id}`,
          studentId: student.id,
          studentName: student.name,
          createdAt: new Date(change.createdAt),
          category: "LEVEL_CHANGE",
          title: "Level updated",
          subtitle: `Admin · ${format(new Date(change.createdAt), "d MMM yyyy · h:mm a")}`,
          details: `Level changed from ${change.fromLevel?.name ?? "—"} to ${
            change.toLevel?.name ?? "—"
          } (effective ${formatBrisbaneDate(change.effectiveDate)}).`,
        });
      });
    });

    return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [billing.coverageAudits, family.students]);

  const filteredEntries = React.useMemo(() => {
    return auditEntries.filter((entry) => {
      if (selectedStudentId !== "ALL" && entry.studentId !== selectedStudentId) return false;
      if (selectedCategory !== "ALL" && entry.category !== selectedCategory) return false;
      return true;
    });
  }, [auditEntries, selectedCategory, selectedStudentId]);

  return (
    <Card className="border-l-0 border-r-0 shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Enrolment audit log</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{filteredEntries.length} items</Badge>
          <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as AuditCategory)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="PAIDTHROUGH">Paid-through</SelectItem>
              <SelectItem value="CLASS_CHANGE">Class/plan changes</SelectItem>
              <SelectItem value="LEVEL_CHANGE">Level changes</SelectItem>
              <SelectItem value="COVERAGE">Coverage changes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selectedStudentId === "ALL" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelectedStudentId("ALL")}
          >
            All students
          </Button>
          {students.map((student) => (
            <Button
              key={student.id}
              type="button"
              variant={selectedStudentId === student.id ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSelectedStudentId(student.id)}
            >
              {student.name}
            </Button>
          ))}
        </div>

        {filteredEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrolment changes yet.</p>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{entry.title}</div>
                    <div className="text-xs text-muted-foreground">{entry.subtitle}</div>
                  </div>
                  <Badge variant="secondary" className="text-[11px]">
                    {entry.studentName}
                  </Badge>
                </div>
                {entry.details ? (
                  <div className="mt-2 text-xs text-muted-foreground">{entry.details}</div>
                ) : null}
              </div>
            ))}
          </div>
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
