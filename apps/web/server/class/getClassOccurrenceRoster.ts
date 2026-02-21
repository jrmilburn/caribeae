import { AttendanceStatus, MakeupCreditStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import type { ClassOccurrenceRoster } from "@/app/admin/(protected)/class/[id]/types";
import { syncAwayExcusedAttendanceForOccurrence } from "@/server/attendance/syncAwayExcusedAttendance";
import { calculateMakeupSessionAvailability } from "@/server/makeup/availability";
import { getEligibleEnrolmentsForOccurrence } from "@/server/class/eligibleEnrolments";

type ContextOptions = { skipAuth?: boolean; includeAttendance?: boolean };

export async function getClassOccurrenceRoster(
  templateId: string,
  dateKey: string,
  options?: ContextOptions
): Promise<ClassOccurrenceRoster> {
  const { date, template } = await resolveContext(templateId, dateKey, options);

  const enrolments = await getEligibleEnrolmentsForOccurrence(template.id, template.levelId, date);

  if (options?.includeAttendance === false) {
    return {
      enrolments,
      attendance: [],
      awayStudentIds: [],
      makeupBookings: [],
      makeupCreditStudentIds: [],
      makeupSpotsAvailable: 0,
    };
  }

  const awayStudentIds = await syncAwayExcusedAttendanceForOccurrence({
    templateId,
    date,
    students: enrolments.map((enrolment) => ({
      studentId: enrolment.studentId,
      familyId: enrolment.student.familyId,
    })),
  });

  const [attendance, makeupBookings, makeupCredits] = await Promise.all([
    prisma.attendance.findMany({
      where: { templateId, date },
      include: { student: true },
      orderBy: [{ student: { name: "asc" } }],
    }),
    prisma.makeupBooking.findMany({
      where: {
        targetClassId: templateId,
        targetSessionDate: date,
        status: "BOOKED",
      },
      include: {
        student: true,
        makeupCredit: {
          select: {
            id: true,
            reason: true,
            status: true,
          },
        },
      },
      orderBy: [{ student: { name: "asc" } }],
    }),
    prisma.makeupCredit.findMany({
      where: {
        earnedFromClassId: templateId,
        earnedFromSessionDate: date,
        status: { not: MakeupCreditStatus.CANCELLED },
      },
      select: {
        studentId: true,
      },
    }),
  ]);

  const scheduledStudentIds = new Set(enrolments.map((enrolment) => enrolment.studentId));
  const excusedScheduledCount = attendance.reduce((count, entry) => {
    if (!scheduledStudentIds.has(entry.studentId)) return count;
    if (entry.status !== AttendanceStatus.EXCUSED) return count;
    return count + 1;
  }, 0);

  const capacity = template.capacity ?? template.level?.defaultCapacity ?? enrolments.length;
  const makeupSpotsAvailable = Math.max(
    0,
    calculateMakeupSessionAvailability({
      capacity,
      scheduledCount: enrolments.length,
      excusedScheduledCount,
      bookedMakeupsCount: makeupBookings.length,
    })
  );

  return {
    enrolments,
    attendance,
    awayStudentIds: Array.from(awayStudentIds),
    makeupBookings,
    makeupCreditStudentIds: Array.from(new Set(makeupCredits.map((credit) => credit.studentId))),
    makeupSpotsAvailable,
  };
}

export async function getEligibleStudentsForOccurrence(
  templateId: string,
  dateKey: string,
  options?: ContextOptions
) {
  const { date, template } = await resolveContext(templateId, dateKey, options);
  const enrolments = await getEligibleEnrolmentsForOccurrence(template.id, template.levelId, date);
  return new Set(enrolments.map((e) => e.studentId));
}

async function resolveContext(templateId: string, dateKey: string, options?: ContextOptions) {
  if (!options?.skipAuth) {
    await getOrCreateUser();
    await requireAdmin();
  }

  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date");
  }

  const template = await prisma.classTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, levelId: true, capacity: true, level: { select: { defaultCapacity: true } } },
  });

  if (!template) {
    throw new Error("Class template not found");
  }

  return { date, template };
}

export {
  filterEligibleEnrolmentsForOccurrence,
  getEligibleEnrolmentsForOccurrence,
  type EligibleEnrolmentCandidate,
} from "@/server/class/eligibleEnrolments";
