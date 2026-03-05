import { addDays, isAfter, isBefore } from "date-fns";
import { BillingType, EnrolmentAdjustmentType, EnrolmentStatus, Prisma } from "@prisma/client";

import {
  adjustCreditsForManualPaidThroughDate,
  getEnrolmentBillingStatus,
} from "@/server/billing/enrolmentBilling";
import { applyAwayDeltaDays, calculateAwayDeltaDays, listAwayOccurrences, resolveSessionsPerWeek } from "@/server/away/awayMath";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";

const awayCreditEnrolmentInclude = Prisma.validator<Prisma.EnrolmentInclude>()({
  plan: true,
  student: { select: { id: true, familyId: true } },
  template: true,
  classAssignments: {
    include: {
      template: true,
    },
  },
});

type AwayCreditEnrolmentRecord = Prisma.EnrolmentGetPayload<{
  include: typeof awayCreditEnrolmentInclude;
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

function maxDate(a: Date, b: Date) {
  return isAfter(a, b) ? a : b;
}

function minDate(a: Date, b: Date) {
  return isBefore(a, b) ? a : b;
}

function resolveCurrentPaidThrough(enrolment: Pick<AwayCreditEnrolmentRecord, "paidThroughDate" | "paidThroughDateComputed">) {
  return (
    (enrolment.paidThroughDate ? brisbaneStartOfDay(enrolment.paidThroughDate) : null) ??
    (enrolment.paidThroughDateComputed ? brisbaneStartOfDay(enrolment.paidThroughDateComputed) : null)
  );
}

function resolveEnrolmentTemplates(enrolment: AwayCreditEnrolmentRecord): AwayTemplate[] {
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
  const levelIds = params.templates.map((template) => template.levelId ?? null);

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

async function applyPaidThroughDeltaForEnrolment(
  tx: Prisma.TransactionClient,
  params: {
    enrolment: AwayCreditEnrolmentRecord;
    deltaDays: number;
    actorId: string | null;
  }
) {
  const previousPaidThrough = resolveCurrentPaidThrough(params.enrolment);
  if (!previousPaidThrough || params.deltaDays === 0) return null;

  const nextPaidThrough = applyAwayDeltaDays(previousPaidThrough, params.deltaDays);

  await tx.enrolment.update({
    where: { id: params.enrolment.id },
    data: {
      paidThroughDate: nextPaidThrough,
      paidThroughDateComputed: nextPaidThrough,
    },
  });

  params.enrolment.paidThroughDate = nextPaidThrough;
  params.enrolment.paidThroughDateComputed = nextPaidThrough;

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

  return { previousPaidThroughDate: previousPaidThrough, nextPaidThroughDate: nextPaidThrough };
}

export async function applyAwayPaidThroughDelta(
  tx: Prisma.TransactionClient,
  params: {
    enrolmentId: string;
    deltaDays: number;
    actorId: string | null;
  }
) {
  if (params.deltaDays === 0) return null;

  const enrolment = await tx.enrolment.findUnique({
    where: { id: params.enrolmentId },
    include: awayCreditEnrolmentInclude,
  });

  if (!enrolment) return null;

  return applyPaidThroughDeltaForEnrolment(tx, {
    enrolment,
    deltaDays: params.deltaDays,
    actorId: params.actorId,
  });
}

export function resolveAwayCreditEligibility(params: {
  awayOccurrenceDates: Date[];
  paidThroughDate: Date | null;
  consumedOccurrences: number;
}) {
  const consumedClamped = Math.max(0, Math.min(params.consumedOccurrences, params.awayOccurrenceDates.length));
  if (!params.paidThroughDate) {
    return {
      eligibleOccurrences: 0,
      newlyEligibleOccurrences: 0,
      consumedClamped,
    };
  }

  const paidThroughDayKey = toBrisbaneDayKey(brisbaneStartOfDay(params.paidThroughDate));
  const eligibleOccurrences = params.awayOccurrenceDates.reduce(
    (count, occurrence) => count + (toBrisbaneDayKey(occurrence) <= paidThroughDayKey ? 1 : 0),
    0
  );

  return {
    eligibleOccurrences,
    newlyEligibleOccurrences: Math.max(0, eligibleOccurrences - consumedClamped),
    consumedClamped,
  };
}

export async function applyEligibleAwayCreditsForEnrolment(
  tx: Prisma.TransactionClient,
  params: { enrolmentId: string; actorId: string | null; eligibilityCutoffDate?: Date | null }
) {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: params.enrolmentId },
    include: awayCreditEnrolmentInclude,
  });

  if (!enrolment || !enrolment.plan) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }
  if (enrolment.status !== EnrolmentStatus.ACTIVE && enrolment.status !== EnrolmentStatus.CHANGEOVER) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }
  if (enrolment.plan.billingType !== BillingType.PER_WEEK) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  const templates = resolveEnrolmentTemplates(enrolment);
  if (!templates.length) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  const currentPaidThrough = resolveCurrentPaidThrough(enrolment);
  if (!currentPaidThrough) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }
  const eligibilityCutoff =
    params.eligibilityCutoffDate === undefined
      ? currentPaidThrough
      : params.eligibilityCutoffDate
        ? brisbaneStartOfDay(params.eligibilityCutoffDate)
        : null;

  if (!eligibilityCutoff) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  let runningPaidThrough = currentPaidThrough;
  let appliedOccurrences = 0;
  let appliedDeltaDays = 0;

  const impacts = await tx.awayPeriodImpact.findMany({
    where: {
      enrolmentId: enrolment.id,
      awayPeriod: { deletedAt: null },
    },
    include: {
      awayPeriod: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      },
    },
    orderBy: [{ awayPeriod: { startDate: "asc" } }, { createdAt: "asc" }],
  });

  if (!impacts.length) {
    return { appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  const sessionsPerWeek = resolveSessionsPerWeek(templates);
  const enrolmentStart = brisbaneStartOfDay(enrolment.startDate);
  const enrolmentEnd = enrolment.endDate ? brisbaneStartOfDay(enrolment.endDate) : null;

  for (const impact of impacts) {
    const awayStart = brisbaneStartOfDay(impact.awayPeriod.startDate);
    const awayEnd = brisbaneStartOfDay(impact.awayPeriod.endDate);
    const rangeStart = maxDate(awayStart, enrolmentStart);
    const rangeEnd = enrolmentEnd ? minDate(awayEnd, enrolmentEnd) : awayEnd;

    if (isAfter(rangeStart, rangeEnd)) {
      if (impact.missedOccurrences !== 0 || impact.consumedOccurrences !== 0) {
        await tx.awayPeriodImpact.update({
          where: { id: impact.id },
          data: {
            missedOccurrences: 0,
            consumedOccurrences: 0,
          },
        });
      }
      continue;
    }

    const extensionStart = brisbaneStartOfDay(addDays(runningPaidThrough, 1));
    const coverageRangeStart = minDate(rangeStart, extensionStart);
    const coverageRangeEnd = enrolmentEnd
      ? maxDate(rangeEnd, enrolmentEnd)
      : maxDate(rangeEnd, brisbaneStartOfDay(addDays(runningPaidThrough, 365)));

    const coverage = await loadCoverageData(tx, {
      enrolmentId: enrolment.id,
      templates,
      rangeStart: coverageRangeStart,
      rangeEnd: coverageRangeEnd,
    });

    const awayOccurrences = listAwayOccurrences({
      templates,
      startDate: rangeStart,
      endDate: rangeEnd,
      horizon: rangeEnd,
      sessionsPerWeek,
      coverage,
    });

    const eligibility = resolveAwayCreditEligibility({
      awayOccurrenceDates: awayOccurrences,
      paidThroughDate: eligibilityCutoff,
      consumedOccurrences: impact.consumedOccurrences,
    });

    let nextConsumed = eligibility.consumedClamped;
    let deltaDaysAppliedThisImpact = 0;

    if (eligibility.newlyEligibleOccurrences > 0) {
      deltaDaysAppliedThisImpact = calculateAwayDeltaDays({
        currentPaidThroughDate: runningPaidThrough,
        missedOccurrences: eligibility.newlyEligibleOccurrences,
        sessionsPerWeek,
        templates,
        enrolmentEndDate: enrolmentEnd,
        coverage,
      });

      if (deltaDaysAppliedThisImpact > 0) {
        const applied = await applyPaidThroughDeltaForEnrolment(tx, {
          enrolment,
          deltaDays: deltaDaysAppliedThisImpact,
          actorId: params.actorId,
        });

        if (applied) {
          runningPaidThrough = applied.nextPaidThroughDate;
          appliedOccurrences += eligibility.newlyEligibleOccurrences;
          appliedDeltaDays += deltaDaysAppliedThisImpact;
          nextConsumed += eligibility.newlyEligibleOccurrences;
        }
      }
    }

    const nextPaidThroughDeltaDays = impact.paidThroughDeltaDays + deltaDaysAppliedThisImpact;
    if (
      impact.missedOccurrences !== awayOccurrences.length ||
      impact.consumedOccurrences !== nextConsumed ||
      impact.paidThroughDeltaDays !== nextPaidThroughDeltaDays
    ) {
      await tx.awayPeriodImpact.update({
        where: { id: impact.id },
        data: {
          missedOccurrences: awayOccurrences.length,
          consumedOccurrences: nextConsumed,
          paidThroughDeltaDays: nextPaidThroughDeltaDays,
        },
      });
    }
  }

  return { appliedOccurrences, appliedDeltaDays };
}

export async function recalculateAwayAdjustedPaidThroughForEnrolment(
  tx: Prisma.TransactionClient,
  params: { enrolmentId: string; actorId: string | null; additionalDeltaDaysToRemove?: number }
) {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: params.enrolmentId },
    include: {
      plan: true,
    },
  });

  if (!enrolment || !enrolment.plan) {
    return { removedDeltaDays: 0, appliedOccurrences: 0, appliedDeltaDays: 0 };
  }
  if (enrolment.status !== EnrolmentStatus.ACTIVE && enrolment.status !== EnrolmentStatus.CHANGEOVER) {
    return { removedDeltaDays: 0, appliedOccurrences: 0, appliedDeltaDays: 0 };
  }
  if (enrolment.plan.billingType !== BillingType.PER_WEEK) {
    return { removedDeltaDays: 0, appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  const eligibilityCutoff = resolveCurrentPaidThrough(enrolment);
  if (!eligibilityCutoff) {
    return { removedDeltaDays: 0, appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  const impacts = await tx.awayPeriodImpact.findMany({
    where: { enrolmentId: params.enrolmentId },
    select: {
      id: true,
      paidThroughDeltaDays: true,
    },
  });

  if (impacts.length === 0) {
    return { removedDeltaDays: 0, appliedOccurrences: 0, appliedDeltaDays: 0 };
  }

  const removedDeltaDays =
    impacts.reduce((sum, impact) => sum + impact.paidThroughDeltaDays, 0) + (params.additionalDeltaDaysToRemove ?? 0);

  if (removedDeltaDays !== 0) {
    await applyAwayPaidThroughDelta(tx, {
      enrolmentId: params.enrolmentId,
      deltaDays: removedDeltaDays * -1,
      actorId: params.actorId,
    });
  }

  await tx.awayPeriodImpact.updateMany({
    where: { enrolmentId: params.enrolmentId },
    data: {
      consumedOccurrences: 0,
      paidThroughDeltaDays: 0,
    },
  });

  const applied = await applyEligibleAwayCreditsForEnrolment(tx, {
    enrolmentId: params.enrolmentId,
    actorId: params.actorId,
    eligibilityCutoffDate: eligibilityCutoff,
  });

  return {
    removedDeltaDays,
    appliedOccurrences: applied.appliedOccurrences,
    appliedDeltaDays: applied.appliedDeltaDays,
  };
}
