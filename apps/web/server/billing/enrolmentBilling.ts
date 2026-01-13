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
 * - server/holiday/createHoliday|updateHoliday|deleteHoliday -> recomputeHolidayEnrolments -> recalculateEnrolmentCoverage
 * - server/enrolment/changeEnrolment (schedule modal) -> recalculateEnrolmentCoverage
 * - server/invoicing/coverage.ts + applyPaidInvoiceToEnrolment.ts (weekly coverage windows)
 * - server/billing/recalculateEnrolmentCoverage (authoritative paidThrough recompute)
 *
 * Coverage meaning of paidThroughDate:
 * - The Brisbane calendar day of the last entitled session under the enrolment's current class assignments,
 *   after skipping holidays. paidThroughDateComputed stores the raw coverage boundary (no holiday skipping).
 *
 * Authoritative functions:
 * - computeCoverageEndDay (server/billing/coverageEngine)
 * - recalculateEnrolmentCoverage (server/billing/recalculateEnrolmentCoverage)
 * - resolveWeeklyCoverageWindow (server/invoicing/coverage)
 */

import { addDays, isAfter } from "date-fns";

import { prisma } from "@/lib/prisma";
import { normalizeToLocalMidnight } from "@/lib/dateUtils";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { buildOccurrenceSchedule, consumeOccurrencesForCredits, resolveOccurrenceHorizon } from "./occurrenceWalker";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { buildMissedOccurrencePredicate } from "./missedOccurrence";

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

type CoverageTemplate = {
  id: string;
  dayOfWeek: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  levelId?: string | null;
};

