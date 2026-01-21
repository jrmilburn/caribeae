// ./server/billing/recalculateEnrolmentCoverage.ts

import { prisma } from "@/lib/prisma";
import {
  BillingType,
  EnrolmentAdjustmentType,
  EnrolmentStatus,
  type EnrolmentCoverageReason,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
  type BrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import {
  computeBillingSnapshotForEnrolment,
  persistBillingSnapshot,
} from "@/server/billing/enrolmentBilling";
import {
  computeCoverageEndDay,
  countScheduledSessionsExcludingHolidays,
} from "@/server/billing/coverageEngine";

export class CoverageWouldShortenError extends Error {
  oldDateKey: BrisbaneDayKey | null;
  newDateKey: BrisbaneDayKey | null;

  constructor(params: { oldDateKey: BrisbaneDayKey | null; newDateKey: BrisbaneDayKey | null }) {
    super("Recalculation would shorten paid-through coverage.");
    this.name = "CoverageWouldShortenError";
    this.oldDateKey = params.oldDateKey;
    this.newDateKey = params.newDateKey;
  }
}

type RecalculateOptions = {
  tx?: Prisma.TransactionClient;
  actorId?: string;
  confirmShorten?: boolean;
  weeklyEntitlementSessions?: number | null;
};

// ✅ Drop-in fix: fetch full template shapes so TS matches what
// computeBillingSnapshotForEnrolment expects.
type EnrolmentWithTemplate = Prisma.EnrolmentGetPayload<{
  include: {
    plan: true;
    template: true;
    classAssignments: {
      include: {
        template: true;
      };
    };
  };
}>;

function resolveTemplates(enrolment: EnrolmentWithTemplate) {
  const templates = enrolment.classAssignments.length
    ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
    : enrolment.template
      ? [enrolment.template]
      : [];

  const map = new Map(templates.map((template) => [template.id, template]));
  return Array.from(map.values());
}

function compareDayKeys(a: BrisbaneDayKey | null, b: BrisbaneDayKey | null) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return brisbaneCompare(a, b);
}

export function wouldShortenCoverage(current: Date | null, proposed: Date | null) {
  const currentKey = current ? toBrisbaneDayKey(brisbaneStartOfDay(current)) : null;
  const proposedKey = proposed ? toBrisbaneDayKey(brisbaneStartOfDay(proposed)) : null;
  return compareDayKeys(proposedKey, currentKey) < 0;
}

function buildHolidayOverlapDayKeys(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  holidays: Array<{ startDate: Date; endDate: Date }>;
}) {
  const closed = new Set<BrisbaneDayKey>();

  params.holidays.forEach((holiday) => {
    const holidayStart = toBrisbaneDayKey(holiday.startDate);
    const holidayEnd = toBrisbaneDayKey(holiday.endDate);
    const start = brisbaneCompare(holidayStart, params.startDayKey) < 0 ? params.startDayKey : holidayStart;
    const end = brisbaneCompare(holidayEnd, params.endDayKey) > 0 ? params.endDayKey : holidayEnd;

    if (brisbaneCompare(start, end) > 0) return;

    let cursor = start;
    while (brisbaneCompare(cursor, end) <= 0) {
      closed.add(cursor);
      cursor = brisbaneAddDays(cursor, 1);
    }
  });

  return Array.from(closed).sort();
}

export function countFullWeekClosures(params: {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  holidays: Array<{ startDate: Date; endDate: Date }>;
}) {
  const closedKeys = buildHolidayOverlapDayKeys(params);
  if (!closedKeys.length) return 0;

  let weeks = 0;
  let run = 0;
  let previous: BrisbaneDayKey | null = null;

  for (const key of closedKeys) {
    if (!previous || brisbaneCompare(key, brisbaneAddDays(previous, 1)) !== 0) {
      weeks += Math.floor(run / 7);
      run = 1;
    } else {
      run += 1;
    }
    previous = key;
  }

  weeks += Math.floor(run / 7);
  return weeks;
}

