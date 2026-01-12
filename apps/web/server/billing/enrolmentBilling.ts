/**
 * Findings + Proposed Model
 * - Entitlements are scattered: invoices and cancellations mutate enrolment.paidThroughDate/creditsRemaining
 *   directly, with no shared source-of-truth or audit of how credits move. Attendance never consumes credits.
 * - Paid-through for credit plans guesses from creditsRemaining and schedule assumptions; coverageEnd on invoices
 *   is used inconsistently and not recomputed when cancellations or attendance change.
 * - Invoice payment hooks grant credits immediately without recording why/when, making it impossible to derive a
 *   reliable balance or “next due” date across PER_WEEK vs PER_CLASS/BLOCK plans.
 *
 * Proposed model implemented here:
 * - Introduce an explicit enrolment credit ledger (EnrolmentCreditEvent) for PURCHASE/CONSUME/CANCELLATION_CREDIT/MANUAL_ADJUST.
 * - Treat creditsRemaining as a cached mirror of the ledger balance; never mutate it directly.
 * - Centralize entitlement updates: paid weekly coverage via getWeeklyPaidThrough, credit purchases via ledger events.
 * - Deterministic consumption: for credit plans, each scheduled occurrence (unless cancelled) consumes a credit; missing
 *   events are backfilled before computing paid-through. Cancellations post a ledger credit instead of guessing.
 * - Compute and cache paidThroughDateComputed + nextDueDateComputed + creditsBalanceCached for reuse across the app via
 *   getEnrolmentBillingStatus, ensuring all surfaces share the same selector.
 */
/**
 * Holiday & coverage entry points:
 * - server/holiday/createHoliday|updateHoliday|deleteHoliday -> recomputeHolidayEnrolments -> recomputeEnrolmentCoverage
 * - server/enrolment/changeEnrolment (schedule modal) -> recomputeEnrolmentCoverage
 * - server/invoicing/coverage.ts + applyPaidInvoiceToEnrolment.ts (weekly coverage windows)
 * - server/billing/recomputeEnrolmentCoverage (authoritative paidThrough recompute)
 *
 * Coverage meaning of paidThroughDate:
 * - The Brisbane calendar day of the last entitled session under the enrolment's current class assignments,
 *   after skipping holidays. paidThroughDateComputed stores the raw coverage boundary (no holiday skipping).
 *
 * Authoritative functions:
 * - computeCoverageEndDay (server/billing/coverageEngine)
 * - recomputeEnrolmentCoverage (server/billing/recomputeEnrolmentCoverage)
 * - resolveWeeklyCoverageWindow (server/invoicing/coverage)
 */

import { addDays, isAfter } from "date-fns";

import { prisma } from "@/lib/prisma";
import { normalizeToLocalMidnight } from "@/lib/dateUtils";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { resolveOccurrenceHorizon } from "./occurrenceWalker";
import { calculatePaidThroughDate, listScheduledOccurrences } from "./paidThroughDate";

import {
  BillingType,
  EnrolmentAdjustmentType,
  EnrolmentCreditEventType,
  EnrolmentStatus,
  PrismaClient,
  type Prisma,
  type EnrolmentPlan
} from "@prisma/client";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;


