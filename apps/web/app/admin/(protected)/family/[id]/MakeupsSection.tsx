"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MakeupCreditStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { cancelMakeupBookingAsAdmin, grantMakeupCredit } from "@/server/makeup/actions";
import type { FamilyMakeupSummary } from "@/server/makeup/getFamilyMakeups";

type MakeupSummary = FamilyMakeupSummary;

type StudentOption = {
  id: string;
  name: string;
  enrolments: Array<{
    templateId: string;
    classAssignments?: Array<{
      templateId: string;
      template?: {
        id: string;
        name: string | null;
        dayOfWeek: number | null;
        startTime: number | null;
      } | null;
    }>;
  }>;
};

type ClassOption = {
  id: string;
  label: string;
};

function badgeVariantForStatus(status: MakeupCreditStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === MakeupCreditStatus.AVAILABLE) return "secondary";
  if (status === MakeupCreditStatus.USED) return "default";
  if (status === MakeupCreditStatus.EXPIRED) return "outline";
  if (status === MakeupCreditStatus.CANCELLED) return "outline";
  return "outline";
}

function buildClassOptions(student: StudentOption | undefined): ClassOption[] {
  if (!student) return [];

  const map = new Map<string, ClassOption>();

  student.enrolments.forEach((enrolment) => {
    const assignments = enrolment.classAssignments ?? [];
    assignments.forEach((assignment) => {
      const template = assignment.template;
      if (!template) return;
      const label = template.name?.trim() || `Class ${template.id.slice(0, 8)}`;
      map.set(template.id, { id: template.id, label });
    });

    if (!assignments.length) {
      const fallbackId = enrolment.templateId;
      map.set(fallbackId, { id: fallbackId, label: `Class ${fallbackId.slice(0, 8)}` });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function MakeupsSection({
  familyId,
  students,
  summary,
}: {
  familyId: string;
  students: StudentOption[];
  summary: MakeupSummary;
}) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [studentId, setStudentId] = React.useState<string>(students[0]?.id ?? "");
  const [classId, setClassId] = React.useState<string>("");
  const [sessionDate, setSessionDate] = React.useState<string>("");
  const [reason, setReason] = React.useState<"SICK" | "OTHER">("SICK");
  const [notes, setNotes] = React.useState("");
  const [allowLateOverride, setAllowLateOverride] = React.useState(false);

  const student = students.find((entry) => entry.id === studentId);
  const classOptions = React.useMemo(() => buildClassOptions(student), [student]);

  React.useEffect(() => {
    if (!open) return;
    if (!studentId && students[0]?.id) {
      setStudentId(students[0].id);
    }
  }, [open, studentId, students]);

  React.useEffect(() => {
    if (!classOptions.length) {
      setClassId("");
      return;
    }
    if (!classOptions.some((option) => option.id === classId)) {
      setClassId(classOptions[0].id);
    }
  }, [classId, classOptions]);

  const canSubmit = Boolean(studentId && classId && sessionDate) && !saving;

  const handleGrant = async () => {
    if (!canSubmit) return;
    setSaving(true);

    try {
      await runMutationWithToast(
        () =>
          grantMakeupCredit({
            familyId,
            studentId,
            classId,
            sessionDate,
            reason,
            notes: notes.trim() || null,
            allowLateOverride,
          }),
        {
          pending: { title: "Granting makeup credit..." },
          success: { title: "Makeup credit granted" },
          error: (message) => ({
            title: "Unable to grant makeup credit",
            description: message,
          }),
          onSuccess: () => {
            setOpen(false);
            setSessionDate("");
            setNotes("");
            setAllowLateOverride(false);
            router.refresh();
          },
        }
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBooking = async (makeupBookingId: string) => {
    await runMutationWithToast(
      () => cancelMakeupBookingAsAdmin({ makeupBookingId }),
      {
        pending: { title: "Cancelling booking..." },
        success: { title: "Booking cancelled" },
        error: (message) => ({
          title: "Unable to cancel booking",
          description: message,
        }),
        onSuccess: () => router.refresh(),
      }
    );
  };

  return (
    <>
      <section className="rounded-xl border border-border/80 bg-background p-5">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Makeups</h3>
            <p className="text-sm text-muted-foreground">
              Grant and manage makeup credits for manually excused absences.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {summary.availableCount} available
            </Badge>
            <Button size="sm" onClick={() => setOpen(true)} disabled={students.length === 0}>
              Grant makeup
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {summary.credits.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              {students.length === 0
                ? "Add a student before granting makeup credits."
                : "No makeup credits recorded for this family."}
            </div>
          ) : (
            summary.credits.map((credit) => (
              <div
                key={credit.id}
                className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-foreground">{credit.student.name}</div>
                      <Badge
                        variant={badgeVariantForStatus(credit.status)}
                        className="h-5 px-2 text-[11px] font-medium"
                      >
                        {credit.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {credit.reason === "SICK" ? "Sick leave" : "Manual makeup"} · Issued{" "}
                      {formatBrisbaneDate(credit.issuedAt)} · Expires {formatBrisbaneDate(credit.expiresAt)}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Missed session: {credit.earnedFromClass?.name ?? "Class"} on{" "}
                      {formatBrisbaneDate(credit.earnedFromSessionDate)}
                    </div>

                    {credit.booking ? (
                      <div className="text-sm text-muted-foreground">
                        Booked into {credit.booking.targetClass?.name ?? "Class"} on{" "}
                        {formatBrisbaneDate(credit.booking.targetSessionDate)}
                      </div>
                    ) : null}

                    {credit.notes ? <div className="text-sm text-muted-foreground">{credit.notes}</div> : null}
                  </div>

                  {credit.booking && credit.booking.status === "BOOKED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancelBooking(credit.booking!.id)}
                    >
                      Cancel booking
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>Grant makeup credit</SheetTitle>
            <SheetDescription>
              Marks attendance as excused and creates one makeup credit.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
              <div className="text-sm font-medium text-foreground">Makeup summary</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Choose the missed class, session date, and reason. One credit will be created for the selected student.
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Student</Label>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={classId} onValueChange={setClassId} disabled={!classOptions.length}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-4">
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Session details</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Record the missed session and why the absence should be treated as excused.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Session date</Label>
                    <Input
                      type="date"
                      value={sessionDate}
                      onChange={(event) => setSessionDate(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select value={reason} onValueChange={(value) => setReason(value as "SICK" | "OTHER")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SICK">Sick</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    placeholder="Optional internal note"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allowLateOverride}
                    onCheckedChange={(checked) => setAllowLateOverride(Boolean(checked))}
                  />
                  <span>Override the usual notice cutoff when this absence should still receive a makeup credit.</span>
                </label>
              </div>
            </div>
          </div>

          <SheetFooter className="px-0 pb-0 pt-6 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleGrant} disabled={!canSubmit}>
              {saving ? "Granting..." : "Grant credit"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