export async function recalculateEnrolmentCoverage(
  enrolmentId: string,
  reason: EnrolmentCoverageReason,
  opts?: RecalculateOptions
) {
  const client = opts?.tx ?? prisma;

  const run = async (tx: Prisma.TransactionClient) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        plan: true,
        template: true,
        classAssignments: {
          include: {
            template: true,
          },
        },
      },
    });

    if (!enrolment || enrolment.status !== EnrolmentStatus.ACTIVE || !enrolment.plan) {
      return null;
    }

    const templates = resolveTemplates(enrolment);
    if (!templates.length) return null;

    const previousPaidThrough = enrolment.paidThroughDate ? brisbaneStartOfDay(enrolment.paidThroughDate) : null;

    if (enrolment.plan.billingType === BillingType.PER_CLASS) {
      const snapshot = await computeBillingSnapshotForEnrolment(tx, enrolment, new Date());
      const computedPaidThrough = snapshot.paidThroughDate ? brisbaneStartOfDay(snapshot.paidThroughDate) : null;

      const previousKey = previousPaidThrough ? toBrisbaneDayKey(previousPaidThrough) : null;
      const computedKey = computedPaidThrough ? toBrisbaneDayKey(computedPaidThrough) : null;

      let nextPaidThrough = computedPaidThrough;
      if (wouldShortenCoverage(previousPaidThrough, computedPaidThrough)) {
        if (opts?.confirmShorten) {
          nextPaidThrough = computedPaidThrough;
        } else if (reason === "INVOICE_APPLIED" || reason === "CANCELLATION_CREATED" || reason === "CANCELLATION_REVERSED") {
          nextPaidThrough = previousPaidThrough;
        } else {
          throw new CoverageWouldShortenError({ oldDateKey: previousKey, newDateKey: computedKey });
        }
      }

      await persistBillingSnapshot(tx, {
        ...snapshot,
        paidThroughDate: nextPaidThrough,
        nextPaymentDueDate: snapshot.nextPaymentDueDate ? brisbaneStartOfDay(snapshot.nextPaymentDueDate) : null,
      });

      await tx.enrolmentCoverageAudit.create({
        data: {
          enrolmentId: enrolment.id,
          reason,
          previousPaidThroughDate: enrolment.paidThroughDate,
          nextPaidThroughDate: nextPaidThrough,
          actorId: opts?.actorId ?? null,
        },
      });

      return nextPaidThrough;
    }

    if (enrolment.plan.billingType === BillingType.PER_WEEK) {
      const basePaidThrough = enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed;
      if (!basePaidThrough) return null;

      const paidWindowStart = brisbaneStartOfDay(enrolment.startDate);
      const paidWindowEnd = brisbaneStartOfDay(basePaidThrough);

      const startDayKey = toBrisbaneDayKey(paidWindowStart);
      const endDayKey = toBrisbaneDayKey(paidWindowEnd);
      if (brisbaneCompare(endDayKey, startDayKey) < 0) return null;

      const templateIds = templates.map((template) => template.id);
      const levelIds = templates.map((template) => template.levelId ?? null);
      const enrolmentEndDayKey = enrolment.endDate ? toBrisbaneDayKey(brisbaneStartOfDay(enrolment.endDate)) : null;

      const [holidays, cancellationCredits] = await Promise.all([
        tx.holiday.findMany({
          where: {
            startDate: { lte: paidWindowEnd },
            endDate: { gte: paidWindowStart },
            ...buildHolidayScopeWhere({ templateIds, levelIds }),
          },
          select: { startDate: true, endDate: true },
        }),
        tx.enrolmentAdjustment.findMany({
          where: {
            enrolmentId: enrolment.id,
            type: EnrolmentAdjustmentType.CANCELLATION_CREDIT,
            templateId: { in: templateIds },
            date: { gte: paidWindowStart, lte: paidWindowEnd },
          },
          select: { date: true },
        }),
      ]);

      const scheduledSessions =
        opts?.weeklyEntitlementSessions ?? countScheduledSessionsExcludingHolidays({
          startDayKey,
          endDayKey,
          assignedTemplates: templates,
          holidays,
        });

      const cancellationHolidays = cancellationCredits.map((credit) => ({
        startDate: credit.date,
        endDate: credit.date,
      }));

      const proposedPaidThrough = computeCoverageEndDay({
        startDayKey,
        assignedTemplates: templates,
        holidays: [...holidays, ...cancellationHolidays],
        entitlementSessions: scheduledSessions,
        endDayKey: enrolmentEndDayKey,
      });

      const currentPaidThrough = enrolment.paidThroughDate ? brisbaneStartOfDay(enrolment.paidThroughDate) : null;
      const currentKey = currentPaidThrough ? toBrisbaneDayKey(currentPaidThrough) : null;
      const proposedKey = proposedPaidThrough ? toBrisbaneDayKey(proposedPaidThrough) : null;

      const nextPaidThrough = compareDayKeys(proposedKey, currentKey) < 0 ? currentPaidThrough : proposedPaidThrough;
      const nextKey = nextPaidThrough ? toBrisbaneDayKey(nextPaidThrough) : null;

      if (currentKey !== nextKey) {
        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { paidThroughDate: nextPaidThrough },
        });

        await tx.enrolmentCoverageAudit.create({
          data: {
            enrolmentId: enrolment.id,
            reason,
            previousPaidThroughDate: enrolment.paidThroughDate,
            nextPaidThroughDate: nextPaidThrough,
            actorId: opts?.actorId ?? null,
          },
        });
      }

      return nextPaidThrough;
    }

    return null;
  };

  if (typeof (client as PrismaClient).$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => run(tx));
  }

  return run(client as Prisma.TransactionClient);
}
