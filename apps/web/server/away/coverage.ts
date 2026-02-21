import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

type StudentScope = {
  studentId: string;
  familyId: string;
};

export type AwayCoverageMatch = {
  id: string;
  familyId: string;
  studentId: string | null;
  startDate: Date;
  endDate: Date;
};

function compareAwayPeriodsForStudent(studentId: string, a: AwayCoverageMatch, b: AwayCoverageMatch) {
  const aSpecific = a.studentId === studentId ? 1 : 0;
  const bSpecific = b.studentId === studentId ? 1 : 0;
  if (aSpecific !== bSpecific) return bSpecific - aSpecific;

  const aStart = a.startDate.getTime();
  const bStart = b.startDate.getTime();
  if (aStart !== bStart) return bStart - aStart;

  return b.endDate.getTime() - a.endDate.getTime();
}

export async function getAwayCoverageForStudentsOnDate(
  params: {
    students: StudentScope[];
    date: Date;
    client?: PrismaClientLike;
  }
) {
  if (params.students.length === 0) {
    return new Map<string, AwayCoverageMatch>();
  }

  const tx = params.client ?? prisma;
  const date = brisbaneStartOfDay(params.date);

  const familyIds = Array.from(new Set(params.students.map((student) => student.familyId)));
  const studentIds = Array.from(new Set(params.students.map((student) => student.studentId)));

  const awayPeriods = await tx.awayPeriod.findMany({
    where: {
      deletedAt: null,
      familyId: { in: familyIds },
      startDate: { lte: date },
      endDate: { gte: date },
      OR: [{ studentId: null }, { studentId: { in: studentIds } }],
    },
    select: {
      id: true,
      familyId: true,
      studentId: true,
      startDate: true,
      endDate: true,
    },
  });

  const byFamily = new Map<string, AwayCoverageMatch[]>();
  awayPeriods.forEach((awayPeriod) => {
    const existing = byFamily.get(awayPeriod.familyId) ?? [];
    existing.push(awayPeriod);
    byFamily.set(awayPeriod.familyId, existing);
  });

  const result = new Map<string, AwayCoverageMatch>();

  params.students.forEach((student) => {
    const familyMatches = byFamily.get(student.familyId) ?? [];
    const matching = familyMatches.filter(
      (awayPeriod) => awayPeriod.studentId === null || awayPeriod.studentId === student.studentId
    );
    if (!matching.length) return;

    matching.sort((a, b) => compareAwayPeriodsForStudent(student.studentId, a, b));
    result.set(student.studentId, matching[0]);
  });

  return result;
}

export async function getAwayCoverageForStudentOnDate(
  params: {
    familyId: string;
    studentId: string;
    date: Date;
    client?: PrismaClientLike;
  }
) {
  const matches = await getAwayCoverageForStudentsOnDate({
    students: [{ familyId: params.familyId, studentId: params.studentId }],
    date: params.date,
    client: params.client,
  });
  return matches.get(params.studentId) ?? null;
}
