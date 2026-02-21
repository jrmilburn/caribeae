"use client";

import * as React from "react";
import type { Prisma } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { saveAttendance } from "@/server/attendance/saveAttendance";
import type { AttendanceChangeDTO, ClassOccurrenceRoster } from "./types";
import type { AttendanceRowState } from "./AttendanceTable";
import { AttendanceTable } from "./AttendanceTable";

type AttendanceSectionProps = {
  templateId: string;
  dateKey: string | null;
  roster: ClassOccurrenceRoster | null;
  isCancelled?: boolean;
  cancellationCredits?: Prisma.EnrolmentAdjustmentGetPayload<{
    include: { enrolment: { include: { student: true; plan: true } } };
  }>[];
};

export function AttendanceSection({
  templateId,
  dateKey,
  roster,
  isCancelled,
  cancellationCredits,
}: AttendanceSectionProps) {
  const [rows, setRows] = React.useState<AttendanceRowState[]>(() => buildRows(roster));
  const [saving, startSaving] = React.useTransition();

  React.useEffect(() => {
    setRows(buildRows(roster));
  }, [roster]);

  const hasDate = Boolean(dateKey);
  const hasRoster = hasDate && rows.length > 0;
  const dirtyRows = rows.filter((row) => row.status !== row.initialStatus);
  const hasChanges = dirtyRows.length > 0;
  const creditsCount = cancellationCredits?.length ?? 0;
  const makeupSpotsAvailable = roster?.makeupSpotsAvailable ?? 0;

  const handleStatusChange = (studentId: string, status: AttendanceRowState["status"]) => {
    setRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, status } : row))
    );
  };

  const handleSave = () => {
    if (!dateKey) {
      toast.error("Select an occurrence date first.");
      return;
    }
    if (!hasChanges) {
      toast("No changes to save.");
      return;
    }

    const payload: AttendanceChangeDTO[] = dirtyRows.map((row) => ({
      studentId: row.studentId,
      status: row.status,
      note: row.note,
    }));

    startSaving(() => {
      void runMutationWithToast(
        () =>
          saveAttendance({
            templateId,
            dateKey,
            changes: payload,
          }),
        {
          pending: { title: "Saving attendance..." },
          success: { title: "Attendance saved." },
          error: (message) => ({
            title: "Unable to save attendance",
            description: message,
          }),
          onSuccess: (saved) => {
            const savedMap = new Map(saved.map((entry) => [entry.studentId, entry]));
            setRows((prev) =>
              prev.map((row) => {
                const next = savedMap.get(row.studentId);
                const status = next?.status ?? null;
                const note = next?.note ?? null;
                return { ...row, status, note, initialStatus: status };
              })
            );
          },
        }
      );
    });
  };

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Attendance</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mark attendance for scheduled students and makeup attendees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={makeupSpotsAvailable > 0 ? "secondary" : "outline"} className="text-xs">
            Makeup spots: {makeupSpotsAvailable}
          </Badge>
          {hasChanges ? (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          ) : null}
          <Button onClick={handleSave} disabled={saving || !hasRoster || isCancelled}>
            {saving ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCancelled ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            This occurrence is cancelled. Attendance is locked.
            {creditsCount ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {creditsCount} student{creditsCount === 1 ? "" : "s"} credited for this cancellation.
              </div>
            ) : null}
          </div>
        ) : null}
        {!hasDate ? (
          <p className="text-sm text-muted-foreground">Select an occurrence date to view attendance.</p>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground">No active enrolments for this date.</p>
        ) : (
          <AttendanceTable rows={rows} onStatusChange={handleStatusChange} disabled={saving || isCancelled} />
        )}

      </CardContent>
    </Card>
  );
}

function buildRows(roster: ClassOccurrenceRoster | null): AttendanceRowState[] {
  if (!roster) return [];

  const attendanceByStudent = new Map(
    roster.attendance.map((entry) => [
      entry.studentId,
      {
        status: entry.status,
        note: entry.note ?? null,
        excusedReason: entry.excusedReason ?? null,
        sourceAwayPeriodId: entry.sourceAwayPeriodId ?? null,
      },
    ])
  );
  const scheduledStudentIds = new Set(roster.enrolments.map((enrolment) => enrolment.studentId));
  const awayStudentIds = new Set(roster.awayStudentIds);
  const makeupCreditStudentIds = new Set(roster.makeupCreditStudentIds);

  const scheduledRows = roster.enrolments
    .map((enrolment) => {
      const current = attendanceByStudent.get(enrolment.studentId);
      const status = current?.status ?? null;
      const note = current?.note ?? null;
      const excusedReason = current?.excusedReason ?? null;
      const awayAutoExcused =
        awayStudentIds.has(enrolment.studentId) ||
        excusedReason === "AWAY_PERIOD" ||
        Boolean(current?.sourceAwayPeriodId);
      return {
        studentId: enrolment.student.id,
        studentName: enrolment.student.name ?? "Unnamed student",
        planName: enrolment.plan?.name ?? null,
        rowKind: "SCHEDULED" as const,
        status,
        initialStatus: status,
        excusedReason,
        awayAutoExcused,
        hasSessionMakeupCredit: makeupCreditStudentIds.has(enrolment.student.id),
        note,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  const makeupRows = roster.makeupBookings
    .filter((booking) => !scheduledStudentIds.has(booking.studentId))
    .map((booking) => {
      const current = attendanceByStudent.get(booking.studentId);
      const status = current?.status ?? null;
      const note = current?.note ?? null;
      return {
        studentId: booking.student.id,
        studentName: booking.student.name ?? "Unnamed student",
        planName: "Makeup",
        rowKind: "MAKEUP" as const,
        status,
        initialStatus: status,
        excusedReason: current?.excusedReason ?? null,
        awayAutoExcused: false,
        hasSessionMakeupCredit: false,
        note,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  return [...scheduledRows, ...makeupRows];
}
