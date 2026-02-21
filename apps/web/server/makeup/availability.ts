import { AttendanceStatus, EnrolmentStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import type { EligibleEnrolmentCandidate } from "@/server/class/eligibleEnrolments";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

export type SessionAvailabilityInput = {
  capacity: number;
  scheduledCount: number;
  excusedScheduledCount: number;
  bookedMakeupsCount: number;
};

export type SessionAvailability = SessionAvailabilityInput & {
  available: number;
  scheduledStudentIds: string[];
};

export type SessionOccurrence = {
  templateId: string;
  levelId: string | null;
  sessionDate: Date;
  capacity: number | null;
};

export function calculateMakeupSessionAvailability(input: SessionAvailabilityInput) {
  return input.capacity - (input.scheduledCount - input.excusedScheduledCount) - input.bookedMakeupsCount;
}

export function makeupSessionKey(templateId: string, sessionDate: Date) {
  return `${templateId}:${toBrisbaneDayKey(sessionDate)}`;
}

function uniqueOccurrences(occurrences: SessionOccurrence[]) {
  const map = new Map<string, SessionOccurrence>();
  occurrences.forEach((occurrence) => {
    map.set(makeupSessionKey(occurrence.templateId, occurrence.sessionDate), {
      ...occurrence,
      sessionDate: brisbaneStartOfDay(occurrence.sessionDate),
    });
  });
  return Array.from(map.values());
}

export async function computeMakeupAvailabilitiesForOccurrences(
  params: {
    occurrences: SessionOccurrence[];
    client?: PrismaClientLike;
  }
) {
  const { filterEligibleEnrolmentsForOccurrence } = await import(
    "@/server/class/eligibleEnrolments"
  );
  const tx = params.client ?? prisma;
  const occurrences = uniqueOccurrences(params.occurrences);
  const result = new Map<string, SessionAvailability>();

  if (!occurrences.length) return result;

  const templateIds = Array.from(new Set(occurrences.map((occurrence) => occurrence.templateId)));
  const rangeStart = occurrences.reduce(
    (earliest, occurrence) => (occurrence.sessionDate < earliest ? occurrence.sessionDate : earliest),
    occurrences[0].sessionDate
  );
  const rangeEnd = occurrences.reduce(
    (latest, occurrence) => (occurrence.sessionDate > latest ? occurrence.sessionDate : latest),
    occurrences[0].sessionDate
  );

  const [candidates, excusedAttendanceRows, bookedMakeups] = await Promise.all([
    tx.enrolment.findMany({
      where: {
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.CHANGEOVER] },
        startDate: { lte: rangeEnd },
        OR: [{ endDate: null }, { endDate: { gte: rangeStart } }],
        AND: [
          {
            OR: [
              { templateId: { in: templateIds } },
              { classAssignments: { some: { templateId: { in: templateIds } } } },
            ],
          },
        ],
      },
      include: {
        student: true,
        plan: true,
        template: true,
        classAssignments: {
          include: {
            template: true,
          },
        },
      },
      orderBy: [{ student: { name: "asc" } }],
    }),
    tx.attendance.findMany({
      where: {
        templateId: { in: templateIds },
        date: { gte: rangeStart, lte: rangeEnd },
        status: AttendanceStatus.EXCUSED,
      },
      select: {
        templateId: true,
        date: true,
        studentId: true,
      },
    }),
    tx.makeupBooking.groupBy({
      by: ["targetClassId", "targetSessionDate"],
      where: {
        targetClassId: { in: templateIds },
        targetSessionDate: { gte: rangeStart, lte: rangeEnd },
        status: "BOOKED",
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const candidateFamilyIds = Array.from(
    new Set(candidates.map((candidate) => candidate.student.familyId).filter(Boolean))
  );
  const candidateStudentIds = Array.from(
    new Set(candidates.map((candidate) => candidate.studentId).filter(Boolean))
  );

  const awayPeriods = candidateFamilyIds.length
    ? await tx.awayPeriod.findMany({
        where: {
          deletedAt: null,
          familyId: { in: candidateFamilyIds },
          startDate: { lte: rangeEnd },
          endDate: { gte: rangeStart },
          OR: [{ studentId: null }, { studentId: { in: candidateStudentIds } }],
        },
        select: {
          familyId: true,
          studentId: true,
          startDate: true,
          endDate: true,
        },
      })
    : [];

  const awayByFamily = new Map<
    string,
    Array<{ studentId: string | null; startDate: Date; endDate: Date }>
  >();
  awayPeriods.forEach((awayPeriod) => {
    const existing = awayByFamily.get(awayPeriod.familyId) ?? [];
    existing.push(awayPeriod);
    awayByFamily.set(awayPeriod.familyId, existing);
  });

  const excusedBySession = new Map<string, Set<string>>();
  excusedAttendanceRows.forEach((row) => {
    const key = makeupSessionKey(row.templateId, row.date);
    const existing = excusedBySession.get(key) ?? new Set<string>();
    existing.add(row.studentId);
    excusedBySession.set(key, existing);
  });

  const bookedBySession = new Map<string, number>();
  bookedMakeups.forEach((booking) => {
    bookedBySession.set(
      makeupSessionKey(booking.targetClassId, booking.targetSessionDate),
      booking._count._all
    );
  });

  occurrences.forEach((occurrence) => {
    const key = makeupSessionKey(occurrence.templateId, occurrence.sessionDate);

    if (!occurrence.levelId) {
      result.set(key, {
        capacity: 0,
        scheduledCount: 0,
        excusedScheduledCount: 0,
        bookedMakeupsCount: bookedBySession.get(key) ?? 0,
        available: 0,
        scheduledStudentIds: [],
      });
      return;
    }

    const scheduled = filterEligibleEnrolmentsForOccurrence(
      candidates as EligibleEnrolmentCandidate[],
      occurrence.templateId,
      occurrence.levelId,
      occurrence.sessionDate
    );

    const scheduledStudentIds = scheduled.map((enrolment) => enrolment.studentId);
    const scheduledStudentSet = new Set(scheduledStudentIds);
    const excusedSet = new Set(excusedBySession.get(key) ?? []);

    // Away periods should free seats for makeups even before attendance has been synced.
    const sessionDay = brisbaneStartOfDay(occurrence.sessionDate).getTime();
    scheduled.forEach((enrolment) => {
      const awayCandidates = awayByFamily.get(enrolment.student.familyId) ?? [];
      const isAway = awayCandidates.some((awayPeriod) => {
        if (awayPeriod.studentId && awayPeriod.studentId !== enrolment.studentId) return false;
        const awayStart = brisbaneStartOfDay(awayPeriod.startDate).getTime();
        const awayEnd = brisbaneStartOfDay(awayPeriod.endDate).getTime();
        return awayStart <= sessionDay && awayEnd >= sessionDay;
      });
      if (isAway) {
        excusedSet.add(enrolment.studentId);
      }
    });

    let excusedScheduledCount = 0;
    scheduledStudentSet.forEach((studentId) => {
      if (excusedSet.has(studentId)) excusedScheduledCount += 1;
    });

    const scheduledCount = scheduled.length;
    const bookedMakeupsCount = bookedBySession.get(key) ?? 0;
    const resolvedCapacity = occurrence.capacity ?? scheduledCount;
    const available = calculateMakeupSessionAvailability({
      capacity: resolvedCapacity,
      scheduledCount,
      excusedScheduledCount,
      bookedMakeupsCount,
    });

    result.set(key, {
      capacity: resolvedCapacity,
      scheduledCount,
      excusedScheduledCount,
      bookedMakeupsCount,
      available,
      scheduledStudentIds,
    });
  });

  return result;
}
