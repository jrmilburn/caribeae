"use client";

import * as React from "react";
import Link from "next/link";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { Mail, Phone, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BackButton } from "@/components/navigation/BackButton";
import { cn } from "@/lib/utils";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";

import { ReceptionSearch } from "@/components/admin/reception/ReceptionSearch";
import { FamilyModal } from "@/app/admin/(protected)/family/FamilyModal";
import { StudentModal } from "@/app/admin/(protected)/family/[id]/StudentModal";
import { AddEnrolmentDialog } from "@/app/admin/(protected)/student/[id]/AddEnrolmentDialog";
import { ChangeEnrolmentDialog } from "@/app/admin/(protected)/student/[id]/ChangeEnrolmentDialog";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { RecordPaymentSheet } from "@/components/admin/billing/RecordPaymentSheet";
import { PayAheadSheet } from "@/components/admin/billing/PayAheadSheet";

import { searchReception } from "@/server/reception/searchReception";
import { getReceptionFamilyData } from "@/server/reception/getReceptionFamilyData";
import { getStudent } from "@/server/student/getStudent";
import { createFamily } from "@/server/family/createFamily";
import { updateFamily } from "@/server/family/updateFamily";
import { createStudent } from "@/server/student/createStudent";
import { updateStudent } from "@/server/student/updateStudent";

import type { ClientStudentWithRelations } from "@/app/admin/(protected)/student/[id]/types";

type FamilyPickerEntry = Awaited<ReturnType<typeof searchReception>>["families"][number];
const EMPTY_FAMILY_PICKER: FamilyPickerEntry[] = [];

type ReceptionFamilyData = Awaited<ReturnType<typeof getReceptionFamilyData>>;

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

