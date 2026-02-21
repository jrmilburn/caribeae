import { randomUUID } from "node:crypto";

import { AttendanceExcusedReason, AttendanceStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAwayCoverageForStudentsOnDate } from "@/server/away/coverage";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

type ScheduledStudent = {
  studentId: string;
  familyId: string;
};

export async function syncAwayExcusedAttendanceForOccurrence(
  params: {
    templateId: string;
    date: Date;
    students: ScheduledStudent[];
    client?: PrismaClientLike;
  }
) {
  if (params.students.length === 0) {
    return new Set<string>();
  }

  const tx = params.client ?? prisma;
  const date = brisbaneStartOfDay(params.date);

  const awayCoverageByStudentId = await getAwayCoverageForStudentsOnDate({
    students: params.students,
    date,
    client: tx,
  });

  const awayRows = params.students
    .map((student) => {
      const awayPeriod = awayCoverageByStudentId.get(student.studentId);
      if (!awayPeriod) return null;
      return {
        studentId: student.studentId,
        awayPeriodId: awayPeriod.id,
      };
    })
    .filter((row): row is { studentId: string; awayPeriodId: string } => Boolean(row));

  const awayStudentIds = new Set(awayRows.map((row) => row.studentId));
  const staleAwayStudentIds = params.students
    .map((student) => student.studentId)
    .filter((studentId) => !awayStudentIds.has(studentId));

  if (staleAwayStudentIds.length > 0) {
    await tx.attendance.deleteMany({
      where: {
        templateId: params.templateId,
        date,
        studentId: { in: staleAwayStudentIds },
        excusedReason: AttendanceExcusedReason.AWAY_PERIOD,
      },
    });
  }

  if (awayRows.length > 0) {
    const values = awayRows.map((row) =>
      Prisma.sql`(
        ${randomUUID()},
        ${params.templateId},
        ${date},
        ${row.studentId},
        CAST(${AttendanceStatus.EXCUSED} AS "AttendanceStatus"),
        CAST(${AttendanceExcusedReason.AWAY_PERIOD} AS "AttendanceExcusedReason"),
        ${row.awayPeriodId},
        NOW(),
        NOW()
      )`
    );

    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO "Attendance"
          ("id", "templateId", "date", "studentId", "status", "excusedReason", "sourceAwayPeriodId", "createdAt", "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("templateId", "date", "studentId")
        DO UPDATE
          SET "status" = EXCLUDED."status",
              "excusedReason" = EXCLUDED."excusedReason",
              "sourceAwayPeriodId" = EXCLUDED."sourceAwayPeriodId",
              "updatedAt" = NOW();
      `
    );
  }

  return awayStudentIds;
}
