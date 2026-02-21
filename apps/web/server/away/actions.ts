"use server";

import { revalidatePath } from "next/cache";
import { addDays, isAfter, isBefore } from "date-fns";
import { EnrolmentAdjustmentType, EnrolmentStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  adjustCreditsForManualPaidThroughDate,
  getEnrolmentBillingStatus,
} from "@/server/billing/enrolmentBilling";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import {
  applyAwayDeltaDays,
  calculateAwayDeltaDays,
  listAwayOccurrences,
  resolveSessionsPerWeek,
} from "@/server/away/awayMath";

const awayScopeSchema = z.enum(["FAMILY", "STUDENT"]);

const createAwayPeriodSchema = z.object({
  familyId: z.string().min(1),
  scope: awayScopeSchema,
  studentId: z.string().optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
});

const updateAwayPeriodSchema = createAwayPeriodSchema.extend({
  id: z.string().min(1),
});

const deleteAwayPeriodSchema = z.object({
  id: z.string().min(1),
});

type NormalizedAwayInput = {
  familyId: string;
  studentId: string | null;
  startDate: Date;
  endDate: Date;
  note: string | null;
};

const awayEnrolmentInclude = Prisma.validator<Prisma.EnrolmentInclude>()({
  plan: true,
  student: { select: { id: true, familyId: true } },
  template: true,
  classAssignments: {
    include: {
      template: true,
    },
  },
});

type AwayEnrolmentRecord = Prisma.EnrolmentGetPayload<{
  include: typeof awayEnrolmentInclude;
}>;

type AwayTemplate = {
  id: string;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
  levelId: string | null;
};

type CoverageData = {
  holidays: Array<{ startDate: Date; endDate: Date; levelId: string | null; templateId: string | null }>;
  cancellationCredits: Array<{ templateId: string; date: Date }>;
};

type ComputedAwayImpact = {
  enrolmentId: string;
  missedOccurrences: number;
  paidThroughDeltaDays: number;
};

function normalizeAwayInput(
  input: z.output<typeof createAwayPeriodSchema> | z.output<typeof updateAwayPeriodSchema>
): NormalizedAwayInput {
  const scope = input.scope;
  const studentIdRaw = input.studentId?.trim() || null;

  if (scope === "STUDENT" && !studentIdRaw) {
    throw new Error("Select a student for a student-specific away period.");
  }

  const startDate = brisbaneStartOfDay(input.startDate);
  const endDate = brisbaneStartOfDay(input.endDate);
  if (isAfter(startDate, endDate)) {
    throw new Error("End date must be on or after start date.");
  }

  return {
    familyId: input.familyId.trim(),
    studentId: scope === "STUDENT" ? studentIdRaw : null,
    startDate,
    endDate,
    note: input.note?.trim() || null,
  };
}

function maxDate(a: Date, b: Date) {
  return isAfter(a, b) ? a : b;
}

function minDate(a: Date, b: Date) {
  return isBefore(a, b) ? a : b;
}

function resolveEnrolmentTemplates(enrolment: AwayEnrolmentRecord): AwayTemplate[] {
  const rawTemplates = enrolment.classAssignments.length
    ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
    : enrolment.template
      ? [enrolment.template]
      : [];

  const map = new Map<string, AwayTemplate>();
  rawTemplates.forEach((template) => {
    map.set(template.id, {
      id: template.id,
      dayOfWeek: template.dayOfWeek ?? null,
      startDate: brisbaneStartOfDay(template.startDate),
      endDate: template.endDate ? brisbaneStartOfDay(template.endDate) : null,
      levelId: template.levelId ?? null,
    });
  });

  return Array.from(map.values());
}

async function ensureScopeReferences(
  tx: Prisma.TransactionClient,
  params: {
    familyId: string;
    studentId: string | null;
  }
) {
  const family = await tx.family.findUnique({
    where: { id: params.familyId },
    select: { id: true },
  });
  if (!family) {
    throw new Error("Family not found.");
  }

  if (!params.studentId) return;

  const student = await tx.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, familyId: true },
  });
  if (!student || student.familyId !== params.familyId) {
    throw new Error("Selected student does not belong to this family.");
  }
}

