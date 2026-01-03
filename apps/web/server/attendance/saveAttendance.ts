"use server";

import { AttendanceStatus, TimesheetSource, TimesheetStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import type { AttendanceChangeDTO, AttendanceEntryDTO } from "@/app/admin/class/[id]/types";
import { registerCreditConsumptionForDate } from "@/server/billing/enrolmentBilling";
import { upsertTimesheetEntryForOccurrence } from "@/server/timesheet/upsertTimesheetEntryForOccurrence";
import { getEligibleStudentsForOccurrence } from "@/server/class/getClassOccurrenceRoster";

type SaveAttendancePayload = {
  templateId: string;
  dateKey: string;
  changes: AttendanceChangeDTO[];
};

const ALLOWED_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
]);

export async function saveAttendance({
  templateId,
  dateKey,
  changes,
}: SaveAttendancePayload): Promise<AttendanceEntryDTO[]> {
  await getOrCreateUser();
  await requireAdmin();

  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date");
  }

  const uniqueChanges = dedupeChanges(changes);

  uniqueChanges.forEach((entry) => {
    if (entry.status !== null && !ALLOWED_STATUSES.has(entry.status)) {
      throw new Error("Invalid attendance status");
    }
  });

  const allowedStudents = await getEligibleStudentsForOccurrence(templateId, dateKey, {
    includeAttendance: false,
    skipAuth: true,
  });
  uniqueChanges.forEach((entry) => {
    if (!allowedStudents.has(entry.studentId)) {
      throw new Error("Student is not enrolled on this date.");
    }
  });

  if (uniqueChanges.length === 0) {
    return loadAttendance(templateId, date);
  }

  const operations = uniqueChanges.map((entry) =>
    entry.status === null
      ? prisma.attendance.deleteMany({
          where: { templateId, date, studentId: entry.studentId },
        })
      : prisma.attendance.upsert({
          where: {
            templateId_date_studentId: {
              templateId,
              date,
              studentId: entry.studentId,
            },
          },
          update: { status: entry.status, note: entry.note ?? null },
          create: {
            templateId,
            date,
            studentId: entry.studentId,
            status: entry.status,
            note: entry.note ?? null,
          },
        })
  );

  await prisma.$transaction(operations);
  await Promise.all(
    uniqueChanges.map((entry) =>
      registerCreditConsumptionForDate({ templateId, studentId: entry.studentId, date })
    )
  );

  await upsertTimesheetEntryForOccurrence({
    templateId,
    date,
    status: TimesheetStatus.CONFIRMED,
    source: TimesheetSource.ATTENDANCE,
  });

  return loadAttendance(templateId, date);
}

function dedupeChanges(entries: AttendanceChangeDTO[]): AttendanceChangeDTO[] {
  const seen = new Map<string, AttendanceChangeDTO>();
  entries.forEach((entry) => {
    if (!entry.studentId) return;
    seen.set(entry.studentId, {
      studentId: entry.studentId,
      status: entry.status,
      note: entry.note ?? null,
    });
  });
  return Array.from(seen.values());
}

async function loadAttendance(templateId: string, date: Date): Promise<AttendanceEntryDTO[]> {
  const rows = await prisma.attendance.findMany({
    where: { templateId, date },
    orderBy: [{ studentId: "asc" }],
  });

  return rows.map((row) => ({
    studentId: row.studentId,
    status: row.status,
    note: row.note ?? null,
  }));
}