export function ReceptionPageClient({ levels, enrolmentPlans }: { levels: Level[]; enrolmentPlans: EnrolmentPlan[] }) {
  const [familyData, setFamilyData] = React.useState<ReceptionFamilyData | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = React.useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [studentDetails, setStudentDetails] = React.useState<ClientStudentWithRelations | null>(null);
  const [isLoadingFamily, startLoadingFamily] = React.useTransition();
  const [isLoadingStudent, startLoadingStudent] = React.useTransition();

  const studentCache = React.useRef(new Map<string, ClientStudentWithRelations>());

  const [familyModalOpen, setFamilyModalOpen] = React.useState(false);
  const [familyModalMode, setFamilyModalMode] = React.useState<"create" | "edit">("create");
  const [studentModalOpen, setStudentModalOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<ClientStudentWithRelations | null>(null);
  const [familyPickerOpen, setFamilyPickerOpen] = React.useState(false);
  const [familyPickerQuery, setFamilyPickerQuery] = React.useState("");
  const [familyPickerResults, setFamilyPickerResults] = React.useState(EMPTY_FAMILY_PICKER);
  const [familyPickerSearching, setFamilyPickerSearching] = React.useState(false);

  const [enrolDialogOpen, setEnrolDialogOpen] = React.useState(false);
  const [editingEnrolment, setEditingEnrolment] = React.useState<ClientStudentWithRelations["enrolments"][number] | null>(null);

  const loadFamilyData = React.useCallback((familyId: string, options?: { studentId?: string }) => {
    setSelectedFamilyId(familyId);
    setSelectedStudentId(options?.studentId ?? null);
    setStudentDetails(null);

    startLoadingFamily(async () => {
      try {
        const data = await getReceptionFamilyData(familyId);
        setFamilyData(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load family.";
        toast.error(message);
        setFamilyData(null);
      }
    });
  }, []);

  const refreshStudentDetails = React.useCallback(
    (studentId: string) => {
      startLoadingStudent(async () => {
        try {
          const student = await getStudent(studentId);
          if (!student) throw new Error("Student not found.");
          studentCache.current.set(studentId, student as ClientStudentWithRelations);
          setStudentDetails(student as ClientStudentWithRelations);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to refresh student.";
          toast.error(message);
        }
      });
    },
    [startLoadingStudent]
  );

  const refreshFamilyData = React.useCallback(() => {
    if (!selectedFamilyId) return;
    startLoadingFamily(async () => {
      try {
        const data = await getReceptionFamilyData(selectedFamilyId);
        setFamilyData(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to refresh family.";
        toast.error(message);
      }
    });
    if (selectedStudentId) {
      refreshStudentDetails(selectedStudentId);
    }
  }, [refreshStudentDetails, selectedFamilyId, selectedStudentId]);

  React.useEffect(() => {
    if (!selectedStudentId) {
      setStudentDetails(null);
      return;
    }

    const cached = studentCache.current.get(selectedStudentId);
    if (cached) {
      setStudentDetails(cached);
      return;
    }

    let active = true;
    startLoadingStudent(async () => {
      try {
        const student = await getStudent(selectedStudentId);
        if (!active) return;
        if (!student) throw new Error("Student not found.");
        studentCache.current.set(selectedStudentId, student as ClientStudentWithRelations);
        setStudentDetails(student as ClientStudentWithRelations);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Unable to load student.";
        toast.error(message);
        setStudentDetails(null);
      }
    });

    return () => {
      active = false;
    };
  }, [selectedStudentId]);

  React.useEffect(() => {
    if (!familyPickerOpen) return;
    if (!familyPickerQuery.trim()) {
      setFamilyPickerResults(EMPTY_FAMILY_PICKER);
      setFamilyPickerSearching(false);
      return;
    }

    let active = true;
    const handle = window.setTimeout(() => {
      setFamilyPickerSearching(true);
      searchReception(familyPickerQuery)
        .then((res) => {
          if (!active) return;
          setFamilyPickerResults(res.families);
        })
        .catch(() => {
          if (!active) return;
          setFamilyPickerResults(EMPTY_FAMILY_PICKER);
        })
        .finally(() => {
          if (!active) return;
          setFamilyPickerSearching(false);
        });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [familyPickerOpen, familyPickerQuery]);

  React.useEffect(() => {
    if (familyPickerOpen) return;
    setFamilyPickerQuery("");
    setFamilyPickerResults(EMPTY_FAMILY_PICKER);
    setFamilyPickerSearching(false);
  }, [familyPickerOpen]);

  const handleSelectFamily = React.useCallback(
    (familyId: string) => {
      loadFamilyData(familyId);
    },
    [loadFamilyData]
  );

  const handleSelectStudent = React.useCallback(
    (familyId: string, studentId: string) => {
      loadFamilyData(familyId, { studentId });
    },
    [loadFamilyData]
  );

  const handleNewFamily = () => {
    setFamilyModalMode("create");
    setFamilyModalOpen(true);
  };

  const handleEditFamily = () => {
    if (!familyData?.family) return;
    setFamilyModalMode("edit");
    setFamilyModalOpen(true);
  };

  const handleNewStudent = () => {
    if (!selectedFamilyId) {
      setFamilyPickerQuery("");
      setFamilyPickerResults(EMPTY_FAMILY_PICKER);
      setFamilyPickerOpen(true);
      return;
    }
    setEditingStudent(null);
    setStudentModalOpen(true);
  };

  const handlePickFamilyForStudent = (familyId: string) => {
    loadFamilyData(familyId);
    setFamilyPickerOpen(false);
    setEditingStudent(null);
    setStudentModalOpen(true);
  };

  const handleSaveFamily = async (payload: Parameters<typeof createFamily>[0]) => {
    const action = familyModalMode === "edit" && familyData?.family
      ? updateFamily(payload, familyData.family.id)
      : createFamily(payload);

    const result = await action;

    if (result.success && result.family) {
      loadFamilyData(result.family.id);
    }

    return result;
  };

  const handleSaveStudent = async (payload: Parameters<typeof createStudent>[0] & { id?: string }) => {
    try {
      if (payload.id) {
        await updateStudent({ ...payload, id: payload.id });
        studentCache.current.delete(payload.id);
      } else {
        await createStudent(payload);
      }
      refreshFamilyData();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save student.";
      toast.error(message);
      return { success: false };
    }
  };

  const family = familyData?.family ?? null;
  const billingPosition = familyData?.billingPosition ?? null;
  const students = family?.students ?? [];

  const studentSummaries = React.useMemo(() => {
    if (!family || !billingPosition) return [];

    const billingMap = new Map(billingPosition.students.map((student) => [student.id, student]));
    return students.map((student) => {
      const billingStudent = billingMap.get(student.id);
      const status = resolveStudentStatus(billingStudent?.enrolments);
      return {
        ...student,
        status,
      };
    });
  }, [family, billingPosition, students]);

  const selectedStudentSummary = studentSummaries.find((student) => student.id === selectedStudentId) ?? null;
  const selectedStudentLevel = studentDetails?.level?.name ?? selectedStudentSummary?.level?.name ?? "";
  const selectedStudentName = selectedStudentSummary?.name ?? studentDetails?.name ?? "";
  const enrolmentPlanOptions = React.useMemo(() => {
    if (!studentDetails?.levelId) return enrolmentPlans;
    return enrolmentPlans.filter((plan) => plan.levelId === studentDetails.levelId);
  }, [enrolmentPlans, studentDetails?.levelId]);

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-1 items-center gap-2">
            <BackButton label="Back" />
            <ReceptionSearch onSelectFamily={handleSelectFamily} onSelectStudent={handleSelectStudent} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleNewFamily}>
              New family
            </Button>
            <Button variant="outline" onClick={handleNewStudent}>
              New student
            </Button>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/admin/reception/pos" aria-label="Open POS">
                <ShoppingBag className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              {!family && !isLoadingFamily ? (
                <Card className="border-dashed">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base">Front desk reception</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Search for a family or student to start, then pick a student to act.
                    </p>
                  </CardHeader>
                </Card>
              ) : null}

              {isLoadingFamily && !family ? (
                <Card>
                  <CardHeader className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-40" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ) : null}

              {family && billingPosition ? (
                <Card>
                  <CardHeader className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Family</div>
                        <div className="text-xl font-semibold leading-tight">{family.name}</div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          {family.primaryContactName ? (
                            <span className="font-medium text-foreground">{family.primaryContactName}</span>
                          ) : null}
                          {family.primaryPhone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-4 w-4" />
                              {family.primaryPhone}
                            </span>
                          ) : null}
                          {family.primaryEmail ? (
                            <span className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              {family.primaryEmail}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-lg border bg-muted/30 p-4 text-right">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance</div>
                        <div
                          className={cn(
                            "mt-1 text-2xl font-semibold",
                            billingPosition.outstandingCents > 0 ? "text-destructive" : "text-emerald-700"
                          )}
                        >
                          {formatCurrencyFromCents(billingPosition.outstandingCents)}
                        </div>
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/family/${family.id}`}>Open family</Link>
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleEditFamily}>
                            Edit family
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <Separator />

                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium">Students</div>
                      <div className="text-xs text-muted-foreground">{students.length} total</div>
                    </div>

                    {students.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No students yet.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {studentSummaries.map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => setSelectedStudentId(student.id)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition",
                              selectedStudentId === student.id ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{student.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {student.level?.name ?? "No level"}
                              </div>
                            </div>
                            <Badge variant={student.status.variant} className="text-[11px]">
                              {student.status.label}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="space-y-2">
                  <CardTitle className="text-base">Actions</CardTitle>
                  {!selectedStudentId ? (
                    <p className="text-sm text-muted-foreground">Select a student to see available actions.</p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedStudentId && selectedStudentName ? (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected student</div>
                      <div className="mt-1 text-lg font-semibold">{selectedStudentName}</div>
                      <div className="text-xs text-muted-foreground">{selectedStudentLevel || "Level not set"}</div>
                    </div>
                  ) : null}

                  {selectedStudentId ? (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Button
                          onClick={() => setEnrolDialogOpen(true)}
                          disabled={!studentDetails || !studentDetails.levelId}
                        >
                          Enrol in class
                        </Button>
                        {studentDetails && !studentDetails.levelId ? (
                          <p className="text-xs text-muted-foreground">Set the student level before enrolling.</p>
                        ) : null}
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!studentDetails) return;
                            setEditingStudent(studentDetails);
                            setStudentModalOpen(true);
                          }}
                          disabled={!studentDetails || isLoadingStudent}
                        >
                          Update student details
                        </Button>
                      </div>

                      {family && billingPosition ? (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing</div>
                          <div className="grid gap-2">
                            <RecordPaymentSheet
                              familyId={family.id}
                              enrolments={billingPosition.enrolments}
                              openInvoices={familyData?.billing.openInvoices ?? []}
                              trigger={
                                <Button variant="secondary" className="w-full">
                                  Take payment
                                </Button>
                              }
                              onSuccess={refreshFamilyData}
                            />
                            <PayAheadSheet
                              familyId={family.id}
                              trigger={
                                <Button variant="outline" className="w-full">
                                  Pay ahead
                                </Button>
                              }
                              onUpdated={refreshFamilyData}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {selectedStudentId && studentDetails ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Enrolments</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {studentDetails.enrolments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No enrolments yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {studentDetails.enrolments.map((enrolment) => {
                          const assignments = enrolment.classAssignments?.length
                            ? enrolment.classAssignments.map((assignment) => assignment.template)
                            : enrolment.template
                              ? [enrolment.template]
                              : [];
                          const classLabel = assignments.length
                            ? assignments
                                .map((template) => template?.name ?? template?.level?.name ?? "Class")
                                .join(", ")
                            : "Class";
                          return (
                            <div key={enrolment.id} className="rounded-lg border p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="text-sm font-semibold">{enrolment.plan?.name ?? "Plan"}</div>
                                  <div className="text-xs text-muted-foreground">{classLabel}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Paid through {formatBrisbaneDate(enrolment.paidThroughDate ?? null)}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={enrolment.status === "CHANGEOVER" ? "outline" : "secondary"}>
                                    {enrolment.status === "CHANGEOVER" ? "Changeover" : enrolment.status}
                                  </Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (!enrolment.plan) {
                                        toast.error("Enrolment plan missing; cannot change selection.");
                                        return;
                                      }
                                      setEditingEnrolment(enrolment);
                                    }}
                                  >
                                    Change class
                                  </Button>
                                  <EditPaidThroughDialog
                                    enrolmentId={enrolment.id}
                                    currentPaidThrough={enrolment.paidThroughDate ?? null}
                                    onUpdated={refreshFamilyData}
                                    trigger={
                                      <Button variant="ghost" size="sm">
                                        Edit paid-through
                                      </Button>
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {selectedStudentId && isLoadingStudent ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading student...
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <FamilyModal
        open={familyModalOpen}
        onOpenChange={setFamilyModalOpen}
        family={familyModalMode === "edit" ? family : null}
        levels={levels}
        onSave={handleSaveFamily}
      />

      {selectedFamilyId ? (
        <StudentModal
          open={studentModalOpen}
          onOpenChange={(open) => {
            setStudentModalOpen(open);
            if (!open) setEditingStudent(null);
          }}
          familyId={selectedFamilyId}
          student={editingStudent ?? undefined}
          onSave={handleSaveStudent}
          levels={levels}
        />
      ) : null}

      {studentDetails ? (
        <AddEnrolmentDialog
          open={enrolDialogOpen}
          onOpenChange={setEnrolDialogOpen}
          studentId={studentDetails.id}
          levels={levels}
          enrolmentPlans={enrolmentPlanOptions}
          studentLevelId={studentDetails.levelId}
          onCreated={refreshFamilyData}
        />
      ) : null}

      {editingEnrolment && editingEnrolment.plan ? (
        <ChangeEnrolmentDialog
          open={Boolean(editingEnrolment)}
          onOpenChange={(open) => !open && setEditingEnrolment(null)}
          enrolment={editingEnrolment as ClientStudentWithRelations["enrolments"][number] & { plan: NonNullable<ClientStudentWithRelations["enrolments"][number]["plan"]> }}
          enrolmentPlans={enrolmentPlans}
          levels={levels}
          studentLevelId={studentDetails?.levelId}
          initialTemplateIds={
            editingEnrolment.classAssignments?.length
              ? editingEnrolment.classAssignments.map((assignment) => assignment.templateId)
              : editingEnrolment.templateId
                ? [editingEnrolment.templateId]
                : []
          }
          onChanged={() => {
            setEditingEnrolment(null);
            refreshFamilyData();
          }}
        />
      ) : null}

      <Dialog open={familyPickerOpen} onOpenChange={setFamilyPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select family for new student</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={familyPickerQuery}
              onChange={(event) => setFamilyPickerQuery(event.target.value)}
              placeholder="Search families..."
            />
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {familyPickerSearching ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : familyPickerResults.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No families found.</div>
              ) : (
                <div className="flex flex-col">
                  {familyPickerResults.map((family) => (
                    <button
                      key={family.id}
                      type="button"
                      onClick={() => handlePickFamilyForStudent(family.id)}
                      className="flex items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/40"
                    >
                      <div>
                        <div className="font-medium">{family.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {family.primaryContactName || "Family"}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">Select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
