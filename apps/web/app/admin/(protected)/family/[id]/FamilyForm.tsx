"use client";

import * as React from "react";
import type { Prisma, Student } from "@prisma/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Info,
  Loader2,
  MoreVertical,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { cn } from "@/lib/utils";

import FamilyDetails from "./FamilyDetails";
import FamilyInvoices from "./FamilyInvoices";
import { StudentModal } from "./StudentModal";
import { FamilyTransitionWizard } from "./FamilyTransitionWizard";

import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";

import type { EnrolmentPlan, Level } from "@prisma/client";
import type { UnpaidFamiliesSummary } from "@/server/invoicing";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import type getClassTemplates from "@/server/classTemplate/getClassTemplates";
import type { getAccountOpeningState } from "@/server/family/getAccountOpeningState";
import type { getFamilyAwayPeriods } from "@/server/away/getFamilyAwayPeriods";
import { createStudent } from "@/server/student/createStudent";
import { deleteStudent } from "@/server/student/deleteStudent";
import { getStudent } from "@/server/student/getStudent";
import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudent } from "@/server/student/types";
import type { ClientStudentWithRelations } from "@/app/admin/(protected)/student/[id]/types";
import { StudentEnrolmentsSection } from "@/app/admin/(protected)/student/[id]/StudentEnrolmentsSection";
import { AddEnrolmentDialog } from "@/app/admin/(protected)/student/[id]/AddEnrolmentDialog";
import { ChangeEnrolmentDialog } from "@/app/admin/(protected)/student/[id]/ChangeEnrolmentDialog";
import { buildReturnUrl } from "@/lib/returnContext";
import { ChangeStudentLevelDialog } from "./ChangeStudentLevelDialog";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { AwaySection } from "./AwaySection";
import { MakeupsSection } from "./MakeupsSection";
import type { FamilyMakeupSummary } from "@/server/makeup/getFamilyMakeups";

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
  awayPeriods: Awaited<ReturnType<typeof getFamilyAwayPeriods>>;
  makeups: FamilyMakeupSummary;
};

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
  }>
) {
  if (!enrolments.length) return "Not enrolled";
  const dates = enrolments
    .map((enrolment) => enrolment.projectedCoverageEnd ?? enrolment.paidThroughDate ?? enrolment.latestCoverageEnd)
    .filter(Boolean) as Date[];
  const latest = dates.length
    ? dates.reduce((acc, curr) => (acc && acc > curr ? acc : curr))
    : null;
  return `Paid through ${formatBrisbaneDate(latest ?? null)}`;
}