async function assertNoOverlappingAwayPeriod(
  tx: Prisma.TransactionClient,
  params: {
    familyId: string;
    studentId: string | null;
    startDate: Date;
    endDate: Date;
    excludeId?: string;
  }
) {
  const where: Prisma.AwayPeriodWhereInput = {
    familyId: params.familyId,
    deletedAt: null,
    startDate: { lte: params.endDate },
    endDate: { gte: params.startDate },
  };

  if (params.excludeId) {
    where.id = { not: params.excludeId };
  }

  if (params.studentId) {
    where.OR = [{ studentId: null }, { studentId: params.studentId }];
  }

  const overlap = await tx.awayPeriod.findFirst({
    where,
    select: { id: true, studentId: true },
  });

  if (!overlap) return;

  if (!params.studentId) {
    throw new Error("This date range overlaps an existing away period for this family.");
  }

  throw new Error("This date range overlaps an existing family away period or another away period for this student.");
}

async function findImpactedEnrolments(
  tx: Prisma.TransactionClient,
  params: {
    familyId: string;
    studentId: string | null;
    startDate: Date;
    endDate: Date;
  }
) {
  return tx.enrolment.findMany({
    where: {
      status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.CHANGEOVER] },
      planId: { not: null },
      startDate: { lte: params.endDate },
      OR: [{ endDate: null }, { endDate: { gte: params.startDate } }],
      student: {
        familyId: params.familyId,
        ...(params.studentId ? { id: params.studentId } : {}),
      },
    },
    include: awayEnrolmentInclude,
    orderBy: [{ studentId: "asc" }, { id: "asc" }],
  });
}

async function loadCoverageData(
  tx: Prisma.TransactionClient,
  params: {
    enrolmentId: string;
    templates: AwayTemplate[];
    rangeStart: Date;
    rangeEnd: Date;
  }
): Promise<CoverageData> {
  if (isAfter(params.rangeStart, params.rangeEnd)) {
    return { holidays: [], cancellationCredits: [] };
  }

  const templateIds = params.templates.map((template) => template.id);
  const levelIds = params.templates.map((template) => template.levelId).filter((id): id is string => Boolean(id));

  const [holidays, cancellationCredits] = await Promise.all([
    tx.holiday.findMany({
      where: {
        startDate: { lte: params.rangeEnd },
        endDate: { gte: params.rangeStart },
        ...buildHolidayScopeWhere({ templateIds, levelIds }),
      },
      select: {
        startDate: true,
        endDate: true,
        levelId: true,
        templateId: true,
      },
    }),
    tx.enrolmentAdjustment.findMany({
      where: {
        enrolmentId: params.enrolmentId,
        type: EnrolmentAdjustmentType.CANCELLATION_CREDIT,
        templateId: { in: templateIds },
        date: { gte: params.rangeStart, lte: params.rangeEnd },
      },
      select: {
        templateId: true,
        date: true,
      },
    }),
  ]);

  return { holidays, cancellationCredits };
}

