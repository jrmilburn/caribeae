import "server-only";

import { AttendanceExcusedReason, type AttendanceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getClassOccurrenceRoster } from "@/server/class/getClassOccurrenceRoster";
import {
  assertTeacherCanManageClassForDate,
  getTodayBrisbaneDate,
  getTodayBrisbaneDayKey,
} from "@/server/teacher/authorization";
import { formatTimeRangeLabel } from "@/server/teacher/time";

export type TeacherClassStudentRow = {
  studentId: string;
  studentName: string;
  attendanceStatus: AttendanceStatus | null;
  awayLocked: boolean;
  kind: "SCHEDULED" | "MAKEUP";
  note: string | null;
};

export type TeacherClassTodayData = {
  templateId: string;
  className: string;
  levelName: string;
  timeLabel: string;
  dateKey: string;
  teacherName: string | null;
  cancelled: boolean;
  cancellationReason: string | null;
  students: TeacherClassStudentRow[];
};

export async function getTeacherClassToday(params: {
  teacherId: string;
  templateId: string;
}): Promise<TeacherClassTodayData> {
  const date = getTodayBrisbaneDate();
  const dateKey = getTodayBrisbaneDayKey();

  const classAccess = await assertTeacherCanManageClassForDate({
    teacherId: params.teacherId,
    templateId: params.templateId,
    date,
  });

  const [roster, cancellation] = await Promise.all([
    getClassOccurrenceRoster(params.templateId, dateKey, {
      skipAuth: true,
    }),
    prisma.classCancellation.findUnique({
      where: {
        templateId_date: {
          templateId: params.templateId,
          date,
        },
      },
      select: {
        id: true,
        reason: true,
      },
    }),
  ]);

  const attendanceByStudentId = new Map(
    roster.attendance.map((entry) => [
      entry.studentId,
      {
        status: entry.status,
        note: entry.note ?? null,
        excusedReason: entry.excusedReason,
        sourceAwayPeriodId: entry.sourceAwayPeriodId,
      },
    ])
  );

  const scheduledStudentIds = new Set(roster.enrolments.map((enrolment) => enrolment.studentId));
  const awayStudentIds = new Set(roster.awayStudentIds);

  const scheduledRows: TeacherClassStudentRow[] = roster.enrolments.map((enrolment) => {
    const attendance = attendanceByStudentId.get(enrolment.studentId);
    const awayLocked =
      awayStudentIds.has(enrolment.studentId) ||
      attendance?.excusedReason === AttendanceExcusedReason.AWAY_PERIOD ||
      Boolean(attendance?.sourceAwayPeriodId);

    return {
      studentId: enrolment.studentId,
      studentName: enrolment.student.name || "Unnamed student",
      attendanceStatus: attendance?.status ?? null,
      awayLocked,
      kind: "SCHEDULED",
      note: attendance?.note ?? null,
    };
  });

  const makeupRows: TeacherClassStudentRow[] = roster.makeupBookings
    .filter((booking) => !scheduledStudentIds.has(booking.studentId))
    .map((booking) => {
      const attendance = attendanceByStudentId.get(booking.studentId);
      return {
        studentId: booking.studentId,
        studentName: booking.student.name || "Unnamed student",
        attendanceStatus: attendance?.status ?? null,
        awayLocked: false,
        kind: "MAKEUP",
        note: attendance?.note ?? null,
      };
    });

  const students = [...scheduledRows, ...makeupRows].sort((a, b) =>
    a.studentName.localeCompare(b.studentName)
  );

  return {
    templateId: classAccess.template.id,
    className: classAccess.template.name?.trim() || "Untitled class",
    levelName: classAccess.template.level?.name ?? "Level",
    timeLabel: formatTimeRangeLabel({
      startTime: classAccess.template.startTime,
      endTime: classAccess.template.endTime,
      defaultLengthMin: classAccess.template.level?.defaultLengthMin,
    }),
    dateKey,
    teacherName: classAccess.effectiveTeacher?.name ?? null,
    cancelled: Boolean(cancellation),
    cancellationReason: cancellation?.reason ?? null,
    students,
  };
}
