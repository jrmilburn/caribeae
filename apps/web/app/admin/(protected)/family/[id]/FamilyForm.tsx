"use client";

import * as React from "react";
import type { Prisma, Student } from "@prisma/client";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  RefreshCcw,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { buildReturnUrl } from "@/lib/returnContext";
import { cn } from "@/lib/utils";

import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { StudentEnrolmentsSection } from "@/app/admin/(protected)/student/[id]/StudentEnrolmentsSection";
import type { ClientStudentWithRelations } from "@/app/admin/(protected)/student/[id]/types";
import { deleteStudent } from "@/server/student/deleteStudent";
import { getStudent } from "@/server/student/getStudent";
import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudent } from "@/server/student/types";
import { createStudent } from "@/server/student/createStudent";
import type { EnrolmentPlan, Level } from "@prisma/client";
import type { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import type { getAccountOpeningState } from "@/server/family/getAccountOpeningState";
import type { getFamilyAwayPeriods } from "@/server/away/getFamilyAwayPeriods";
import type { FamilyMakeupSummary } from "@/server/makeup/getFamilyMakeups";

import { AwaySection } from "./AwaySection";
import { ChangeStudentLevelDialog } from "./ChangeStudentLevelDialog";
import { FamilyContactsPanel } from "./FamilyContactsPanel";
import FamilyDetails from "./FamilyDetails";
import { FamilyHeader } from "./FamilyHeader";
import FamilyInvoices from "./FamilyInvoices";
import { FamilyStudentList } from "./FamilyStudentList";
import { FamilySummaryRow } from "./FamilySummaryRow";
import { MakeupsSection } from "./MakeupsSection";
import { StudentModal } from "./StudentModal";

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
                template: {
                  select: { id: true; name: true; dayOfWeek: true; startTime: true; endTime: true };
                };
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
  billing: Awaited<ReturnType<typeof getFamilyBillingData>>;
  billingPosition: FamilyBillingPosition;
  enrolmentPlans: EnrolmentPlan[];
  openingState: Awaited<ReturnType<typeof getAccountOpeningState>>;
  awayPeriods: Awaited<ReturnType<typeof getFamilyAwayPeriods>>;
  makeups: FamilyMakeupSummary;
};

type FamilyTabKey = "overview" | "billing" | "history" | "contacts";

type StudentStatus = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

type StudentListRow = {
  id: string;
  name: string;
  levelName: string | null;
  status: StudentStatus;
  paidThroughLabel: string;
  enrolments: FamilyBillingPosition["students"][number]["enrolments"];
  student: FamilyWithStudentsAndInvoices["students"][number];
};

function resolveStudentStatus(
  enrolments: Array<{ entitlementStatus?: string }> | undefined
): StudentStatus {
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
  }>
) {
  if (!enrolments.length) return "No billing plan yet";
  const dates = enrolments
    .map((enrolment) => enrolment.projectedCoverageEnd ?? enrolment.paidThroughDate ?? enrolment.latestCoverageEnd)
    .filter(Boolean) as Date[];
  const latest = dates.length ? dates.reduce((acc, curr) => (acc && acc > curr ? acc : curr)) : null;
  return latest ? `Paid through ${formatBrisbaneDate(latest)}` : "Not prepaid";
}

function parseTabParam(value: string | null): FamilyTabKey {
  if (value === "billing") return "billing";
  if (value === "contacts") return "contacts";
  if (value === "history" || value === "transition") return "history";
  if (value === "enrolments" || value === "students") return "overview";
  return "overview";
}