type EnrolmentWithPlanTemplate = Prisma.EnrolmentGetPayload<{
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

export type EnrolmentBillingSnapshot = {
  enrolmentId: string;
  billingType: BillingType | null;
  paidThroughDate: Date | null;
  nextPaymentDueDate: Date | null;
  remainingCredits: number | null;
  coveredOccurrences: number;
  sessionsPerWeek: number;
};

function withTx<T>(client: PrismaClientOrTx | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  const candidate = client ?? prisma;
  if (typeof (candidate as PrismaClient).$transaction === "function") {
    return (candidate as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(candidate as Prisma.TransactionClient);
}

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(date: Date) {
  const d = normalizeDate(date);
  return d.toISOString().slice(0, 10);
}

function normalizeDate(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUtc(date: Date, amount: number) {
  const base = normalizeDate(date);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function sessionsPerWeek(plan: EnrolmentPlan | null | undefined) {
  if (!plan) return 1;
  const count = plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
  return count;
}

function resolveAssignedTemplates(enrolment: EnrolmentWithPlanTemplate) {
  if (enrolment.classAssignments.length) {
    return enrolment.classAssignments
      .map((assignment) => assignment.template)
      .filter((template): template is NonNullable<typeof template> => Boolean(template));
  }
  return enrolment.template ? [enrolment.template] : [];
}

function nextOccurrenceOnOrAfter(start: Date, templateDayOfWeek: number | null | undefined) {
  if (templateDayOfWeek == null) return null;
  const target = ((templateDayOfWeek % 7) + 7) % 7; // 0 = Monday
  let cursor = normalizeDate(start);
  while (cursor.getUTCDay() !== ((target + 1) % 7)) {
    cursor = addDaysUtc(cursor, 1);
  }
  return cursor;
}

function nextOccurrenceOnOrAfterLocal(start: Date, templateDayOfWeek: number | null | undefined) {
  if (templateDayOfWeek == null) return null;
  const target = ((templateDayOfWeek % 7) + 7) % 7; // 0 = Monday
  const normalizedStart = normalizeToLocalMidnight(start);
  const startDay = (normalizedStart.getDay() + 6) % 7;
  const delta = (target - startDay + 7) % 7;
  return addDays(normalizedStart, delta);
}

async function updateCachedCreditBalance(
  tx: Prisma.TransactionClient,
  enrolmentId: string,
  asOf?: Date | null
) {
  const where: Prisma.EnrolmentCreditEventWhereInput = { enrolmentId };
  if (asOf) {
    where.occurredOn = { lte: normalizeDate(asOf) };
  }
  const aggregate = await tx.enrolmentCreditEvent.aggregate({
    where,
    _sum: { creditsDelta: true },
  });
  const balance = aggregate._sum.creditsDelta ?? 0;

  await tx.enrolment.update({
    where: { id: enrolmentId },
    data: {
      creditsBalanceCached: balance,
      creditsRemaining: balance,
    },
  });

  return balance;
}

async function recordCreditEvent(
  tx: Prisma.TransactionClient,
  input: {
    enrolmentId: string;
    type: EnrolmentCreditEventType;
    creditsDelta: number;
    occurredOn: Date;
    note?: string | null;
    invoiceId?: string | null;
    attendanceId?: string | null;
    adjustmentId?: string | null;
    refreshBalance?: boolean;
  }
) {
  const occurredOn = normalizeDate(input.occurredOn);
  await tx.enrolmentCreditEvent.create({
    data: {
      enrolmentId: input.enrolmentId,
      type: input.type,
      creditsDelta: input.creditsDelta,
      occurredOn,
      note: input.note?.trim() || null,
      invoiceId: input.invoiceId ?? null,
      attendanceId: input.attendanceId ?? null,
      adjustmentId: input.adjustmentId ?? null,
    },
  });

  if (input.refreshBalance ?? true) {
    await updateCachedCreditBalance(tx, input.enrolmentId);
  }
}

async function ensureConsumptionEvents(
  tx: Prisma.TransactionClient,
  enrolment: EnrolmentWithPlanTemplate,
  throughDate: Date
) {
  if (!enrolment.plan || !enrolment.template) return;
  if (enrolment.plan.billingType !== BillingType.PER_CLASS) return;

  const assignedTemplates = resolveAssignedTemplates(enrolment);
  if (!assignedTemplates.length) return;

  const windowEnd = enrolment.endDate && isAfter(normalizeDate(enrolment.endDate), normalizeDate(throughDate))
    ? normalizeDate(throughDate)
    : enrolment.endDate
      ? normalizeDate(enrolment.endDate)
      : normalizeDate(throughDate);

  if (isAfter(normalizeDate(enrolment.startDate), windowEnd)) return;

  const templateIds = assignedTemplates.map((template) => template.id);
  const cancellations = await tx.classCancellation.findMany({
    where: {
      templateId: { in: templateIds },
      date: { gte: normalizeDate(enrolment.startDate), lte: windowEnd },
    },
    select: { date: true, templateId: true },
  });
  const cancelledByTemplate = new Map<string, Set<string>>();
  for (const cancellation of cancellations) {
    const set = cancelledByTemplate.get(cancellation.templateId) ?? new Set<string>();
    set.add(dateKey(cancellation.date));
    cancelledByTemplate.set(cancellation.templateId, set);
  }

  const holidayStart = brisbaneStartOfDay(enrolment.startDate);
  const holidayEnd = brisbaneStartOfDay(windowEnd);
  const holidays = await tx.holiday.findMany({
    where: {
      startDate: { lte: holidayEnd },
      endDate: { gte: holidayStart },
    },
    select: { startDate: true, endDate: true },
  });

  const existing = await tx.enrolmentCreditEvent.findMany({
    where: {
      enrolmentId: enrolment.id,
      type: EnrolmentCreditEventType.CONSUME,
      occurredOn: { gte: normalizeDate(enrolment.startDate), lte: windowEnd },
    },
    select: { occurredOn: true },
  });
  const existingCounts = new Map<string, number>();
  existing.forEach((entry) => {
    const key = dateKey(entry.occurredOn);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  });

  const occurrenceCounts = new Map<string, number>();
  for (const template of assignedTemplates) {
    const cancelledSet = cancelledByTemplate.get(template.id) ?? new Set<string>();
    const scheduled = listScheduledOccurrences({
      startDate: enrolment.startDate,
      endDate: windowEnd,
      classTemplate: {
        dayOfWeek: template.dayOfWeek ?? null,
        startTime: template.startTime ?? null,
      },
      holidays,
      cancellations: cancellations.filter((c) => c.templateId === template.id).map((c) => c.date),
    });
    for (const occurrence of scheduled) {
      const key = dateKey(occurrence);
      if (cancelledSet.has(key)) continue;
      occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1);
    }
  }

  const toCreate: Date[] = [];
  for (const [key, count] of occurrenceCounts.entries()) {
    const existingCount = existingCounts.get(key) ?? 0;
    const missing = count - existingCount;
    if (missing <= 0) continue;
    const occurrenceDate = new Date(key);
    for (let i = 0; i < missing; i += 1) {
      toCreate.push(occurrenceDate);
    }
  }

  if (toCreate.length === 0) return;

  await tx.enrolmentCreditEvent.createMany({
    data: toCreate.map((occurredOn) => ({
      enrolmentId: enrolment.id,
      type: EnrolmentCreditEventType.CONSUME,
      creditsDelta: -1,
      occurredOn,
      note: "Auto-consumed scheduled class",
    })),
    skipDuplicates: true,
  });

  await updateCachedCreditBalance(tx, enrolment.id);
}

export function getWeeklyPaidThrough(
  enrolment: Pick<Prisma.EnrolmentGetPayload<true>, "paidThroughDate" | "paidThroughDateComputed" | "startDate" | "endDate">
) {
  const explicit = asDate(enrolment.paidThroughDate) ?? asDate(enrolment.paidThroughDateComputed);
  if (explicit) return brisbaneStartOfDay(explicit);
  const start = asDate(enrolment.startDate);
  if (!start) return null;
  if (enrolment.endDate && isAfter(brisbaneStartOfDay(start), brisbaneStartOfDay(enrolment.endDate))) return null;
  return brisbaneStartOfDay(start);
}

function resolveNextWeeklyDueDate(enrolment: EnrolmentWithPlanTemplate, paidThrough: Date | null) {
  if (!enrolment.template || !paidThrough) return null;
  const start = addDaysUtc(paidThrough, 1);
  const next = nextOccurrenceOnOrAfter(start, enrolment.template.dayOfWeek);
  if (!next) return null;
  if (enrolment.endDate && isAfter(next, enrolment.endDate)) return null;
  return next;
}

function resolveNextWeeklyDueDateLocal(enrolment: EnrolmentWithPlanTemplate, paidThrough: Date | null) {
  if (!enrolment.template || !paidThrough) return null;
  const start = addDays(normalizeToLocalMidnight(paidThrough), 1);
  const next = nextOccurrenceOnOrAfterLocal(start, enrolment.template.dayOfWeek);
  if (!next) return null;
  if (enrolment.endDate && isAfter(next, normalizeToLocalMidnight(enrolment.endDate))) return null;
  return next;
}

async function computeCreditPaidThroughInternal(
  tx: Prisma.TransactionClient,
  enrolment: EnrolmentWithPlanTemplate,
  asOfDate: Date
): Promise<EnrolmentBillingSnapshot> {
  const today = normalizeDate(asOfDate);

  await ensureConsumptionEvents(tx, enrolment, today);

  const balance = await updateCachedCreditBalance(tx, enrolment.id, today);

  const explicitPaidThrough = asDate(enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed);
  const explicitPaidThroughNormalized = explicitPaidThrough ? normalizeDate(explicitPaidThrough) : null;
  const startWindow = isAfter(today, enrolment.startDate) ? today : normalizeDate(enrolment.startDate);
  const endWindow = enrolment.endDate ? normalizeDate(enrolment.endDate) : null;
  const cadence = sessionsPerWeek(enrolment.plan);
  const assignedTemplates = resolveAssignedTemplates(enrolment);
  const anchorTemplate = assignedTemplates[0] ?? enrolment.template;
  if (!anchorTemplate) {
    return {
      enrolmentId: enrolment.id,
      billingType: enrolment.plan?.billingType ?? null,
      paidThroughDate: null,
      nextPaymentDueDate: null,
      remainingCredits: balance,
      coveredOccurrences: 0,
      sessionsPerWeek: sessionsPerWeek(enrolment.plan),
    };
  }
  const occurrencesNeeded = Math.max(balance + cadence, 1);
  const horizon = resolveOccurrenceHorizon({
    startDate: startWindow,
    endDate: endWindow,
    occurrencesNeeded,
    sessionsPerWeek: cadence,
  });
  const cancellations = await tx.classCancellation.findMany({
    where: {
      templateId: anchorTemplate.id,
      date: {
        gte: startWindow,
        lte: horizon,
      },
    },
    select: { templateId: true, date: true },
  });

  const holidayStart = brisbaneStartOfDay(startWindow);
  const holidayEnd = brisbaneStartOfDay(horizon);
  const holidays = await tx.holiday.findMany({
    where: {
      startDate: { lte: holidayEnd },
      endDate: { gte: holidayStart },
    },
    select: { startDate: true, endDate: true },
  });

  const calculation = calculatePaidThroughDate({
    startDate: startWindow,
    endDate: horizon,
    creditsToCover: balance,
    classTemplate: {
      dayOfWeek: anchorTemplate.dayOfWeek ?? null,
      startTime: anchorTemplate.startTime ?? null,
    },
    holidays,
    cancellations: cancellations.map((c) => c.date),
  });

  const paidThroughDate =
    explicitPaidThroughNormalized &&
    (!calculation.paidThroughDate || isAfter(explicitPaidThroughNormalized, calculation.paidThroughDate))
      ? explicitPaidThroughNormalized
      : calculation.paidThroughDate;

  const nextPaymentDueDate = calculation.nextDueDate;

  return {
    enrolmentId: enrolment.id,
    billingType: enrolment.plan?.billingType ?? null,
    paidThroughDate,
    nextPaymentDueDate,
    remainingCredits: calculation.remainingCredits,
    coveredOccurrences: calculation.coveredOccurrences,
    sessionsPerWeek: sessionsPerWeek(enrolment.plan),
  };
}

async function computeBillingSnapshot(
  tx: Prisma.TransactionClient,
  enrolment: EnrolmentWithPlanTemplate,
  asOfDate: Date
): Promise<EnrolmentBillingSnapshot> {
  if (!enrolment.plan) {
    return {
      enrolmentId: enrolment.id,
      billingType: null,
      paidThroughDate: null,
      nextPaymentDueDate: null,
      remainingCredits: null,
      coveredOccurrences: 0,
      sessionsPerWeek: 1,
    };
  }

  if (enrolment.plan.billingType === BillingType.PER_WEEK) {
    const paidThrough = getWeeklyPaidThrough(enrolment);
    const nextDue = resolveNextWeeklyDueDate(enrolment, paidThrough);
    return {
      enrolmentId: enrolment.id,
      billingType: enrolment.plan.billingType,
      paidThroughDate: paidThrough,
      nextPaymentDueDate: nextDue,
      remainingCredits: null,
      coveredOccurrences: 0,
      sessionsPerWeek: sessionsPerWeek(enrolment.plan),
    };
  }

  return computeCreditPaidThroughInternal(tx, enrolment, asOfDate);
}

async function persistSnapshot(tx: Prisma.TransactionClient, snapshot: EnrolmentBillingSnapshot) {
  await tx.enrolment.update({
    where: { id: snapshot.enrolmentId },
    data: {
      paidThroughDateComputed: snapshot.paidThroughDate ?? undefined,
      nextDueDateComputed: snapshot.nextPaymentDueDate,
      creditsBalanceCached: snapshot.remainingCredits ?? undefined,
      creditsRemaining: snapshot.remainingCredits ?? undefined,
      ...(snapshot.paidThroughDate
        ? { paidThroughDate: snapshot.paidThroughDate }
        : {}),
    },
  });
}

export async function recomputeEnrolmentComputedFields(
  enrolmentId: string,
  options?: { asOfDate?: Date; client?: PrismaClientOrTx }
): Promise<EnrolmentBillingSnapshot> {
  const asOf = options?.asOfDate ? normalizeDate(options.asOfDate) : normalizeDate(new Date());

  return withTx(options?.client, async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });
    if (!enrolment) {
      throw new Error("Enrolment not found");
    }

    const snapshot = await computeBillingSnapshot(tx, enrolment, asOf);
    await persistSnapshot(tx, snapshot);
    return snapshot;
  });
}

export async function getEnrolmentBillingStatus(
  enrolmentId: string,
  options?: { asOfDate?: Date; client?: PrismaClientOrTx }
): Promise<EnrolmentBillingSnapshot> {
  return recomputeEnrolmentComputedFields(enrolmentId, options);
}

export async function getBillingStatusForEnrolments(
  enrolmentIds: string[],
  options?: { asOfDate?: Date; client?: PrismaClientOrTx }
) {
  if (!enrolmentIds.length) return new Map<string, EnrolmentBillingSnapshot>();
  const asOf = options?.asOfDate ? normalizeDate(options.asOfDate) : normalizeDate(new Date());

  return withTx(options?.client, async (tx) => {
    const enrolments = await tx.enrolment.findMany({
      where: { id: { in: enrolmentIds } },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });

    const map = new Map<string, EnrolmentBillingSnapshot>();
    for (const enrolment of enrolments) {
      const snapshot = await computeBillingSnapshot(tx, enrolment, asOf);
      await persistSnapshot(tx, snapshot);
      map.set(enrolment.id, snapshot);
    }
    return map;
  });
}

export async function registerCancellationCredit(
  adjustment: Prisma.EnrolmentAdjustmentGetPayload<{ include: { enrolment: { include: { plan: true; template: true } } } }>,
  options?: { client?: PrismaClientOrTx }
) {
  return withTx(options?.client, async (tx) => {
    if (adjustment.type !== EnrolmentAdjustmentType.CANCELLATION_CREDIT) return;
    if (!adjustment.enrolment.plan) return;
    if (adjustment.enrolment.plan.billingType === BillingType.PER_WEEK && adjustment.paidThroughDeltaDays) {
      const base = normalizeDate(adjustment.enrolment.paidThroughDate ?? adjustment.date);
      const next = addDaysUtc(base, adjustment.paidThroughDeltaDays);
      await tx.enrolment.update({
        where: { id: adjustment.enrolmentId },
        data: { paidThroughDate: next },
      });
      await getEnrolmentBillingStatus(adjustment.enrolmentId, { client: tx });
      return;
    }

    if (adjustment.creditsDelta) {
      await recordCreditEvent(tx, {
        enrolmentId: adjustment.enrolmentId,
        type: EnrolmentCreditEventType.CANCELLATION_CREDIT,
        creditsDelta: adjustment.creditsDelta,
        occurredOn: adjustment.date,
        note: adjustment.note ?? "Class cancelled",
        adjustmentId: adjustment.id,
      });
      await getEnrolmentBillingStatus(adjustment.enrolmentId, { client: tx });
    }
  });
}

export async function removeCancellationCredit(
  adjustment: Prisma.EnrolmentAdjustmentGetPayload<{ include: { enrolment: { include: { plan: true; template: true } } } }>,
  options?: { client?: PrismaClientOrTx }
) {
  return withTx(options?.client, async (tx) => {
    if (!adjustment.enrolment.plan) return;

    if (adjustment.enrolment.plan.billingType === BillingType.PER_WEEK && adjustment.paidThroughDeltaDays) {
      const current = normalizeDate(adjustment.enrolment.paidThroughDate ?? adjustment.date);
      const next = addDaysUtc(current, -adjustment.paidThroughDeltaDays);
      const minDate = adjustment.enrolment.startDate ? normalizeDate(adjustment.enrolment.startDate) : null;
      const safeDate = minDate && next < minDate ? minDate : next;
      await tx.enrolment.update({
        where: { id: adjustment.enrolmentId },
        data: { paidThroughDate: safeDate },
      });
    } else {
      await tx.enrolmentCreditEvent.deleteMany({
        where: { enrolmentId: adjustment.enrolmentId, adjustmentId: adjustment.id },
      });
      await updateCachedCreditBalance(tx, adjustment.enrolmentId);
    }

    await getEnrolmentBillingStatus(adjustment.enrolmentId, { client: tx });
  });
}

export async function registerCreditConsumptionForDate(
  params: { templateId: string; studentId: string; date: Date; attendanceId?: string },
  options?: { client?: PrismaClientOrTx }
) {
  const { templateId, studentId, date, attendanceId } = params;
  const when = normalizeDate(date);

  return withTx(options?.client, async (tx) => {
    const enrolment = await tx.enrolment.findFirst({
      where: {
        studentId,
        status: EnrolmentStatus.ACTIVE,
        startDate: { lte: when },
        OR: [{ endDate: null }, { endDate: { gte: when } }],
        AND: [
          {
            OR: [
              { templateId },
              { classAssignments: { some: { templateId } } },
            ],
          },
        ],
      },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });
    if (!enrolment?.plan || enrolment.plan.billingType !== BillingType.PER_CLASS) {
      return;
    }

    const cancelled = await tx.classCancellation.findUnique({
      where: { templateId_date: { templateId, date: when } },
    });
    if (cancelled) return;

    const existing = await tx.enrolmentCreditEvent.findFirst({
      where: { enrolmentId: enrolment.id, type: EnrolmentCreditEventType.CONSUME, occurredOn: when },
    });
    if (existing) return;

    await recordCreditEvent(tx, {
      enrolmentId: enrolment.id,
      type: EnrolmentCreditEventType.CONSUME,
      creditsDelta: -1,
      occurredOn: when,
      note: "Attendance consumption",
      attendanceId: attendanceId ?? null,
    });

    await getEnrolmentBillingStatus(enrolment.id, { client: tx });
  });
}

export async function getFamilyEnrolmentBillingStatus(
  familyId: string,
  options?: { client?: PrismaClientOrTx }
) {
  return withTx(options?.client, async (tx) => {
    const enrolments = await tx.enrolment.findMany({
      where: { student: { familyId } },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });
    const map = new Map<string, EnrolmentBillingSnapshot>();
    const asOf = normalizeDate(new Date());
    for (const enrolment of enrolments) {
      const snapshot = await computeBillingSnapshot(tx, enrolment, asOf);
      await persistSnapshot(tx, snapshot);
      map.set(enrolment.id, snapshot);
    }
    return map;
  });
}

export async function refreshBillingForOpenEnrolments(options?: { client?: PrismaClientOrTx }) {
  return withTx(options?.client, async (tx) => {
    const today = normalizeDate(new Date());
    const enrolments = await tx.enrolment.findMany({
      where: {
        status: EnrolmentStatus.ACTIVE,
        planId: { not: null },
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });

    for (const enrolment of enrolments) {
      const snapshot = await computeBillingSnapshot(tx, enrolment, today);
      await persistSnapshot(tx, snapshot);
    }
  });
}