type CoverageData = {
  holidays: Array<{ startDate: Date; endDate: Date; levelId?: string | null; templateId?: string | null }>;
  cancellations: Array<{ templateId: string; date: Date }>;
  missedOccurrencePredicate: (templateId: string, dayKey: string) => boolean;
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

function uniqueTemplates(templates: CoverageTemplate[]) {
  const map = new Map<string, CoverageTemplate>();
  templates.forEach((template) => {
    map.set(template.id, template);
  });
  return Array.from(map.values());
}

function buildCoverageTemplates(enrolment: EnrolmentWithPlanTemplate): CoverageTemplate[] {
  const templates = resolveAssignedTemplates(enrolment);
  return uniqueTemplates(
    templates.map((template) => ({
      id: template.id,
      dayOfWeek: template.dayOfWeek ?? null,
      startDate: template.startDate ?? null,
      endDate: template.endDate ?? null,
      levelId: template.levelId ?? null,
    }))
  );
}

async function loadCoverageData(
  tx: Prisma.TransactionClient,
  params: { templates: CoverageTemplate[]; startDate: Date; endDate: Date }
): Promise<CoverageData> {
  const templateIds = params.templates.map((template) => template.id);
  const levelIds = params.templates.map((template) => template.levelId ?? null);

  const holidayStart = brisbaneStartOfDay(params.startDate);
  const holidayEnd = brisbaneStartOfDay(params.endDate);

  const [holidays, cancellations] = await Promise.all([
    tx.holiday.findMany({
      where: {
        startDate: { lte: holidayEnd },
        endDate: { gte: holidayStart },
        ...buildHolidayScopeWhere({ templateIds, levelIds }),
      },
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
    }),
    tx.classCancellation.findMany({
      where: {
        templateId: { in: templateIds },
        date: { gte: normalizeDate(params.startDate), lte: normalizeDate(params.endDate) },
      },
      select: { templateId: true, date: true },
    }),
  ]);

  const templatesById = new Map(
    params.templates.map((template) => [template.id, { id: template.id, levelId: template.levelId ?? null }])
  );

  const missedOccurrencePredicate = buildMissedOccurrencePredicate({
    templatesById,
    holidays,
    cancellations,
  });

  return { holidays, cancellations, missedOccurrencePredicate };
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
  throughDate: Date,
  options?: { templates?: CoverageTemplate[]; coverageData?: CoverageData }
) {
  if (!enrolment.plan || !enrolment.template) return;
  if (enrolment.plan.billingType !== BillingType.PER_CLASS) return;

  const assignedTemplates = options?.templates ?? buildCoverageTemplates(enrolment);
  if (!assignedTemplates.length) return;

  const windowEnd = enrolment.endDate && isAfter(normalizeDate(enrolment.endDate), normalizeDate(throughDate))
    ? normalizeDate(throughDate)
    : enrolment.endDate
      ? normalizeDate(enrolment.endDate)
      : normalizeDate(throughDate);

  if (isAfter(normalizeDate(enrolment.startDate), windowEnd)) return;

  const coverageData =
    options?.coverageData ??
    (await loadCoverageData(tx, {
      templates: assignedTemplates,
      startDate: enrolment.startDate,
      endDate: windowEnd,
    }));

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

  const scheduled = buildOccurrenceSchedule({
    startDate: enrolment.startDate,
    endDate: windowEnd,
    templates: assignedTemplates.map((template) => ({
      templateId: template.id,
      dayOfWeek: template.dayOfWeek,
      startDate: template.startDate ?? null,
      endDate: template.endDate ?? null,
    })),
    cancellations: [],
    occurrencesNeeded: 1,
    sessionsPerWeek: sessionsPerWeek(enrolment.plan),
    horizon: windowEnd,
    shouldSkipOccurrence: ({ templateId, date }) =>
      coverageData.missedOccurrencePredicate(templateId, toBrisbaneDayKey(date)),
  });

  const occurrenceCounts = new Map<string, number>();
  for (const occurrence of scheduled) {
    const key = dateKey(occurrence);
    occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1);
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

  const assignedTemplates = buildCoverageTemplates(enrolment);
  if (!assignedTemplates.length) {
    return {
      enrolmentId: enrolment.id,
      billingType: enrolment.plan?.billingType ?? null,
      paidThroughDate: null,
      nextPaymentDueDate: null,
      remainingCredits: null,
      coveredOccurrences: 0,
      sessionsPerWeek: sessionsPerWeek(enrolment.plan),
    };
  }

  const startWindow = isAfter(today, enrolment.startDate) ? today : normalizeDate(enrolment.startDate);
  const endWindow = enrolment.endDate ? normalizeDate(enrolment.endDate) : null;
  const cadence = sessionsPerWeek(enrolment.plan);

  const consumptionEnd =
    enrolment.endDate && isAfter(normalizeDate(enrolment.endDate), today)
      ? today
      : enrolment.endDate
        ? normalizeDate(enrolment.endDate)
        : today;

  const coverageDataForConsumption = await loadCoverageData(tx, {
    templates: assignedTemplates,
    startDate: enrolment.startDate,
    endDate: consumptionEnd,
  });

  await ensureConsumptionEvents(tx, enrolment, today, {
    templates: assignedTemplates,
    coverageData: coverageDataForConsumption,
  });

  const balance = await updateCachedCreditBalance(tx, enrolment.id, today);

  const occurrencesNeeded = Math.max(balance + cadence, 1);
  const horizon = resolveOccurrenceHorizon({
    startDate: startWindow,
    endDate: endWindow,
    occurrencesNeeded,
    sessionsPerWeek: cadence,
  });

  const coverageData =
    !isAfter(horizon, consumptionEnd)
      ? coverageDataForConsumption
      : await loadCoverageData(tx, {
          templates: assignedTemplates,
          startDate: enrolment.startDate,
          endDate: horizon,
        });

  const occurrences = buildOccurrenceSchedule({
    startDate: startWindow,
    endDate: endWindow,
    templates: assignedTemplates.map((template) => ({
      templateId: template.id,
      dayOfWeek: template.dayOfWeek,
      startDate: template.startDate ?? null,
      endDate: template.endDate ?? null,
    })),
    cancellations: [],
    occurrencesNeeded: Math.max(balance + cadence, 1),
    sessionsPerWeek: cadence,
    horizon,
    shouldSkipOccurrence: ({ templateId, date }) =>
      coverageData.missedOccurrencePredicate(templateId, toBrisbaneDayKey(date)),
  });

  const walk = consumeOccurrencesForCredits({ occurrences, credits: balance });

  return {
    enrolmentId: enrolment.id,
    billingType: enrolment.plan?.billingType ?? null,
    paidThroughDate: walk.paidThrough ? brisbaneStartOfDay(walk.paidThrough) : null,
    nextPaymentDueDate: walk.nextDue ? brisbaneStartOfDay(walk.nextDue) : null,
    remainingCredits: walk.remaining,
    coveredOccurrences: walk.covered,
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

export async function computeBillingSnapshotForEnrolment(
  tx: Prisma.TransactionClient,
  enrolment: EnrolmentWithPlanTemplate,
  asOfDate: Date
) {
  return computeBillingSnapshot(tx, enrolment, asOfDate);
}

export async function persistBillingSnapshot(tx: Prisma.TransactionClient, snapshot: EnrolmentBillingSnapshot) {
  await persistSnapshot(tx, snapshot);
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