export default function FamilyForm({
  family,
  enrolContext,
  levels,
  billing,
  billingPosition,
  enrolmentPlans,
  classTemplates,
  openingState,
  awayPeriods,
  makeups,
}: FamilyFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parseTabParam = React.useCallback((value: string | null) => {
    if (value === "billing") return "billing";
    if (value === "contacts") return "contacts";
    if (value === "history") return "history";
    if (value === "enrolments") return "overview";
    if (value === "students") return "overview";
    if (value === "transition") return "history";
    return "overview";
  }, []);
  const [activeTab, setActiveTab] = React.useState<string>(() => parseTabParam(searchParams.get("tab")));
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(() => searchParams.get("student") ?? "");
  const [visitedTabs, setVisitedTabs] = React.useState<Set<string>>(() => new Set([activeTab]));
  const [familySheetOpen, setFamilySheetOpen] = React.useState(false);
  const [studentSheetOpen, setStudentSheetOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [pendingStudentAction, setPendingStudentAction] = React.useState<{
    type: "add-enrolment" | "change-enrolment" | "edit-paid-through";
    studentId: string;
  } | null>(null);
  const [enrolmentDialog, setEnrolmentDialog] = React.useState<{
    mode: "add" | "change";
    studentId: string;
    enrolment: ClientStudentWithRelations["enrolments"][number] | null;
  } | null>(null);
  const [paidThroughTarget, setPaidThroughTarget] = React.useState<{
    enrolmentId: string;
    currentPaidThrough: Date | null;
  } | null>(null);
  const [changingStudent, setChangingStudent] = React.useState<
    FamilyWithStudentsAndInvoices["students"][number] | null
  >(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);
  const [payAheadOpen, setPayAheadOpen] = React.useState(false);

  const [studentDetails, setStudentDetails] = React.useState<ClientStudentWithRelations | null>(null);
  const [isLoadingStudent, setIsLoadingStudent] = React.useState(false);
  const studentCache = React.useRef(new Map<string, ClientStudentWithRelations>());
  const studentRequestToken = React.useRef(0);

  React.useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const syncQueryParam = React.useCallback((key: string, value: string | null) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, []);

  const loadStudentDetails = React.useCallback(
    async (studentId: string, options?: { silent?: boolean }) => {
      const token = ++studentRequestToken.current;
      if (!options?.silent) {
        setIsLoadingStudent(true);
      }

      try {
        const student = await getStudent(studentId);
        if (studentRequestToken.current !== token) return;
        if (!student) throw new Error("Student not found.");
        const typed = student as ClientStudentWithRelations;
        studentCache.current.set(studentId, typed);
        setStudentDetails(typed);
      } catch (error) {
        if (studentRequestToken.current !== token) return;
        const message = error instanceof Error ? error.message : "Unable to load student.";
        console.error(error);
        toast.error(message);
        setStudentDetails(null);
      } finally {
        if (studentRequestToken.current === token && !options?.silent) {
          setIsLoadingStudent(false);
        }
      }
    },
    []
  );

  React.useEffect(() => {
    syncQueryParam("student", selectedStudentId || null);
  }, [selectedStudentId, syncQueryParam]);

  React.useEffect(() => {
    syncQueryParam("tab", activeTab === "overview" ? null : activeTab);
  }, [activeTab, syncQueryParam]);

  React.useEffect(() => {
    if (!selectedStudentId) return;
    const exists = family?.students.some((student) => student.id === selectedStudentId) ?? false;
    if (!exists) setSelectedStudentId("");
  }, [family, selectedStudentId, setSelectedStudentId]);

  const refreshStudentDetails = React.useCallback(
    (id?: string | null) => {
      const studentId = id ?? selectedStudentId;
      if (!studentId) return;
      void loadStudentDetails(studentId);
    },
    [loadStudentDetails, selectedStudentId]
  );

  React.useEffect(() => {
    if (!selectedStudentId) {
      studentRequestToken.current += 1;
      setIsLoadingStudent(false);
      setStudentDetails(null);
      return;
    }

    const cached = studentCache.current.get(selectedStudentId);
    if (cached) {
      setStudentDetails(cached);
      setIsLoadingStudent(false);
      return;
    }

    void loadStudentDetails(selectedStudentId);
  }, [loadStudentDetails, selectedStudentId]);

  const studentRows = React.useMemo(() => {
    const billingByStudentId = new Map(billingPosition.students.map((student) => [student.id, student]));
    return (family?.students ?? []).map((student) => {
      const billingStudent = billingByStudentId.get(student.id);
      const enrolments = billingStudent?.enrolments ?? [];
      return {
        id: student.id,
        name: student.name,
        levelName: student.level?.name ?? null,
        status: resolveStudentStatus(enrolments),
        paidThroughLabel: resolveStudentPaidThrough(enrolments),
        enrolments,
        student,
      };
    });
  }, [billingPosition.students, family?.students]);

  const selectedStudentRow = studentRows.find((row) => row.id === selectedStudentId) ?? null;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  const handleAddStudent = () => {
    setEditingStudent(null);
    setStudentSheetOpen(true);
  };

  const handleEditStudent = (student: Student) => {
    setSelectedStudentId(student.id);
    setEditingStudent(student);
    setStudentSheetOpen(true);
  };

  const handleSaveStudent = async (payload: ClientStudent & { familyId: string; id?: string }) => {
    try {
      if (payload.id) {
        await updateStudent({ ...payload, id: payload.id });
        toast.success("Student updated.");
      } else {
        await createStudent(payload);
        toast.success("Student added.");
      }
      router.refresh();
      setStudentSheetOpen(false);
      setEditingStudent(null);
      return { success: true };
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to save student.");
      return { success: false };
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    setSelectedStudentId(studentId);
    const ok = window.confirm("Delete this student? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteStudent(studentId);
      toast.success("Student removed.");
      router.refresh();
      if (selectedStudentId === studentId) {
        setSelectedStudentId("");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete student.";
      console.error(error);
      toast.error(message);
    }
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
  };

  const handleManageEnrolments = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab("overview");
    const row = studentRows.find((student) => student.id === studentId);
    const hasEnrolments = (row?.enrolments?.length ?? 0) > 0;
    setPendingStudentAction({
      type: hasEnrolments ? "change-enrolment" : "add-enrolment",
      studentId,
    });
    refreshStudentDetails(studentId);
  };

  const handleEditPaidThrough = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab("overview");
    setPendingStudentAction({ type: "edit-paid-through", studentId });
    refreshStudentDetails(studentId);
  };

  const handleOpenStudent = (studentId: string) => {
    if (!family) return;
    setSelectedStudentId(studentId);
    const returnUrl = `/admin/family/${family.id}?tab=overview&student=${studentId}`;
    router.push(buildReturnUrl(`/admin/student/${studentId}`, returnUrl));
  };

  const handleEnrolInClass = (studentId: string) => {
    setSelectedStudentId(studentId);
    if (!enrolContext?.templateId) return;
    const qs = new URLSearchParams();
    qs.set("studentId", studentId);
    qs.set("templateId", enrolContext.templateId);
    if (enrolContext.startDate) qs.set("startDate", enrolContext.startDate);
    router.push(`/admin/enrolments/new?${qs.toString()}`);
  };

  const handleBillingUpdated = React.useCallback(() => {
    if (selectedStudentId) refreshStudentDetails(selectedStudentId);
  }, [refreshStudentDetails, selectedStudentId]);

  React.useEffect(() => {
    if (!pendingStudentAction) return;
    if (!studentDetails || studentDetails.id !== pendingStudentAction.studentId) return;

    const enrolments = studentDetails.enrolments ?? [];
    const primaryEnrolment =
      enrolments.find((enrolment) => !enrolment.endDate && enrolment.plan) ??
      enrolments.find((enrolment) => enrolment.plan) ??
      enrolments.find((enrolment) => !enrolment.endDate) ??
      enrolments[0] ??
      null;

    if (pendingStudentAction.type === "add-enrolment") {
      setEnrolmentDialog({ mode: "add", studentId: studentDetails.id, enrolment: null });
      setPendingStudentAction(null);
      return;
    }

    if (pendingStudentAction.type === "change-enrolment") {
      if (!primaryEnrolment) {
        setEnrolmentDialog({ mode: "add", studentId: studentDetails.id, enrolment: null });
        setPendingStudentAction(null);
        return;
      }
      if (!primaryEnrolment.plan) {
        toast.error("Enrolment plan missing; add a plan before changing classes.");
        setPendingStudentAction(null);
        return;
      }
      setEnrolmentDialog({ mode: "change", studentId: studentDetails.id, enrolment: primaryEnrolment });
      setPendingStudentAction(null);
      return;
    }

    if (pendingStudentAction.type === "edit-paid-through") {
      if (!primaryEnrolment) {
        toast.error("No enrolment yet. Add an enrolment first.");
        setPendingStudentAction(null);
        return;
      }
      setPaidThroughTarget({
        enrolmentId: primaryEnrolment.id,
        currentPaidThrough: primaryEnrolment.paidThroughDate ?? null,
      });
      setPendingStudentAction(null);
    }
  }, [pendingStudentAction, studentDetails]);

  React.useEffect(() => {
    if (!pendingStudentAction) return;
    if (isLoadingStudent) return;
    if (!studentDetails && selectedStudentId === pendingStudentAction.studentId) {
      toast.error("Unable to load student details.");
      setPendingStudentAction(null);
    }
  }, [isLoadingStudent, pendingStudentAction, selectedStudentId, studentDetails]);

  if (!family) return null;

  const balanceBreakdown = billingPosition.balanceBreakdown;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="border-b border-gray-200 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <Link href="/admin/family" className="hover:text-gray-900">
                    Families
                  </Link>
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  <span className="font-medium text-gray-900">{family.name}</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{family.name}</h1>
                <p className="text-sm text-gray-600">
                  {family.students.length} student{family.students.length === 1 ? "" : "s"} enrolled in this family
                  account.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setPaymentSheetOpen(true)}>
                  Record payment
                </Button>
                <Button size="sm" variant="outline" onClick={handleAddStudent}>
                  Add student
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPayAheadOpen(true)}>
                  Pay ahead
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFamilySheetOpen(true)}>
                  Edit family
                </Button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span>Balance</span>
                {balanceBreakdown ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 transition hover:text-gray-900"
                        aria-label="View balance breakdown"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72">
                      <div className="text-xs font-semibold text-foreground">Balance breakdown</div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between gap-4">
                          <span>Invoice outstanding</span>
                          <span className="font-medium text-foreground">
                            {formatCurrencyFromCents(balanceBreakdown.invoiceOutstandingCents)}
                          </span>
                        </div>
                        {balanceBreakdown.overdueOwingCents > 0 ? (
                          <div className="flex items-center justify-between gap-4">
                            <span>Overdue (uninvoiced)</span>
                            <span className="font-medium text-foreground">
                              {formatCurrencyFromCents(balanceBreakdown.overdueOwingCents)}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-4">
                          <span>Unallocated credit</span>
                          <span className="font-medium text-foreground">
                            {balanceBreakdown.unallocatedCreditCents > 0
                              ? `-${formatCurrencyFromCents(balanceBreakdown.unallocatedCreditCents)}`
                              : formatCurrencyFromCents(0)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-4 border-t pt-2 text-foreground">
                          <span className="font-semibold">Net balance</span>
                          <span className="font-semibold">
                            {formatCurrencyFromCents(balanceBreakdown.netOwingCents)}
                          </span>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <div
                className={cn(
                  "mt-2 text-2xl font-semibold",
                  billingPosition.outstandingCents > 0 ? "text-red-700" : "text-emerald-700"
                )}
              >
                {formatCurrencyFromCents(billingPosition.outstandingCents)}
              </div>
              {billingPosition.unallocatedCents > 0 ? (
                <div className="mt-1 text-xs text-gray-500">
                  {formatCurrencyFromCents(billingPosition.unallocatedCents)} unallocated
                </div>
              ) : (
                <div className="mt-1 text-xs text-gray-500">No unallocated credit</div>
              )}
            </div>

            <SummaryCard
              label="Paid through"
              value={formatBrisbaneDate(billingPosition.paidThroughLatest)}
              detail="Latest entitlement across active enrolments"
            />
            <SummaryCard
              label="Next payment due"
              value={billingPosition.nextDueInvoice?.dueAt ? formatBrisbaneDate(billingPosition.nextDueInvoice.dueAt) : "—"}
              detail={
                billingPosition.nextDueInvoice
                  ? `${formatCurrencyFromCents(billingPosition.nextDueInvoice.balanceCents)} outstanding`
                  : "No open invoices"
              }
            />
            <SummaryCard
              label="Opening balance"
              value={openingState ? "Recorded" : "Not recorded"}
              detail={
                openingState
                  ? `Captured ${formatBrisbaneDate(openingState.createdAt)}`
                  : "Record when migrating historical balances"
              }
            />
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <div className="border-b border-gray-200">
              <TabsList className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  className="h-11 flex-none rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="h-11 flex-none rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  Billing activity
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="h-11 flex-none rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  History
                </TabsTrigger>
                <TabsTrigger
                  value="contacts"
                  className="h-11 flex-none rounded-none border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
                >
                  Contacts
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="m-0 space-y-4">
              <div className="space-y-2 md:hidden">
                <label className="text-sm font-medium">Student</label>
                <Select
                  value={selectedStudentId || "__none"}
                  onValueChange={(value) => handleSelectStudent(value === "__none" ? "" : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No student selected</SelectItem>
                    {studentRows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                <Card className="hidden lg:block">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Students</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {studentRows.length} student{studentRows.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge variant="secondary">{studentRows.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {studentRows.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No students yet.
                      </div>
                    ) : (
                      studentRows.map((row) => (
                        <div
                          key={row.id}
                          onClick={() => handleSelectStudent(row.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition",
                            selectedStudentId === row.id ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
                          )}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectStudent(row.id);
                            }
                          }}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="truncate text-sm font-semibold">{row.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.levelName ?? "No level"} · {row.paidThroughLabel}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={row.status.variant} className="text-[11px]">
                              {row.status.label}
                            </Badge>
                            <DropdownMenu
                              modal={false}
                              onOpenChange={(open) => {
                                if (open) setSelectedStudentId(row.id);
                              }}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label="Student actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {enrolContext ? (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={(event) => {
                                        event.stopPropagation();
                                        handleEnrolInClass(row.id);
                                      }}
                                    >
                                      Enrol in class
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                ) : null}
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation();
                                    handleEditStudent(row.student);
                                  }}
                                >
                                  Edit student
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation();
                                    handleManageEnrolments(row.id);
                                  }}
                                >
                                  Enrol / change class
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation();
                                    handleEditPaidThrough(row.id);
                                  }}
                                >
                                  Edit paid-through
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation();
                                    setChangingStudent(row.student);
                                  }}
                                >
                                  Change level
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation();
                                    handleOpenStudent(row.id);
                                  }}
                                >
                                  Open student
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(event) => {
                                    event.stopPropagation();
                                    handleDeleteStudent(row.id);
                                  }}
                                >
                                  Remove student
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <section className="rounded-lg border border-gray-200 bg-white p-4">
                    {selectedStudentRow ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Selected student
                            </div>
                            <div className="text-lg font-semibold text-gray-900">{selectedStudentRow.name}</div>
                            <div className="text-xs text-gray-500">
                              {selectedStudentRow.levelName ?? "Level not set"}
                            </div>
                          </div>
                          <Badge variant={selectedStudentRow.status.variant} className="text-[11px]">
                            {selectedStudentRow.status.label}
                          </Badge>
                        </div>

                        {isLoadingStudent && !studentDetails ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading student details...
                          </div>
                        ) : studentDetails ? (
                          <StudentEnrolmentsSection
                            student={studentDetails}
                            levels={levels}
                            enrolmentPlans={enrolmentPlans}
                            onUpdated={() => {
                              refreshStudentDetails(selectedStudentId);
                              router.refresh();
                            }}
                            editContextSource="family"
                          />
                        ) : (
                          <div className="text-sm text-muted-foreground">Unable to load student details.</div>
                        )}
                      </div>
                    ) : (
                      <StudentSelectionEmptyState />
                    )}
                  </section>

                  <AwaySection
                    familyId={family.id}
                    students={family.students.map((student) => ({ id: student.id, name: student.name }))}
                    awayPeriods={awayPeriods}
                  />

                  <MakeupsSection familyId={family.id} students={family.students} summary={makeups} />
                </div>
              </div>
            </TabsContent>

            {visitedTabs.has("billing") ? (
              <TabsContent value="billing" className="m-0">
                <FamilyInvoices
                  family={family}
                  billing={billing}
                  billingPosition={billingPosition}
                  onOpenPayment={() => setPaymentSheetOpen(true)}
                  onOpenPayAhead={() => setPayAheadOpen(true)}
                  onUpdated={handleBillingUpdated}
                />
              </TabsContent>
            ) : null}

            {visitedTabs.has("history") ? (
              <TabsContent value="history" className="m-0 space-y-4">
                <HistoryTab billing={billing} family={family} />
                <FamilyTransitionWizard
                  family={family}
                  enrolmentPlans={enrolmentPlans}
                  classTemplates={classTemplates}
                  levels={levels}
                  openingState={openingState}
                />
              </TabsContent>
            ) : null}

            {visitedTabs.has("contacts") ? (
              <TabsContent value="contacts" className="m-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <CardTitle className="text-base">Family contacts</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setFamilySheetOpen(true)}>
                      Edit contacts
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <ContactRow label="Primary contact" value={family.primaryContactName ?? "—"} />
                    <ContactRow label="Primary phone" value={family.primaryPhone ?? "—"} />
                    <ContactRow label="Primary email" value={family.primaryEmail ?? "—"} className="sm:col-span-2" />
                    <ContactRow label="Secondary contact" value={family.secondaryContactName ?? "—"} />
                    <ContactRow label="Secondary phone" value={family.secondaryPhone ?? "—"} />
                    <ContactRow label="Secondary email" value={family.secondaryEmail ?? "—"} className="sm:col-span-2" />
                    <ContactRow label="Medical contact" value={family.medicalContactName ?? "—"} />
                    <ContactRow label="Medical phone" value={family.medicalContactPhone ?? "—"} />
                    <ContactRow label="Address" value={family.address ?? "—"} className="sm:col-span-2" />
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
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

      {changingStudent ? (
        <ChangeStudentLevelDialog
          open={Boolean(changingStudent)}
          onOpenChange={(next) => {
            if (!next) setChangingStudent(null);
          }}
          student={changingStudent}
          levels={levels}
          enrolmentPlans={enrolmentPlans}
          presentation="sheet"
        />
      ) : null}

      <RecordPaymentSheet
        familyId={family.id}
        enrolments={billingPosition.enrolments}
        openInvoices={billing.openInvoices ?? []}
        open={paymentSheetOpen}
        onOpenChange={setPaymentSheetOpen}
        trigger={null}
        onSuccess={handleBillingUpdated}
      />

      <PayAheadSheet
        familyId={family.id}
        open={payAheadOpen}
        onOpenChange={setPayAheadOpen}
        trigger={null}
        onUpdated={handleBillingUpdated}
      />

      {enrolmentDialog?.mode === "add" ? (
        <AddEnrolmentDialog
          open
          onOpenChange={(open) => {
            if (!open) setEnrolmentDialog(null);
          }}
          studentId={enrolmentDialog.studentId}
          levels={levels}
          enrolmentPlans={enrolmentPlans}
          studentLevelId={
            studentDetails?.id === enrolmentDialog.studentId
              ? studentDetails.levelId
              : family.students.find((student) => student.id === enrolmentDialog.studentId)?.levelId ?? null
          }
          onCreated={() => {
            setEnrolmentDialog(null);
            refreshStudentDetails(enrolmentDialog.studentId);
          }}
          presentation="sheet"
        />
      ) : null}

      {enrolmentDialog?.mode === "change" && enrolmentDialog.enrolment ? (
        <ChangeEnrolmentDialog
          open
          onOpenChange={(open) => {
            if (!open) setEnrolmentDialog(null);
          }}
          enrolment={enrolmentDialog.enrolment as ClientStudentWithRelations["enrolments"][number] & {
            plan: NonNullable<ClientStudentWithRelations["enrolments"][number]["plan"]>;
          }}
          enrolmentPlans={enrolmentPlans}
          levels={levels}
          studentLevelId={
            studentDetails?.id === enrolmentDialog.studentId
              ? studentDetails.levelId
              : family.students.find((student) => student.id === enrolmentDialog.studentId)?.levelId ?? null
          }
          initialTemplateIds={
            enrolmentDialog.enrolment.classAssignments?.length
              ? enrolmentDialog.enrolment.classAssignments.map((assignment) => assignment.templateId)
              : [enrolmentDialog.enrolment.templateId]
          }
          onChanged={() => {
            setEnrolmentDialog(null);
            refreshStudentDetails(enrolmentDialog.studentId);
          }}
          presentation="sheet"
        />
      ) : null}

      {paidThroughTarget ? (
        <EditPaidThroughDialog
          enrolmentId={paidThroughTarget.enrolmentId}
          currentPaidThrough={paidThroughTarget.currentPaidThrough}
          open
          onOpenChange={(open) => {
            if (!open) setPaidThroughTarget(null);
          }}
          onUpdated={() => {
            setPaidThroughTarget(null);
            refreshStudentDetails(selectedStudentId);
          }}
          presentation="sheet"
        />
      ) : null}
    </div>
  );
}

function StudentSelectionEmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-5">
      <h3 className="text-sm font-semibold">Select a student</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a student to manage enrolments, class changes, and paid-through updates.
      </p>
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

  const categoryMeta: Record<
    Exclude<AuditCategory, "ALL">,
    { icon: React.ComponentType<{ className?: string }>; color: string }
  > = {
    PAIDTHROUGH: { icon: CheckCircle2, color: "bg-emerald-500" },
    CLASS_CHANGE: { icon: ArrowRightLeft, color: "bg-sky-500" },
    LEVEL_CHANGE: { icon: GraduationCap, color: "bg-indigo-500" },
    COVERAGE: { icon: RefreshCcw, color: "bg-amber-500" },
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">History</h2>
            <p className="mt-1 text-sm text-gray-600">Admin and system events for enrolment and coverage updates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{filteredEntries.length} items</Badge>
            <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as AuditCategory)}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
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
        </div>
      </div>

      <div className="space-y-4 p-6">
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
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center">
            <p className="text-sm font-medium text-gray-900">No history yet</p>
            <p className="mt-1 text-sm text-gray-500">Events will appear here as admins update enrolments.</p>
          </div>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {filteredEntries.map((entry, index) => {
                const meta = categoryMeta[(entry.category === "ALL" ? "COVERAGE" : entry.category) as Exclude<AuditCategory, "ALL">];
                const Icon = meta.icon;
                return (
                  <li key={entry.id}>
                    <div className="relative pb-8">
                      {index !== filteredEntries.length - 1 ? (
                        <span aria-hidden="true" className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={cn(meta.color, "flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-white")}>
                            <Icon aria-hidden="true" className="h-4 w-4 text-white" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                              <Badge variant="outline" className="text-[11px]">
                                {entry.studentName}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">{entry.subtitle}</p>
                            {entry.details ? <p className="text-xs text-gray-600">{entry.details}</p> : null}
                          </div>
                          <div className="text-right text-xs whitespace-nowrap text-gray-500">
                            <time dateTime={entry.createdAt.toISOString()}>
                              {format(entry.createdAt, "d MMM yyyy")}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
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