async function computeAwayImpactForEnrolment(
  tx: Prisma.TransactionClient,
  enrolment: AwayEnrolmentRecord,
  awayStart: Date,
  awayEnd: Date
): Promise<ComputedAwayImpact | null> {
  const basePaidThrough =
    (enrolment.paidThroughDate ? brisbaneStartOfDay(enrolment.paidThroughDate) : null) ??
    (enrolment.paidThroughDateComputed ? brisbaneStartOfDay(enrolment.paidThroughDateComputed) : null);

  if (!basePaidThrough) return null;

  const templates = resolveEnrolmentTemplates(enrolment);
  if (!templates.length) return null;

  const enrolmentStart = brisbaneStartOfDay(enrolment.startDate);
  const enrolmentEnd = enrolment.endDate ? brisbaneStartOfDay(enrolment.endDate) : null;

  const rangeStart = maxDate(awayStart, enrolmentStart);
  const rangeEnd = enrolmentEnd ? minDate(awayEnd, enrolmentEnd) : awayEnd;
  if (isAfter(rangeStart, rangeEnd)) return null;

  const sessionsPerWeek = resolveSessionsPerWeek(templates);
  const extensionStart = brisbaneStartOfDay(addDays(basePaidThrough, 1));

  const coverageRangeStart = minDate(rangeStart, extensionStart);
  const coverageRangeEnd = enrolmentEnd
    ? maxDate(rangeEnd, enrolmentEnd)
    : maxDate(rangeEnd, brisbaneStartOfDay(addDays(basePaidThrough, 365)));

  const coverage = await loadCoverageData(tx, {
    enrolmentId: enrolment.id,
    templates,
    rangeStart: coverageRangeStart,
    rangeEnd: coverageRangeEnd,
  });

  const missedOccurrences = listAwayOccurrences({
    templates,
    startDate: rangeStart,
    endDate: rangeEnd,
    horizon: rangeEnd,
    sessionsPerWeek,
    coverage,
  }).length;

  if (missedOccurrences <= 0) return null;

  const paidThroughDeltaDays = calculateAwayDeltaDays({
    currentPaidThroughDate: basePaidThrough,
    missedOccurrences,
    sessionsPerWeek,
    templates,
    enrolmentEndDate: enrolmentEnd,
    coverage,
  });

  if (paidThroughDeltaDays <= 0) return null;

  return {
    enrolmentId: enrolment.id,
    missedOccurrences,
    paidThroughDeltaDays,
  };
}

async function applyPaidThroughDelta(
  tx: Prisma.TransactionClient,
  params: {
    enrolment: AwayEnrolmentRecord;
    deltaDays: number;
    actorId: string | null;
  }
) {
  const previousPaidThrough =
    (params.enrolment.paidThroughDate ? brisbaneStartOfDay(params.enrolment.paidThroughDate) : null) ??
    (params.enrolment.paidThroughDateComputed ? brisbaneStartOfDay(params.enrolment.paidThroughDateComputed) : null);

  if (!previousPaidThrough || params.deltaDays === 0) return;

  const nextPaidThrough = applyAwayDeltaDays(previousPaidThrough, params.deltaDays);

  await tx.enrolment.update({
    where: { id: params.enrolment.id },
    data: {
      paidThroughDate: nextPaidThrough,
      paidThroughDateComputed: nextPaidThrough,
    },
  });

  await adjustCreditsForManualPaidThroughDate(tx, params.enrolment, nextPaidThrough);
  await getEnrolmentBillingStatus(params.enrolment.id, { client: tx });

  await tx.enrolmentCoverageAudit.create({
    data: {
      enrolmentId: params.enrolment.id,
      reason: "PAIDTHROUGH_MANUAL_EDIT",
      previousPaidThroughDate: previousPaidThrough,
      nextPaidThroughDate: nextPaidThrough,
      actorId: params.actorId,
    },
  });
}

