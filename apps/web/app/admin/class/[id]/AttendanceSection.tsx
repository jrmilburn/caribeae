"use client";

import * as React from "react";
import { AttendanceStatus, type Prisma } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAttendance } from "@/server/attendance/saveAttendance";
import type { AttendanceEntryDTO } from "./types";

type AttendanceSectionProps = {
  templateId: string;
  dateKey: string | null;
  enrolments: Prisma.EnrolmentGetPayload<{ include: { student: true; plan: true } }>[];
  initialAttendance: Prisma.AttendanceGetPayload<{ include: { student: true } }>[];
};

type AttendanceRow = {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  note: string | null;
};

const STATUS_OPTIONS: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
];

export function AttendanceSection({
  templateId,
  dateKey,
  enrolments,
  initialAttendance,
}: AttendanceSectionProps) {
  const [rows, setRows] = React.useState<AttendanceRow[]>(() =>
    buildRows(enrolments, initialAttendance)
  );
  const [saving, startSaving] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(buildRows(enrolments, initialAttendance));
  }, [enrolments, initialAttendance]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, status } : row))
    );
    setMessage(null);
    setError(null);
  };

  const handleSave = () => {
    if (!dateKey) {
      setError("Select an occurrence date first.");
      return;
    }
    setMessage(null);
    setError(null);

    const payload: AttendanceEntryDTO[] = rows.map((row) => ({
      studentId: row.studentId,
      status: row.status,
      note: row.note,
    }));

    startSaving(() => {
      (async () => {
        try {
          const saved = await saveAttendance({
            templateId,
            dateKey,
            entries: payload,
          });

          const savedMap = new Map(saved.map((entry) => [entry.studentId, entry]));
          setRows((prev) =>
            prev.map((row) => {
              const next = savedMap.get(row.studentId);
              return next ? { ...row, status: next.status, note: next.note } : row;
            })
          );
          setMessage("Attendance saved.");
        } catch (e) {
          if (e instanceof Error) {
            setError(e.message);
          } else {
            setError("Unable to save attendance.");
          }
        }
      })();
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Attendance</CardTitle>
          <p className="text-xs text-muted-foreground">Mark attendance for the selected date.</p>
        </div>
        <Button onClick={handleSave} disabled={saving || !dateKey || !rows.length}>
          {saving ? "Saving…" : "Save attendance"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">No active enrolments for this date.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="font-medium">{row.studentName}</TableCell>
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={(value) => handleStatusChange(row.studentId, value as AttendanceStatus)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {statusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {message ? <p className="text-sm text-foreground">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function buildRows(
  enrolments: Prisma.EnrolmentGetPayload<{ include: { student: true; plan: true } }>[],
  attendance: Prisma.AttendanceGetPayload<{ include: { student: true } }>[]
): AttendanceRow[] {
  const attendanceByStudent = new Map(
    attendance.map((entry) => [entry.studentId, { status: entry.status, note: entry.note ?? null }])
  );

  return enrolments
    .map((enrolment) => {
      const current = attendanceByStudent.get(enrolment.studentId);
      return {
        studentId: enrolment.student.id,
        studentName: enrolment.student.name ?? "Unnamed student",
        status: current?.status ?? AttendanceStatus.PRESENT,
        note: current?.note ?? null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function statusLabel(status: AttendanceStatus) {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return "Present";
    case AttendanceStatus.ABSENT:
      return "Absent";
    case AttendanceStatus.LATE:
      return "Late";
    case AttendanceStatus.EXCUSED:
      return "Excused";
    default:
      return status;
  }
}