export default function FamilyForm({
  family,
  enrolContext,
  levels,
  billing,
  billingPosition,
  enrolmentPlans,
  openingState,
  awayPeriods,
  makeups,
}: FamilyFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = React.useState<FamilyTabKey>(() => parseTabParam(searchParams.get("tab")));
  const [visitedTabs, setVisitedTabs] = React.useState<Set<FamilyTabKey>>(() => new Set([activeTab]));
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(() => searchParams.get("student") ?? "");
  const [familySheetOpen, setFamilySheetOpen] = React.useState(false);
  const [studentSheetOpen, setStudentSheetOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [changingStudent, setChangingStudent] = React.useState<FamilyWithStudentsAndInvoices["students"][number] | null>(
    null
  );
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);
  const [payAheadOpen, setPayAheadOpen] = React.useState(false);
  const [paidThroughTarget, setPaidThroughTarget] = React.useState<{
    enrolmentId: string;
    currentPaidThrough: Date | null;
  } | null>(null);

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

  const loadStudentDetails = React.useCallback(async (studentId: string, options?: { silent?: boolean }) => {
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
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Unable to load student.");
      setStudentDetails(null);
    } finally {
      if (studentRequestToken.current === token && !options?.silent) {
        setIsLoadingStudent(false);
      }
    }
  }, []);

  React.useEffect(() => {
    syncQueryParam("tab", activeTab === "overview" ? null : activeTab);
  }, [activeTab, syncQueryParam]);

  React.useEffect(() => {
    syncQueryParam("student", selectedStudentId || null);
  }, [selectedStudentId, syncQueryParam]);

  const studentRows = React.useMemo<StudentListRow[]>(() => {
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

  React.useEffect(() => {
    const availableStudentIds = studentRows.map((row) => row.id);
    if (!availableStudentIds.length) {
      if (selectedStudentId) {
        setSelectedStudentId("");
      }
      return;
    }
    if (!selectedStudentId || !availableStudentIds.includes(selectedStudentId)) {
      setSelectedStudentId(availableStudentIds[0]);
    }
  }, [selectedStudentId, studentRows]);

  React.useEffect(() => {
    if (!selectedStudentId) {
      studentRequestToken.current += 1;
      setStudentDetails(null);
      setIsLoadingStudent(false);
      return;
    }

    const cached = studentCache.current.get(selectedStudentId);
    if (cached) {
      setStudentDetails(cached);
      setIsLoadingStudent(false);
      return;
    }

    // Clear stale data while switching students to avoid showing previous details during fetch.
    setStudentDetails(null);
    void loadStudentDetails(selectedStudentId);
  }, [loadStudentDetails, selectedStudentId]);

  const selectedStudentDetails =
    studentDetails && studentDetails.id === selectedStudentId ? studentDetails : null;

  const refreshStudentDetails = React.useCallback(
    (id?: string | null) => {
      const studentId = id ?? selectedStudentId;
      if (!studentId) return;
      void loadStudentDetails(studentId);
    },
    [loadStudentDetails, selectedStudentId]
  );

  const selectedStudentRow = studentRows.find((row) => row.id === selectedStudentId) ?? null;
  const paidThroughOptions = selectedStudentRow?.enrolments.map((enrolment) => ({
    id: enrolment.id,
    label: enrolment.templateName ? `${enrolment.planName} • ${enrolment.templateName}` : enrolment.planName,
    currentPaidThrough:
      enrolment.projectedCoverageEnd ?? enrolment.paidThroughDate ?? enrolment.latestCoverageEnd ?? null,
  })) ?? [];

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
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Unable to save student.");
      return { success: false };
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    const ok = window.confirm("Delete this student? This cannot be undone.");
    if (!ok) return;

    try {
      await deleteStudent(studentId);
      toast.success("Student removed.");
      studentCache.current.delete(studentId);
      router.refresh();
      if (selectedStudentId === studentId) {
        const remainingIds = studentRows.filter((row) => row.id !== studentId).map((row) => row.id);
        setSelectedStudentId(remainingIds[0] ?? "");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Unable to delete student.");
    }
  };

  const handleEditStudent = (studentId: string) => {
    const target = family?.students.find((student) => student.id === studentId);
    if (!target) return;
    setSelectedStudentId(studentId);
    setEditingStudent(target);
    setStudentSheetOpen(true);
  };

  const handleChangeLevel = (studentId: string) => {
    const target = family?.students.find((student) => student.id === studentId);
    if (!target) return;
    setSelectedStudentId(studentId);
    setChangingStudent(target);
  };

  const handleOpenStudent = (studentId: string) => {
    if (!family) return;
    const returnUrl = `/admin/family/${family.id}?tab=overview&student=${studentId}`;
    router.push(buildReturnUrl(`/admin/student/${studentId}`, returnUrl));
  };

  const handleEnrolInClass = (studentId: string) => {
    if (!enrolContext?.templateId) return;
    const qs = new URLSearchParams();
    qs.set("studentId", studentId);
    qs.set("templateId", enrolContext.templateId);
    if (enrolContext.startDate) qs.set("startDate", enrolContext.startDate);
    router.push(`/admin/enrolments/new?${qs.toString()}`);
  };

  const handleBillingUpdated = React.useCallback(() => {
    if (selectedStudentId) {
      refreshStudentDetails(selectedStudentId);
    }
  }, [refreshStudentDetails, selectedStudentId]);

  const subtitleParts = [
    `${family?.students.length ?? 0} student${family?.students.length === 1 ? "" : "s"}`,
    family?.primaryContactName ? `Primary contact: ${family.primaryContactName}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const balanceSummary =
    billingPosition.outstandingCents > 0
      ? {
          value: formatCurrencyFromCents(billingPosition.outstandingCents),
          detail: "Outstanding across the family account.",
          tone: "danger" as const,
        }
      : billingPosition.unallocatedCents > 0
        ? {
            value: formatCurrencyFromCents(billingPosition.unallocatedCents),
            detail: "Credit available across the family account.",
            tone: "success" as const,
          }
        : {
            value: "Settled",
            detail: "No balance due right now.",
            tone: "success" as const,
          };

  if (!family) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-scroll">
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <FamilyHeader
            title={family.name}
            subtitle={subtitleParts || null}
            onRecordPayment={() => setPaymentSheetOpen(true)}
            onAddStudent={() => {
              setEditingStudent(null);
              setStudentSheetOpen(true);
            }}
            onPayAhead={() => setPayAheadOpen(true)}
            onEditFamily={() => setFamilySheetOpen(true)}
          />

          <FamilySummaryRow
            items={[
              {
                label: "Balance",
                value: balanceSummary.value,
                detail: balanceSummary.detail,
                tone: balanceSummary.tone,
              },
              {
                label: "Paid through",
                value: billingPosition.paidThroughLatest ? formatBrisbaneDate(billingPosition.paidThroughLatest) : "Not prepaid",
                detail: "Latest entitlement across active student billing.",
              },
              {
                label: "Next payment due",
                value: billingPosition.nextDueInvoice?.dueAt ? formatBrisbaneDate(billingPosition.nextDueInvoice.dueAt) : "Nothing due",
                detail: billingPosition.nextDueInvoice
                  ? `${formatCurrencyFromCents(billingPosition.nextDueInvoice.balanceCents)} outstanding on the next invoice.`
                  : "No open invoice is currently due.",
              },
            ]}
            secondaryTitle="Family account"
            secondaryDescription="Secondary account metadata and setup details."
            secondaryItems={[
              {
                label: "Opening balance",
                value: openingState ? `Recorded ${formatBrisbaneDate(openingState.createdAt)}` : "Not recorded",
              },
              {
                label: "Unallocated credit",
                value:
                  billingPosition.unallocatedCents > 0
                    ? formatCurrencyFromCents(billingPosition.unallocatedCents)
                    : "None",
              },
              {
                label: "Students",
                value: String(family.students.length),
              },
            ]}
          />

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(parseTabParam(value))}
            className="space-y-4"
          >
            <TabsList className="h-auto w-fit justify-start rounded-lg bg-muted/60 p-1">
              <TabsTrigger value="overview" className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Overview
              </TabsTrigger>
              <TabsTrigger value="billing" className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Billing activity
              </TabsTrigger>
              <TabsTrigger value="history" className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                History
              </TabsTrigger>
              <TabsTrigger value="contacts" className="h-9 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Contacts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="m-0">
              <div className="space-y-4">
                {studentRows.length > 0 ? (
                  <div className="space-y-2 md:hidden">
                    <label className="text-sm font-medium text-foreground">Student</label>
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {studentRows.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <FamilyStudentList
                      rows={studentRows}
                      selectedStudentId={selectedStudentId}
                      onSelect={setSelectedStudentId}
                    />
                  </div>

                  <div className="space-y-6">
                    <section className="rounded-xl border border-border/80 bg-background p-5">
                      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Student-scoped
                          </div>
                          {selectedStudentRow ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold">{selectedStudentRow.name}</h2>
                                <Badge variant={selectedStudentRow.status.variant} className="text-[11px]">
                                  {selectedStudentRow.status.label}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {selectedStudentRow.levelName ?? "No level"} • {selectedStudentRow.paidThroughLabel}
                              </p>
                            </>
                          ) : (
                            <>
                              <h2 className="text-base font-semibold">Selected student</h2>
                              <p className="text-sm text-muted-foreground">
                                Add a student to start managing enrolments from this family page.
                              </p>
                            </>
                          )}
                        </div>

                        {selectedStudentRow ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleOpenStudent(selectedStudentRow.id)}>
                              Open student
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="secondary">
                                  More
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {enrolContext ? (
                                  <>
                                    <DropdownMenuItem onSelect={() => handleEnrolInClass(selectedStudentRow.id)}>
                                      Enrol in class
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                ) : null}
                                <DropdownMenuItem onSelect={() => handleEditStudent(selectedStudentRow.id)}>
                                  Edit student
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleChangeLevel(selectedStudentRow.id)}>
                                  Change level
                                </DropdownMenuItem>
                                {paidThroughOptions.length > 1 ? (
                                  paidThroughOptions.map((option) => (
                                    <DropdownMenuItem
                                      key={option.id}
                                      onSelect={() =>
                                        setPaidThroughTarget({
                                          enrolmentId: option.id,
                                          currentPaidThrough: option.currentPaidThrough,
                                        })
                                      }
                                    >
                                      Edit paid through · {option.label}
                                    </DropdownMenuItem>
                                  ))
                                ) : (
                                  <DropdownMenuItem
                                    disabled={!paidThroughOptions.length}
                                    onSelect={() => {
                                      const option = paidThroughOptions[0];
                                      if (!option) return;
                                      setPaidThroughTarget({
                                        enrolmentId: option.id,
                                        currentPaidThrough: option.currentPaidThrough,
                                      });
                                    }}
                                  >
                                    Edit paid through
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => handleDeleteStudent(selectedStudentRow.id)}
                                >
                                  Remove student
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4">
                        {studentRows.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
                            <div className="text-sm font-medium text-foreground">No students yet</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Add a student before managing enrolments or class changes.
                            </p>
                            <Button
                              className="mt-4"
                              onClick={() => {
                                setEditingStudent(null);
                                setStudentSheetOpen(true);
                              }}
                            >
                              Add student
                            </Button>
                          </div>
                        ) : isLoadingStudent && !selectedStudentDetails ? (
                          <div className="space-y-3" aria-busy="true" aria-live="polite" role="status">
                            <span className="sr-only">Loading student details</span>
                            <Skeleton className="h-5 w-44" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                          </div>
                        ) : selectedStudentDetails ? (
                          <StudentEnrolmentsSection
                            student={selectedStudentDetails}
                            levels={levels}
                            enrolmentPlans={enrolmentPlans}
                            onUpdated={() => {
                              refreshStudentDetails(selectedStudentId);
                              router.refresh();
                            }}
                            editContextSource="family"
                            layout="plain"
                          />
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
                            <div className="text-sm font-medium text-foreground">Unable to load student details</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Try selecting the student again.
                            </p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="space-y-4">
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Family-level tools
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Operational tools that apply to the family account rather than a single student.
                        </p>
                      </div>
                      <AwaySection
                        familyId={family.id}
                        students={family.students.map((student) => ({ id: student.id, name: student.name }))}
                        awayPeriods={awayPeriods}
                      />
                      <MakeupsSection familyId={family.id} students={family.students} summary={makeups} />
                    </section>
                  </div>
                </div>
              </div>
            </TabsContent>

            {visitedTabs.has("billing") ? (
              <TabsContent value="billing" className="m-0">
                <FamilyInvoices
                  family={family}
                  billing={billing}
                  billingPosition={billingPosition}
                  onUpdated={handleBillingUpdated}
                />
              </TabsContent>
            ) : null}

            {visitedTabs.has("history") ? (
              <TabsContent value="history" className="m-0">
                <HistorySection billing={billing} family={family} />
              </TabsContent>
            ) : null}

            {visitedTabs.has("contacts") ? (
              <TabsContent value="contacts" className="m-0">
                <FamilyContactsPanel
                  contacts={family}
                  onEdit={() => setFamilySheetOpen(true)}
                />
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
        onSave={handleSaveStudent}
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

      {paidThroughTarget ? (
        <EditPaidThroughDialog
          enrolmentId={paidThroughTarget.enrolmentId}
          currentPaidThrough={paidThroughTarget.currentPaidThrough}
          open={Boolean(paidThroughTarget)}
          presentation="sheet"
          onOpenChange={(open) => {
            if (!open) setPaidThroughTarget(null);
          }}
          onUpdated={() => {
            setPaidThroughTarget(null);
            router.refresh();
          }}
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

function HistorySection({
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

    const reasonMeta: Record<string, { label: string; source: string; category: AuditCategory }> = {
      PAIDTHROUGH_MANUAL_EDIT: { label: "Paid-through updated", source: "Manual edit", category: "PAIDTHROUGH" },
      INVOICE_APPLIED: { label: "Payment applied", source: "Payment", category: "PAIDTHROUGH" },
      HOLIDAY_ADDED: { label: "Holiday updated", source: "Recalculation", category: "COVERAGE" },
      HOLIDAY_REMOVED: { label: "Holiday updated", source: "Recalculation", category: "COVERAGE" },
      HOLIDAY_UPDATED: { label: "Holiday updated", source: "Recalculation", category: "COVERAGE" },
      CLASS_CHANGED: { label: "Class changed", source: "Schedule update", category: "CLASS_CHANGE" },
      PLAN_CHANGED: { label: "Plan changed", source: "Billing update", category: "CLASS_CHANGE" },
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
      entries.push({
        id: audit.id,
        studentId: student.id,
        studentName: student.name,
        createdAt: new Date(audit.createdAt),
        category: meta.category,
        title: meta.label,
        subtitle: `${meta.source} • ${format(new Date(audit.createdAt), "d MMM yyyy · h:mm a")}`,
        details: `Paid-through changed from ${formatBrisbaneDate(audit.previousPaidThroughDate ?? null)} to ${formatBrisbaneDate(audit.nextPaidThroughDate ?? null)}.`,
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
          subtitle: `Admin • ${format(new Date(change.createdAt), "d MMM yyyy · h:mm a")}`,
          details: `Changed from ${change.fromLevel?.name ?? "—"} to ${change.toLevel?.name ?? "—"} (effective ${formatBrisbaneDate(change.effectiveDate)}).`,
        });
      });
    });

    return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [billing.coverageAudits, family.students]);

  const filteredEntries = React.useMemo(
    () =>
      auditEntries.filter((entry) => {
        if (selectedStudentId !== "ALL" && entry.studentId !== selectedStudentId) return false;
        if (selectedCategory !== "ALL" && entry.category !== selectedCategory) return false;
        return true;
      }),
    [auditEntries, selectedCategory, selectedStudentId]
  );

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
    <section className="rounded-xl border border-border/80 bg-background p-5">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">History</h2>
          <p className="text-sm text-muted-foreground">
            Admin and system events for enrolment, level, and coverage updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{filteredEntries.length} events</Badge>
          <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as AuditCategory)}>
            <SelectTrigger className="h-8 w-[190px] text-xs">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="PAIDTHROUGH">Paid-through</SelectItem>
              <SelectItem value="CLASS_CHANGE">Class or plan changes</SelectItem>
              <SelectItem value="LEVEL_CHANGE">Level changes</SelectItem>
              <SelectItem value="COVERAGE">Coverage changes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectedStudentId === "ALL" ? "secondary" : "outline"}
            onClick={() => setSelectedStudentId("ALL")}
          >
            All students
          </Button>
          {students.map((student) => (
            <Button
              key={student.id}
              type="button"
              size="sm"
              variant={selectedStudentId === student.id ? "secondary" : "outline"}
              onClick={() => setSelectedStudentId(student.id)}
            >
              {student.name}
            </Button>
          ))}
        </div>

        {filteredEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
            <div className="text-sm font-medium text-foreground">No history yet</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Events will appear here as admins update enrolments and billing coverage.
            </p>
          </div>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {filteredEntries.map((entry, index) => {
                const meta = categoryMeta[(entry.category === "ALL" ? "COVERAGE" : entry.category) as Exclude<
                  AuditCategory,
                  "ALL"
                >];
                const Icon = meta.icon;

                return (
                  <li key={entry.id}>
                    <div className="relative pb-8">
                      {index !== filteredEntries.length - 1 ? (
                        <span aria-hidden="true" className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={cn(meta.color, "flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-background")}>
                            <Icon aria-hidden="true" className="h-4 w-4 text-white" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between gap-4 pt-1.5">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{entry.title}</p>
                              <Badge variant="outline" className="text-[11px]">
                                {entry.studentName}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{entry.subtitle}</p>
                            {entry.details ? <p className="text-sm text-muted-foreground">{entry.details}</p> : null}
                          </div>
                          <time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={entry.createdAt.toISOString()}>
                            {format(entry.createdAt, "d MMM yyyy")}
                          </time>
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
        <SheetHeader className="px-0">
          <SheetTitle>Edit family</SheetTitle>
          <SheetDescription>
            Update contact details, address information, and family account metadata.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <Separator />
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
