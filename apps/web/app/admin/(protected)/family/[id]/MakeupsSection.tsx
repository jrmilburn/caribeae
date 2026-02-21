"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MakeupCreditStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import {
  cancelMakeupBookingAsAdmin,
  grantMakeupCredit,
} from "@/server/makeup/actions";
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
      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Makeups</CardTitle>
            <p className="text-sm text-muted-foreground">
              Grant and manage makeup credits for manually excused absences.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Available: {summary.availableCount}</Badge>
            <Button size="sm" onClick={() => setOpen(true)}>
              Grant makeup
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {summary.credits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No makeup credits recorded.</p>
          ) : (
            summary.credits.map((credit) => (
              <div key={credit.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{credit.student.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {credit.reason} · Issued {formatBrisbaneDate(credit.issuedAt)} · Expires {formatBrisbaneDate(credit.expiresAt)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Missed session: {credit.earnedFromClass?.name ?? "Class"} on {formatBrisbaneDate(credit.earnedFromSessionDate)}
                    </div>
                    {credit.booking ? (
                      <div className="text-xs text-muted-foreground">
                        Booked into {credit.booking.targetClass?.name ?? "Class"} on {formatBrisbaneDate(credit.booking.targetSessionDate)}
                      </div>
                    ) : null}
                    {credit.notes ? <div className="text-xs text-muted-foreground">Note: {credit.notes}</div> : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={badgeVariantForStatus(credit.status)}>{credit.status}</Badge>
                    {credit.booking && credit.booking.status === "BOOKED" ? (
                      <Button size="sm" variant="outline" onClick={() => handleCancelBooking(credit.booking!.id)}>
                        Cancel booking
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Grant makeup credit</DialogTitle>
            <DialogDescription>
              Marks attendance as excused and creates one makeup credit.
            </DialogDescription>
          </DialogHeader>

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

            <div className="space-y-2">
              <Label>Session date</Label>
              <Input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
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

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                placeholder="Optional internal note"
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={allowLateOverride}
                onCheckedChange={(checked) => setAllowLateOverride(Boolean(checked))}
              />
              Override notice cutoff when needed
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleGrant} disabled={!canSubmit}>
              {saving ? "Granting..." : "Grant credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
