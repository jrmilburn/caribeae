"use server";

import { revalidatePath } from "next/cache";
import { isAfter } from "date-fns";
import { MakeupBookingStatus, MakeupCreditStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getEligibleEnrolmentsForOccurrence } from "@/server/class/getClassOccurrenceRoster";
import { toBrisbaneDayKey, brisbaneCompare, brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { getAwayCoverageForStudentOnDate } from "@/server/away/coverage";
import { getTemplateOccurrences } from "@/server/classTemplate/getTemplateOccurrences";
import { holidayAppliesToTemplate, holidayRangeIncludesDayKey } from "@/server/holiday/holidayUtils";
import { computeMakeupAvailabilitiesForOccurrences, makeupSessionKey } from "@/server/makeup/availability";
import { MAKEUP_NOTICE_CUTOFF_HOURS } from "@/server/makeup/constants";
import { expireMakeupCredits } from "@/server/makeup/getFamilyMakeups";
import { getTemplateSessionState, isPastNoticeCutoff } from "@/server/makeup/sessionRules";

const grantMakeupCreditSchema = z.object({
  familyId: z.string().min(1),
  studentId: z.string().min(1),
  classId: z.string().min(1),
  sessionDate: z.string().min(1),
  reason: z.enum(["SICK", "OTHER"]),
  notes: z.string().max(500).optional().nullable(),
  allowLateOverride: z.boolean().optional(),
});

const listMakeupSessionsSchema = z.object({
  makeupCreditId: z.string().min(1),
});

const bookMakeupSessionSchema = z.object({
  makeupCreditId: z.string().min(1),
  targetClassId: z.string().min(1),
  targetSessionDate: z.string().min(1),
});

const cancelMakeupBookingSchema = z.object({
  makeupBookingId: z.string().min(1),
  allowPastOverride: z.boolean().optional(),
});

function normalizeDay(value: string | Date) {
  return brisbaneStartOfDay(value);
}

function dayKey(value: Date | string) {
  return toBrisbaneDayKey(value);
}

function dayKeyIsAfter(a: Date | string, b: Date | string) {
  return brisbaneCompare(dayKey(a), dayKey(b)) > 0;
}

function dayKeyIsBefore(a: Date | string, b: Date | string) {
  return brisbaneCompare(dayKey(a), dayKey(b)) < 0;
}

function revalidateMakeupPaths(familyId: string, classId?: string | null) {
  revalidatePath(`/admin/family/${familyId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/makeups");
  if (classId) {
    revalidatePath(`/admin/class/${classId}`);
  }
}

export async function grantMakeupCredit(input: z.input<typeof grantMakeupCreditSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const parsed = grantMakeupCreditSchema.parse(input);
  const sessionDate = normalizeDay(parsed.sessionDate);

  const result = await prisma.$transaction(
    async (tx) => {
      await expireMakeupCredits({ client: tx });

      const student = await tx.student.findUnique({
        where: { id: parsed.studentId },
        select: { id: true, name: true, familyId: true, levelId: true },
      });

      if (!student || student.familyId !== parsed.familyId) {
        throw new Error("Student not found for this family.");
      }

      const sessionState = await getTemplateSessionState({
        templateId: parsed.classId,
        sessionDate,
        client: tx,
      });

      if (!sessionState.template.active || !sessionState.isDayMatch || !sessionState.isWithinTemplateRange) {
        throw new Error("The selected class does not run on that date.");
      }
      if (sessionState.isHoliday || sessionState.isCancelled) {
        throw new Error("The selected class session is not running on that date.");
      }

      if (
        isPastNoticeCutoff({
          sessionStart: sessionState.sessionStart,
          now: new Date(),
          cutoffHours: MAKEUP_NOTICE_CUTOFF_HOURS,
        }) &&
        !parsed.allowLateOverride
      ) {
        throw new Error(
          `Notice period has passed (${MAKEUP_NOTICE_CUTOFF_HOURS}h cutoff). Enable override to continue.`
        );
      }

      const awayCoverage = await getAwayCoverageForStudentOnDate({
        familyId: parsed.familyId,
        studentId: parsed.studentId,
        date: sessionDate,
        client: tx,
      });
      if (awayCoverage) {
        throw new Error("Already compensated via paid-through extension.");
      }

      const existingCredit = await tx.makeupCredit.findFirst({
        where: {
          studentId: parsed.studentId,
          earnedFromClassId: parsed.classId,
          earnedFromSessionDate: sessionDate,
          status: { not: MakeupCreditStatus.CANCELLED },
        },
        select: { id: true },
      });
      if (existingCredit) {
        throw new Error("A makeup credit already exists for this missed session.");
      }

      const roster = await getEligibleEnrolmentsForOccurrence(
        sessionState.template.id,
        sessionState.template.levelId,
        sessionDate,
        { client: tx }
      );

      const enrolment = roster.find((candidate) => candidate.studentId === parsed.studentId) ?? null;
      if (!enrolment) {
        throw new Error("Student is not scheduled for that session date.");
      }

      const expiresAt = enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed;
      if (!expiresAt) {
        throw new Error("Unable to issue credit because enrolment coverage end is not set.");
      }

      await tx.attendance.upsert({
        where: {
          templateId_date_studentId: {
            templateId: sessionState.template.id,
            date: sessionDate,
            studentId: parsed.studentId,
          },
        },
        update: {
          status: "EXCUSED",
          excusedReason: parsed.reason,
          sourceAwayPeriodId: null,
          note: parsed.notes?.trim() || null,
        },
        create: {
          templateId: sessionState.template.id,
          date: sessionDate,
          studentId: parsed.studentId,
          status: "EXCUSED",
          excusedReason: parsed.reason,
          sourceAwayPeriodId: null,
          note: parsed.notes?.trim() || null,
        },
      });

      const credit = await tx.makeupCredit.create({
        data: {
          familyId: parsed.familyId,
          studentId: parsed.studentId,
          earnedFromClassId: sessionState.template.id,
          earnedFromSessionDate: sessionDate,
          reason: parsed.reason,
          issuedAt: new Date(),
          expiresAt,
          status: dayKeyIsBefore(expiresAt, new Date())
            ? MakeupCreditStatus.EXPIRED
            : MakeupCreditStatus.AVAILABLE,
          notes: parsed.notes?.trim() || null,
          createdByUserId: user.id,
          levelId: sessionState.template.levelId ?? student.levelId ?? null,
        },
      });

      return {
        creditId: credit.id,
        familyId: parsed.familyId,
        classId: sessionState.template.id,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  revalidateMakeupPaths(result.familyId, result.classId);
  return result;
}

export async function listAvailableMakeupSessionsForCredit(
  input: z.input<typeof listMakeupSessionsSchema>
) {
  const access = await getFamilyForCurrentUser();
  if (access.status !== "OK") {
    throw new Error("Unauthorized");
  }

  const parsed = listMakeupSessionsSchema.parse(input);

  await expireMakeupCredits();

  const credit = await prisma.makeupCredit.findUnique({
    where: { id: parsed.makeupCreditId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          levelId: true,
        },
      },
    },
  });

  if (!credit || credit.familyId !== access.family.id) {
    throw new Error("Makeup credit not found.");
  }
  if (credit.status !== MakeupCreditStatus.AVAILABLE) {
    throw new Error("This makeup credit is not available.");
  }

  const levelId = credit.levelId ?? credit.student.levelId;
  if (!levelId) {
    throw new Error("Student level is required to book a makeup.");
  }

  const today = normalizeDay(new Date());
  const expiresAtDay = normalizeDay(credit.expiresAt);
  if (dayKeyIsBefore(expiresAtDay, today)) {
    return [];
  }

  const occurrences = await getTemplateOccurrences({
    from: today,
    to: expiresAtDay,
    levelId,
  });

  const templateIds = Array.from(new Set(occurrences.map((occurrence) => occurrence.templateId)));

  const [holidays, existingBookings, availabilityMap] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        startDate: { lte: expiresAtDay },
        endDate: { gte: today },
        OR: [{ levelId: null, templateId: null }, { levelId }, { templateId: { in: templateIds } }],
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        levelId: true,
        templateId: true,
      },
    }),
    prisma.makeupBooking.findMany({
      where: {
        studentId: credit.studentId,
        status: MakeupBookingStatus.BOOKED,
        targetSessionDate: { gte: today, lte: expiresAtDay },
      },
      select: {
        targetClassId: true,
        targetSessionDate: true,
      },
    }),
    computeMakeupAvailabilitiesForOccurrences({
      occurrences: occurrences.map((occurrence) => ({
        templateId: occurrence.templateId,
        levelId: occurrence.levelId ?? null,
        sessionDate: normalizeDay(occurrence.startTime),
        capacity: occurrence.capacity ?? null,
      })),
    }),
  ]);

  const existingBookingKeys = new Set(
    existingBookings.map((booking) => makeupSessionKey(booking.targetClassId, booking.targetSessionDate))
  );

  return occurrences
    .filter((occurrence) => !occurrence.cancelled)
    .filter((occurrence) => {
      const dateKey = dayKey(occurrence.startTime);
      return !holidays.some(
        (holiday) =>
          holidayAppliesToTemplate(holiday, {
            id: occurrence.templateId,
            levelId: occurrence.levelId,
          }) && holidayRangeIncludesDayKey(holiday, dateKey)
      );
    })
    .filter((occurrence) => {
      if (isAfter(new Date(), occurrence.startTime)) return false;
      if (dayKeyIsAfter(occurrence.startTime, credit.expiresAt)) return false;
      if (existingBookingKeys.has(makeupSessionKey(occurrence.templateId, occurrence.startTime))) return false;

      const availability = availabilityMap.get(makeupSessionKey(occurrence.templateId, occurrence.startTime));
      if (!availability) return false;
      if (availability.available <= 0) return false;
      if (availability.scheduledStudentIds.includes(credit.studentId)) return false;

      return true;
    })
    .map((occurrence) => {
      const availability = availabilityMap.get(makeupSessionKey(occurrence.templateId, occurrence.startTime));
      return {
        classId: occurrence.templateId,
        className: occurrence.templateName ?? occurrence.level?.name ?? "Class",
        levelId: occurrence.levelId ?? null,
        levelName: occurrence.level?.name ?? null,
        sessionDate: normalizeDay(occurrence.startTime),
        sessionDateKey: dayKey(occurrence.startTime),
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        spotsAvailable: Math.max(0, availability?.available ?? 0),
      };
    })
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export async function bookMakeupSession(input: z.input<typeof bookMakeupSessionSchema>) {
  const access = await getFamilyForCurrentUser();
  if (access.status !== "OK") {
    throw new Error("Unauthorized");
  }

  const parsed = bookMakeupSessionSchema.parse(input);
  const targetSessionDate = normalizeDay(parsed.targetSessionDate);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await expireMakeupCredits({ client: tx });

        const credit = await tx.makeupCredit.findUnique({
          where: { id: parsed.makeupCreditId },
          include: {
            student: {
              select: {
                id: true,
                levelId: true,
              },
            },
          },
        });

        if (!credit || credit.familyId !== access.family.id) {
          throw new Error("Makeup credit not found.");
        }
        if (credit.status !== MakeupCreditStatus.AVAILABLE) {
          throw new Error("This makeup credit is no longer available.");
        }

        if (dayKeyIsAfter(targetSessionDate, credit.expiresAt)) {
          throw new Error("This makeup credit has expired for the selected session.");
        }

        const sessionState = await getTemplateSessionState({
          templateId: parsed.targetClassId,
          sessionDate: targetSessionDate,
          client: tx,
        });

        if (!sessionState.template.active || !sessionState.isDayMatch || !sessionState.isWithinTemplateRange) {
          throw new Error("The selected class does not run on that date.");
        }
        if (sessionState.isHoliday || sessionState.isCancelled) {
          throw new Error("The selected class session is not running on that date.");
        }
        if (sessionState.sessionStart && isAfter(new Date(), sessionState.sessionStart)) {
          throw new Error("This class session has already started.");
        }

        const requiredLevelId = credit.levelId ?? credit.student.levelId;
        if (!requiredLevelId) {
          throw new Error("Student level is required to book this makeup.");
        }
        if (sessionState.template.levelId !== requiredLevelId) {
          throw new Error("Makeups must be booked into a class at the same level.");
        }

        const availability = await computeMakeupAvailabilitiesForOccurrences({
          client: tx,
          occurrences: [
            {
              templateId: sessionState.template.id,
              levelId: sessionState.template.levelId,
              sessionDate: targetSessionDate,
              capacity: sessionState.template.capacity ?? sessionState.template.level?.defaultCapacity ?? null,
            },
          ],
        });

        const key = makeupSessionKey(sessionState.template.id, targetSessionDate);
        const sessionAvailability = availability.get(key);
        if (!sessionAvailability || sessionAvailability.available <= 0) {
          throw new Error("No makeup spots are available for that session.");
        }
        if (sessionAvailability.scheduledStudentIds.includes(credit.studentId)) {
          throw new Error("Student is already scheduled in that class session.");
        }

        const existingBooking = await tx.makeupBooking.findFirst({
          where: {
            targetClassId: sessionState.template.id,
            targetSessionDate,
            studentId: credit.studentId,
            status: MakeupBookingStatus.BOOKED,
          },
          select: { id: true },
        });
        if (existingBooking) {
          throw new Error("Student already has a makeup booking for that session.");
        }

        await tx.makeupBooking.create({
          data: {
            makeupCreditId: credit.id,
            studentId: credit.studentId,
            familyId: credit.familyId,
            targetClassId: sessionState.template.id,
            targetSessionDate,
            status: MakeupBookingStatus.BOOKED,
          },
        });

        await tx.makeupCredit.update({
          where: { id: credit.id },
          data: { status: MakeupCreditStatus.USED },
        });

        return {
          familyId: credit.familyId,
          classId: sessionState.template.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    revalidateMakeupPaths(result.familyId, result.classId);
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("That makeup spot was just taken. Please refresh and choose another session.");
    }
    throw error;
  }
}

async function cancelMakeupBookingInternal(params: {
  makeupBookingId: string;
  actorFamilyId: string | null;
  isAdmin: boolean;
  allowPastOverride: boolean;
}) {
  const result = await prisma.$transaction(
    async (tx) => {
      await expireMakeupCredits({ client: tx });

      const booking = await tx.makeupBooking.findUnique({
        where: { id: params.makeupBookingId },
        include: {
          makeupCredit: true,
        },
      });

      if (!booking) {
        throw new Error("Makeup booking not found.");
      }

      if (!params.isAdmin && booking.familyId !== params.actorFamilyId) {
        throw new Error("Unauthorized");
      }

      if (booking.status === MakeupBookingStatus.CANCELLED) {
        return {
          familyId: booking.familyId,
          classId: booking.targetClassId,
        };
      }

      const today = normalizeDay(new Date());
      const sessionDate = normalizeDay(booking.targetSessionDate);
      const isPastSession = dayKeyIsBefore(sessionDate, today);

      if (isPastSession && !params.allowPastOverride) {
        throw new Error("Past makeup sessions cannot be cancelled.");
      }

      await tx.makeupBooking.update({
        where: { id: booking.id },
        data: { status: MakeupBookingStatus.CANCELLED },
      });

      if (!isPastSession) {
        const nextStatus = dayKeyIsBefore(booking.makeupCredit.expiresAt, today)
          ? MakeupCreditStatus.EXPIRED
          : MakeupCreditStatus.AVAILABLE;

        await tx.makeupCredit.update({
          where: { id: booking.makeupCreditId },
          data: {
            status: nextStatus,
          },
        });
      }

      return {
        familyId: booking.familyId,
        classId: booking.targetClassId,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  revalidateMakeupPaths(result.familyId, result.classId);
  return result;
}

export async function cancelMakeupBookingAsFamily(input: z.input<typeof cancelMakeupBookingSchema>) {
  const access = await getFamilyForCurrentUser();
  if (access.status !== "OK") {
    throw new Error("Unauthorized");
  }

  const parsed = cancelMakeupBookingSchema.parse(input);

  return cancelMakeupBookingInternal({
    makeupBookingId: parsed.makeupBookingId,
    actorFamilyId: access.family.id,
    isAdmin: false,
    allowPastOverride: false,
  });
}

export async function cancelMakeupBookingAsAdmin(input: z.input<typeof cancelMakeupBookingSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const parsed = cancelMakeupBookingSchema.parse(input);

  return cancelMakeupBookingInternal({
    makeupBookingId: parsed.makeupBookingId,
    actorFamilyId: null,
    isAdmin: true,
    allowPastOverride: Boolean(parsed.allowPastOverride),
  });
}
