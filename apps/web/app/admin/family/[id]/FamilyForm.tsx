"use client";

import * as React from "react";
import type { Prisma, Student } from "@prisma/client";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FamilyHeaderSummary } from "@/components/admin/FamilyHeaderSummary";
import { formatCurrencyFromCents } from "@/lib/currency";

import FamilyDetails from "./FamilyDetails";
import StudentDetails from "./StudentDetails";
import FamilyInvoices from "./FamilyInvoices";
import { FamilyBillingPositionCard } from "./FamilyBillingPositionCard";
import { StudentModal } from "./StudentModal";

import type { Level } from "@prisma/client";
import type { UnpaidFamiliesSummary } from "@/server/invoicing";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
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
          };
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
};

export default function FamilyForm({
  family,
  enrolContext,
  levels,
  billing,
  billingPosition,
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
        await updateStudent(payload, payload.id);
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
        outstandingCents={billingPosition.outstandingCents}
        nextDue={billingPosition.nextDueInvoice}
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
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Owing" value={formatCurrencyFromCents(billingPosition.outstandingCents)} />
        <MiniStat label="Unallocated" value={formatCurrencyFromCents(billingPosition.unallocatedCents)} />
        <MiniStat
          label="Next due"
          value={billingPosition.nextDueInvoice?.dueAt ? billingPosition.nextDueInvoice.dueAt?.toDateString() ?? "—" : "—"}
          hint={
            billingPosition.nextDueInvoice?.balanceCents
              ? formatCurrencyFromCents(billingPosition.nextDueInvoice.balanceCents)
              : undefined
          }
        />
      </div>
      <FamilyInvoices
        family={family}
        billing={billing}
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
}: {
  family: FamilyWithStudentsAndInvoices;
  enrolContext?: EnrolContext | null;
  levels: Level[];
  onAddStudent: () => void;
  onEditStudent: (student: Student) => void;
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
      />
    </div>
  );
}

function HistoryTab({ billing }: { billing: Awaited<ReturnType<typeof getFamilyBillingData>> }) {
  return (
    <Card className="border-l-0 border-r-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent payments</CardTitle>
        <Badge variant="outline">{billing.payments.length} items</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {billing.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          billing.payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrencyFromCents(payment.amountCents)}</span>
                  <Badge variant="secondary">{payment.paidAt ? new Date(payment.paidAt).toDateString() : "—"}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">ID: {payment.id}</span>
              </div>
              {payment.note ? <p className="mt-1 text-xs text-muted-foreground">{payment.note}</p> : null}
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

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
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