async function applyAwayPeriodImpacts(
  tx: Prisma.TransactionClient,
  params: {
    awayPeriodId: string;
    familyId: string;
    studentId: string | null;
    startDate: Date;
    endDate: Date;
    actorId: string | null;
  }
) {
  const enrolments = await findImpactedEnrolments(tx, {
    familyId: params.familyId,
    studentId: params.studentId,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const impacts: Array<{
    awayPeriodId: string;
    enrolmentId: string;
    missedOccurrences: number;
    paidThroughDeltaDays: number;
  }> = [];

  for (const enrolment of enrolments) {
    const impact = await computeAwayImpactForEnrolment(tx, enrolment, params.startDate, params.endDate);
    if (!impact) continue;

    await applyPaidThroughDelta(tx, {
      enrolment,
      deltaDays: impact.paidThroughDeltaDays,
      actorId: params.actorId,
    });

    impacts.push({
      awayPeriodId: params.awayPeriodId,
      enrolmentId: impact.enrolmentId,
      missedOccurrences: impact.missedOccurrences,
      paidThroughDeltaDays: impact.paidThroughDeltaDays,
    });
  }

  if (impacts.length > 0) {
    await tx.awayPeriodImpact.createMany({
      data: impacts,
    });
  }
}

async function revertAwayPeriodImpacts(
  tx: Prisma.TransactionClient,
  params: {
    awayPeriodId: string;
    actorId: string | null;
  }
) {
  const impacts = await tx.awayPeriodImpact.findMany({
    where: { awayPeriodId: params.awayPeriodId },
    include: {
      enrolment: {
        include: awayEnrolmentInclude,
      },
    },
  });

  for (const impact of impacts) {
    await applyPaidThroughDelta(tx, {
      enrolment: impact.enrolment,
      deltaDays: impact.paidThroughDeltaDays * -1,
      actorId: params.actorId,
    });
  }
}

function revalidateFamilyAwayPaths(familyId: string) {
  revalidatePath(`/admin/family/${familyId}`);
}

export async function createAwayPeriod(input: z.input<typeof createAwayPeriodSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const parsed = createAwayPeriodSchema.parse(input);
  const normalized = normalizeAwayInput(parsed);

  const result = await prisma.$transaction(
    async (tx) => {
      await ensureScopeReferences(tx, normalized);
      await assertNoOverlappingAwayPeriod(tx, normalized);

      const awayPeriod = await tx.awayPeriod.create({
        data: {
          familyId: normalized.familyId,
          studentId: normalized.studentId,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
          note: normalized.note,
          createdByUserId: user.id,
        },
      });

      await applyAwayPeriodImpacts(tx, {
        awayPeriodId: awayPeriod.id,
        familyId: normalized.familyId,
        studentId: normalized.studentId,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        actorId: user.id,
      });

      return {
        id: awayPeriod.id,
        familyId: awayPeriod.familyId,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  revalidateFamilyAwayPaths(result.familyId);
  return result;
}

export async function updateAwayPeriod(input: z.input<typeof updateAwayPeriodSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const parsed = updateAwayPeriodSchema.parse(input);
  const normalized = normalizeAwayInput(parsed);

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.awayPeriod.findUnique({
        where: { id: parsed.id },
        select: {
          id: true,
          familyId: true,
          deletedAt: true,
        },
      });

      if (!existing || existing.deletedAt) {
        throw new Error("Away period not found.");
      }

      if (existing.familyId !== normalized.familyId) {
        throw new Error("Away period family cannot be changed.");
      }

      await ensureScopeReferences(tx, normalized);
      await assertNoOverlappingAwayPeriod(tx, { ...normalized, excludeId: parsed.id });

      await revertAwayPeriodImpacts(tx, {
        awayPeriodId: parsed.id,
        actorId: user.id,
      });

      await tx.awayPeriodImpact.deleteMany({
        where: { awayPeriodId: parsed.id },
      });

      const awayPeriod = await tx.awayPeriod.update({
        where: { id: parsed.id },
        data: {
          studentId: normalized.studentId,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
          note: normalized.note,
        },
      });

      await applyAwayPeriodImpacts(tx, {
        awayPeriodId: awayPeriod.id,
        familyId: awayPeriod.familyId,
        studentId: normalized.studentId,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        actorId: user.id,
      });

      return {
        id: awayPeriod.id,
        familyId: awayPeriod.familyId,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  revalidateFamilyAwayPaths(result.familyId);
  return result;
}

export async function deleteAwayPeriod(input: z.input<typeof deleteAwayPeriodSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const parsed = deleteAwayPeriodSchema.parse(input);

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.awayPeriod.findUnique({
        where: { id: parsed.id },
        select: {
          id: true,
          familyId: true,
          deletedAt: true,
        },
      });

      if (!existing || existing.deletedAt) {
        throw new Error("Away period not found.");
      }

      await revertAwayPeriodImpacts(tx, {
        awayPeriodId: existing.id,
        actorId: user.id,
      });

      await tx.awayPeriod.update({
        where: { id: existing.id },
        data: {
          deletedAt: new Date(),
        },
      });

      return {
        familyId: existing.familyId,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  revalidateFamilyAwayPaths(result.familyId);
  return result;
}
