import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { BillingType, EnrolmentStatus } from "@prisma/client";

import {
  computeCoverageEndDay,
  countScheduledSessions,
  dayKeyToDate,
} from "@/server/billing/coverageEngine";
import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
  type BrisbaneDayKey,
} from "@/server/dates/brisbaneDay";

export type CoverageRecomputeReason =
  | "HOLIDAY_ADDED"
  | "HOLIDAY_REMOVED"
  | "HOLIDAY_UPDATED"
  | "CLASS_CHANGED"
  | "PLAN_CHANGED"
  | "INVOICE_APPLIED";

const HORIZON_FALLBACK_DAYS = 365;

function resolveAssignedTemplates(enrolment: {
  template: { dayOfWeek: number | null } | null;
  classAssignments: Array<{ template: { dayOfWeek: number | null } | null }>;
}) {
  if (enrolment.classAssignments.length) {
    return enrolment.classAssignments
      .map((assignment) => assignment.template)
      .filter((template): template is NonNullable<typeof template> => Boolean(template));
  }
  return enrolment.template ? [enrolment.template] : [];
}

function resolveHorizonDayKey(params: {
  enrolmentStartDayKey: BrisbaneDayKey;
  enrolmentEndDayKey: BrisbaneDayKey | null;
  entitlementSessions: number;
}) {
  if (params.enrolmentEndDayKey) return params.enrolmentEndDayKey;
  const fallbackDays = Math.max(params.entitlementSessions * 7, HORIZON_FALLBACK_DAYS);
  return brisbaneAddDays(params.enrolmentStartDayKey, fallbackDays);
}

export async function recomputeEnrolmentCoverage(
  enrolmentId: string,
  reason: CoverageRecomputeReason,
  options?: { client?: PrismaClient | Prisma.TransactionClient; actorId?: string | null }
) {
  const client = options?.client ?? prisma;

  const run = async (tx: Prisma.TransactionClient) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        plan: true,
        template: { select: { dayOfWeek: true } },
        classAssignments: { include: { template: { select: { dayOfWeek: true } } } },
      },
    });

    if (!enrolment || enrolment.status !== EnrolmentStatus.ACTIVE) {
      return null;
    }

    if (!enrolment.plan || enrolment.plan.billingType !== BillingType.PER_WEEK) {
      return null;
    }

    const assignedTemplates = resolveAssignedTemplates(enrolment);
    if (!assignedTemplates.length) return null;

    const basePaidThrough = enrolment.paidThroughDateComputed ?? enrolment.paidThroughDate;
    if (!basePaidThrough) return null;

    const enrolmentStartDayKey = toBrisbaneDayKey(enrolment.startDate);
    const basePaidThroughDayKey = toBrisbaneDayKey(basePaidThrough);
    const enrolmentEndDayKey = enrolment.endDate ? toBrisbaneDayKey(enrolment.endDate) : null;

    if (brisbaneCompare(basePaidThroughDayKey, enrolmentStartDayKey) < 0) return null;

    const entitlementSessions = countScheduledSessions({
      startDayKey: enrolmentStartDayKey,
      endDayKey: basePaidThroughDayKey,
      assignedTemplates,
    });

    const horizonDayKey = resolveHorizonDayKey({
      enrolmentStartDayKey,
      enrolmentEndDayKey,
      entitlementSessions,
    });

    const holidays = await tx.holiday.findMany({
      where: {
        startDate: { lte: brisbaneStartOfDay(horizonDayKey) },
        endDate: { gte: brisbaneStartOfDay(enrolmentStartDayKey) },
      },
      select: { startDate: true, endDate: true },
    });

    const coverageEndDayKey = computeCoverageEndDay({
      startDayKey: enrolmentStartDayKey,
      assignedTemplates,
      holidays,
      entitlementSessions,
      endDayKey: enrolmentEndDayKey,
    });

    const nextPaidThrough = dayKeyToDate(coverageEndDayKey);
    const previousPaidThrough = enrolment.paidThroughDate;

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        paidThroughDate: nextPaidThrough ?? null,
      },
    });

    await tx.enrolmentCoverageAudit.create({
      data: {
        enrolmentId: enrolment.id,
        reason,
        previousPaidThroughDate: previousPaidThrough,
        nextPaidThroughDate: nextPaidThrough,
        actorId: options?.actorId ?? null,
      },
    });

    return nextPaidThrough;
  };

  if (typeof (client as PrismaClient).$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => run(tx));
  }

  return run(client as Prisma.TransactionClient);
}
