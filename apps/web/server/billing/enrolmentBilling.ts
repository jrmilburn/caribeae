"use server";

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

import { addDays, addWeeks, isAfter, startOfDay } from "date-fns";
import {
  BillingType,
  EnrolmentAdjustmentType,
  EnrolmentCreditEventType,
  EnrolmentStatus,
  InvoiceLineItemKind,
  InvoiceStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type PrismaClientOrTx = Prisma.PrismaClient | Prisma.TransactionClient;

type EnrolmentWithPlanTemplate = Prisma.EnrolmentGetPayload<{
  include: {
    plan: true;
    template: true;
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
  if (typeof (candidate as Prisma.PrismaClient).$transaction === "function") {
    return (candidate as Prisma.PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(candidate as Prisma.TransactionClient);
}

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(date: Date) {
  const d = startOfDay(date);
  return d.toISOString().slice(0, 10);
}

function normalizeDate(value: Date | string) {
  return startOfDay(value instanceof Date ? value : new Date(value));
}

function sessionsPerWeek(plan: Prisma.EnrolmentPlan | null | undefined) {
  if (!plan) return 1;
  const count = plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
  return count;
}

function nextOccurrenceOnOrAfter(start: Date, templateDayOfWeek: number | null | undefined) {
  if (templateDayOfWeek == null) return null;
  const target = ((templateDayOfWeek % 7) + 7) % 7; // 0 = Monday
  let cursor = startOfDay(start);
  while (cursor.getDay() !== ((target + 1) % 7)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

async function updateCachedCreditBalance(
  tx: Prisma.TransactionClient,
  enrolmentId: string,
  asOf?: Date | null
) {
  const where: Prisma.EnrolmentCreditEventWhereInput = { enrolmentId };
  if (asOf) {
    where.occurredOn = { lte: startOfDay(asOf) };
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
  if (![BillingType.BLOCK, BillingType.PER_CLASS].includes(enrolment.plan.billingType)) return;

  const windowEnd = enrolment.endDate && isAfter(startOfDay(enrolment.endDate), startOfDay(throughDate))
    ? startOfDay(throughDate)
    : enrolment.endDate
      ? startOfDay(enrolment.endDate)
      : startOfDay(throughDate);

  if (isAfter(startOfDay(enrolment.startDate), windowEnd)) return;

  const cancellations = await tx.classCancellation.findMany({
    where: {
      templateId: enrolment.templateId,
      date: { gte: startOfDay(enrolment.startDate), lte: windowEnd },
    },
    select: { date: true },
  });
  const cancelledSet = new Set(cancellations.map((c) => dateKey(c.date)));

  const existing = await tx.enrolmentCreditEvent.findMany({
    where: {
      enrolmentId: enrolment.id,
      type: EnrolmentCreditEventType.CONSUME,
      occurredOn: { gte: startOfDay(enrolment.startDate), lte: windowEnd },
    },
    select: { occurredOn: true },
  });
  const existingSet = new Set(existing.map((e) => dateKey(e.occurredOn)));

  let occurrence = nextOccurrenceOnOrAfter(startOfDay(enrolment.startDate), enrolment.template.dayOfWeek);
  const toCreate: Date[] = [];

  while (occurrence && !isAfter(occurrence, windowEnd)) {
    const key = dateKey(occurrence);
    if (!cancelledSet.has(key) && !existingSet.has(key)) {
      toCreate.push(occurrence);
    }
    occurrence = addDays(occurrence, 7);
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
  if (explicit) return startOfDay(explicit);
  const start = asDate(enrolment.startDate);
  if (!start) return null;
  if (enrolment.endDate && isAfter(startOfDay(start), startOfDay(enrolment.endDate))) return null;
  return startOfDay(start);
}

function resolveNextWeeklyDueDate(enrolment: EnrolmentWithPlanTemplate, paidThrough: Date | null) {
  if (!enrolment.template || !paidThrough) return null;
  const start = addDays(paidThrough, 1);
  const next = nextOccurrenceOnOrAfter(start, enrolment.template.dayOfWeek);
  if (!next) return null;
  if (enrolment.endDate && isAfter(next, enrolment.endDate)) return null;
  return next;
}

async function computeCreditPaidThroughInternal(
  tx: Prisma.TransactionClient,
  enrolment: EnrolmentWithPlanTemplate,
  asOfDate: Date
): Promise<EnrolmentBillingSnapshot> {
  const today = startOfDay(asOfDate);

  await ensureConsumptionEvents(tx, enrolment, today);

  const balance = await updateCachedCreditBalance(tx, enrolment.id, today);

  const startWindow = isAfter(today, enrolment.startDate) ? today : startOfDay(enrolment.startDate);
  const endWindow = enrolment.endDate ? startOfDay(enrolment.endDate) : null;
  const horizon = endWindow ?? addDays(startWindow, Math.max(balance, 1) * 7 + 28);
  const cancelled = await tx.classCancellation.findMany({
    where: {
      templateId: enrolment.templateId,
      date: {
        gte: startWindow,
        lte: horizon,
      },
    },
    select: { date: true },
  });
  const cancelledSet = new Set(cancelled.map((c) => dateKey(c.date)));

  let remaining = balance;
  let coveredOccurrences = 0;
  let paidThrough: Date | null = null;
  let nextDue: Date | null = null;

  const firstOccurrence = nextOccurrenceOnOrAfter(startWindow, enrolment.template.dayOfWeek);
  let occurrence = firstOccurrence;

  while (occurrence && !isAfter(occurrence, horizon)) {
    if (cancelledSet.has(dateKey(occurrence))) {
      occurrence = addDays(occurrence, 7);
      continue;
    }

    if (remaining <= 0) {
      nextDue = occurrence;
      break;
    }

    remaining -= 1;
    coveredOccurrences += 1;
    paidThrough = occurrence;
    occurrence = addDays(occurrence, 7);
  }

  return {
    enrolmentId: enrolment.id,
    billingType: enrolment.plan?.billingType ?? null,
    paidThroughDate: paidThrough,
    nextPaymentDueDate: nextDue,
    remainingCredits: remaining,
    coveredOccurrences,
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
      paidThroughDateComputed: snapshot.paidThroughDate,
      nextDueDateComputed: snapshot.nextPaymentDueDate,
      creditsBalanceCached: snapshot.remainingCredits ?? undefined,
      creditsRemaining: snapshot.remainingCredits ?? undefined,
    },
  });
}

export async function getEnrolmentBillingStatus(
  enrolmentId: string,
  options?: { asOfDate?: Date; client?: PrismaClientOrTx }
): Promise<EnrolmentBillingSnapshot> {
  const asOf = options?.asOfDate ? startOfDay(options.asOfDate) : startOfDay(new Date());

  return withTx(options?.client, async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { plan: true, template: true },
    });
    if (!enrolment) {
      throw new Error("Enrolment not found");
    }

    const snapshot = await computeBillingSnapshot(tx, enrolment, asOf);
    await persistSnapshot(tx, snapshot);
    return snapshot;
  });
}

export async function getBillingStatusForEnrolments(
  enrolmentIds: string[],
  options?: { asOfDate?: Date; client?: PrismaClientOrTx }
) {
  if (!enrolmentIds.length) return new Map<string, EnrolmentBillingSnapshot>();
  const asOf = options?.asOfDate ? startOfDay(options.asOfDate) : startOfDay(new Date());

  return withTx(options?.client, async (tx) => {
    const enrolments = await tx.enrolment.findMany({
      where: { id: { in: enrolmentIds } },
      include: { plan: true, template: true },
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

export async function applyEntitlementsForInvoice(
  invoiceId: string,
  options?: { client?: PrismaClientOrTx }
) {
  return withTx(options?.client, async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        enrolment: { include: { plan: true, template: true } },
        lineItems: { select: { kind: true, quantity: true } },
      },
    });

    if (!invoice?.enrolment?.plan) return invoice;
    const hasEnrolmentItem = invoice.lineItems.some((li) => li.kind === InvoiceLineItemKind.ENROLMENT);
    if (!hasEnrolmentItem) return invoice;
    if (invoice.status !== InvoiceStatus.PAID) return invoice;

    const plan = invoice.enrolment.plan;
    const enrolmentStart = startOfDay(invoice.enrolment.startDate);
    const enrolmentEnd = invoice.enrolment.endDate ? startOfDay(invoice.enrolment.endDate) : null;
    const enrolmentItemsQuantity = invoice.lineItems
      .filter((li) => li.kind === InvoiceLineItemKind.ENROLMENT)
      .reduce((sum, li) => sum + (li.quantity ?? 1), 0);

    if (plan.billingType === BillingType.PER_WEEK && invoice.coverageEnd) {
      await tx.enrolment.update({
        where: { id: invoice.enrolment.id },
        data: { paidThroughDate: invoice.coverageEnd },
      });
    } else if ([BillingType.BLOCK, BillingType.PER_CLASS].includes(plan.billingType)) {
      if (invoice.creditsPurchased) {
        await recordCreditEvent(tx, {
          enrolmentId: invoice.enrolment.id,
          type: EnrolmentCreditEventType.PURCHASE,
          creditsDelta: invoice.creditsPurchased,
          occurredOn: invoice.paidAt ?? new Date(),
          note: "Invoice paid",
          invoiceId: invoice.id,
        });
      }

      const classesPerBlock =
        plan.blockClassCount && plan.blockClassCount > 0
          ? plan.blockClassCount
          : plan.blockLength && plan.blockLength > 0
            ? plan.blockLength
            : 1;
      const totalClasses = classesPerBlock * Math.max(enrolmentItemsQuantity, 1);
      const rawPaidThrough = addWeeks(enrolmentStart, totalClasses);
      const boundedPaidThrough = enrolmentEnd && isAfter(rawPaidThrough, enrolmentEnd) ? enrolmentEnd : rawPaidThrough;
      await tx.enrolment.update({
        where: { id: invoice.enrolment.id },
        data: { paidThroughDate: boundedPaidThrough },
      });
    }

    await getEnrolmentBillingStatus(invoice.enrolment.id, { client: tx });
    return invoice;
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
      const base = startOfDay(adjustment.enrolment.paidThroughDate ?? adjustment.date);
      const next = addDays(base, adjustment.paidThroughDeltaDays);
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
      const current = startOfDay(adjustment.enrolment.paidThroughDate ?? adjustment.date);
      const next = addDays(current, -adjustment.paidThroughDeltaDays);
      const minDate = adjustment.enrolment.startDate ? startOfDay(adjustment.enrolment.startDate) : null;
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
        templateId,
        studentId,
        status: EnrolmentStatus.ACTIVE,
        startDate: { lte: when },
        OR: [{ endDate: null }, { endDate: { gte: when } }],
      },
      include: { plan: true, template: true },
    });
    if (!enrolment?.plan || ![BillingType.BLOCK, BillingType.PER_CLASS].includes(enrolment.plan.billingType)) {
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
      include: { plan: true, template: true },
    });
    const map = new Map<string, EnrolmentBillingSnapshot>();
    const asOf = startOfDay(new Date());
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
    const today = startOfDay(new Date());
    const enrolments = await tx.enrolment.findMany({
      where: {
        status: EnrolmentStatus.ACTIVE,
        planId: { not: null },
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: { plan: true, template: true },
    });

    for (const enrolment of enrolments) {
      const snapshot = await computeBillingSnapshot(tx, enrolment, today);
      await persistSnapshot(tx, snapshot);
    }
  });
}
