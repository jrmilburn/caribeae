import { addDays, isAfter } from "date-fns";
import {
  BillingType,
  EnrolmentStatus,
  InvoiceLineItemKind,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  type EnrolmentPlan,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { calculateUnpaidBlocks } from "@/server/billing/familyBillingCalculations";
import { resolveCostPerClassCents } from "@/server/billing/classChangeSettlement";
import { buildOccurrenceSchedule, type OccurrenceCancellation, type OccurrenceTemplate } from "@/server/billing/occurrenceWalker";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { adjustCreditsForManualPaidThroughDate } from "@/server/billing/enrolmentBilling";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { isAlternatingWeekActiveOnDay } from "@/server/enrolment/occurrenceCadence";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
const OPEN_TRANSFER_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const;

export type EnrolmentTransferTemplateInput = {
  id: string;
  dayOfWeek: number | null;
  levelId: string | null;
  startDate: Date;
  endDate: Date | null;
  startTime?: number | null;
  name?: string | null;
};

export type PreviewEnrolmentTransferInput = {
  oldEnrolmentId: string;
  newPlanId: string;
  newTemplates: EnrolmentTransferTemplateInput[];
  transferEffectiveAt: Date;
  plannedEndDate?: Date | null;
  anchorTemplateId?: string | null;
  applyOverpaidCredit?: boolean;
  client?: PrismaClientOrTx;
};

export type ConfirmEnrolmentTransferInput = PreviewEnrolmentTransferInput & {
  idempotencyKey: string;
  takePaymentNow?: boolean;
  paymentMethod?: string;
  paymentNote?: string;
  paymentPaidAt?: Date;
};

type LoadedEnrolment = Prisma.EnrolmentGetPayload<{
  include: {
    plan: true;
    student: { select: { id: true; familyId: true; levelId: true; name: true } };
    template: { select: { id: true; dayOfWeek: true; levelId: true; startDate: true; endDate: true; startTime: true; name: true } };
    classAssignments: {
      include: {
        template: {
          select: {
            id: true;
            dayOfWeek: true;
            levelId: true;
            startDate: true;
            endDate: true;
            startTime: true;
            name: true;
          };
        };
      };
    };
  };
}>;

type LoadedPlan = EnrolmentPlan;

type OpenTransferInvoice = Prisma.InvoiceGetPayload<{
  include: {
    lineItems: {
      select: {
        id: true;
        kind: true;
        description: true;
        amountCents: true;
        quantity: true;
        unitPriceCents: true;
        enrolmentId: true;
        planId: true;
      };
    };
    allocations: {
      include: {
        payment: {
          select: {
            id: true;
            status: true;
            paidAt: true;
          };
        };
      };
    };
  };
}>;

type ReleasedAllocation = {
  paymentId: string;
  amountCents: number;
  paidAt: Date | null;
};

type OutstandingComputation = {
  outstandingCents: number;
  releasedPaymentCreditCents: number;
  releasedAllocations: ReleasedAllocation[];
  openInvoices: OpenTransferInvoice[];
};

type StoredTransferMetadata = {
  preview?: {
    oldOutstandingCents?: number;
    oldOverpaidCreditCents?: number;
    releasedPaymentCreditCents?: number;
    newBlockChargeCents?: number;
    totalDueTodayCents?: number;
    recommendedAllocations?: Partial<EnrolmentTransferAllocationPlan>;
  };
  oldTemplates?: Array<{ id?: string; name?: string; dayOfWeek?: number | null }>;
  newTemplates?: Array<{ id?: string; name?: string; dayOfWeek?: number | null }>;
};

type TransferPreviewInternal = {
  oldEnrolment: LoadedEnrolment;
  newPlan: LoadedPlan;
  transferEffectiveAt: Date;
  oldEnrolmentEndAt: Date;
  plannedEndDate: Date | null;
  anchorTemplateId: string;
  newTemplates: EnrolmentTransferTemplateInput[];
  oldOutstandingCents: number;
  oldOverpaidCreditCents: number;
  releasedPaymentCreditCents: number;
  newBlockChargeCents: number;
  oldPaidThroughDate: Date | null;
  oldTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
  newTemplateSummaries: Array<{ id: string; name: string; dayOfWeek: number | null }>;
  releasedAllocations: ReleasedAllocation[];
  openInvoices: OpenTransferInvoice[];
};

export type EnrolmentTransferAllocationPlan = {
  releasedPaymentToOldInvoiceCents: number;
  releasedPaymentToNewInvoiceCents: number;
  overpaidCreditToNewInvoiceCents: number;
  cashToOldInvoiceCents: number;
  cashToNewInvoiceCents: number;
};

export type EnrolmentTransferPreview = {
  oldEnrolmentId: string;
  newPlanId: string;
  transferEffectiveAt: Date;
  oldEnrolmentEndAt: Date;
  plannedEndDate: Date | null;
  oldPaidThroughDate: Date | null;
  oldOutstandingCents: number;
  oldOverpaidCreditCents: number;
  releasedPaymentCreditCents: number;
  newBlockChargeCents: number;
  totalDueTodayCents: number;
  creditAppliedToNewInvoiceCents: number;
  oldTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
  newTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
  recommendedAllocations: EnrolmentTransferAllocationPlan;
};

export type EnrolmentTransferConfirmResult = {
  transferId: string;
  oldEnrolmentId: string;
  newEnrolmentId: string;
  familyId: string | null;
  oldInvoiceId: string | null;
  newInvoiceId: string | null;
  creditPaymentId: string | null;
  paymentId: string | null;
  preview: EnrolmentTransferPreview;
};

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

function asDay(value: Date) {
  return brisbaneStartOfDay(value);
}

function resolveEnrolmentTemplates(enrolment: Pick<LoadedEnrolment, "template" | "classAssignments">) {
  if (enrolment.classAssignments.length) {
    return enrolment.classAssignments
      .map((assignment) => assignment.template)
      .filter((template): template is NonNullable<typeof template> => Boolean(template));
  }
  return enrolment.template ? [enrolment.template] : [];
}

function resolveTransferEndDate(oldEnrolment: Pick<LoadedEnrolment, "startDate">, transferEffectiveAt: Date) {
  const requestedEnd = addDays(asDay(transferEffectiveAt), -1);
  const enrolmentStart = asDay(oldEnrolment.startDate);
  return requestedEnd < enrolmentStart ? enrolmentStart : requestedEnd;
}

function resolvePaidThrough(enrolment: Pick<LoadedEnrolment, "paidThroughDate" | "paidThroughDateComputed">) {
  return enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null;
}

function resolveInitialBlockChargeCents(plan: Pick<LoadedPlan, "billingType" | "priceCents">) {
  return plan.billingType === BillingType.PER_CLASS ? plan.priceCents : plan.priceCents;
}

function summarizeTemplates(templates: Array<{ id: string; name?: string | null; dayOfWeek?: number | null }>) {
  return templates.map((template) => ({
    id: template.id,
    name: template.name?.trim() || "Class",
    dayOfWeek: template.dayOfWeek ?? null,
  }));
}

function buildAllocationPlan(params: {
  oldOutstandingCents: number;
  oldOverpaidCreditCents: number;
  releasedPaymentCreditCents: number;
  newBlockChargeCents: number;
  applyOverpaidCredit: boolean;
}) {
  let remainingOld = params.oldOutstandingCents;
  let remainingNew = params.newBlockChargeCents;
  let releasedRemaining = params.releasedPaymentCreditCents;

  const releasedPaymentToOldInvoiceCents = Math.min(releasedRemaining, remainingOld);
  releasedRemaining -= releasedPaymentToOldInvoiceCents;
  remainingOld -= releasedPaymentToOldInvoiceCents;

  const releasedPaymentToNewInvoiceCents = Math.min(releasedRemaining, remainingNew);
  releasedRemaining -= releasedPaymentToNewInvoiceCents;
  remainingNew -= releasedPaymentToNewInvoiceCents;

  const overpaidCreditToNewInvoiceCents = params.applyOverpaidCredit
    ? Math.min(params.oldOverpaidCreditCents, remainingNew)
    : 0;
  remainingNew -= overpaidCreditToNewInvoiceCents;

  return {
    recommendedAllocations: {
      releasedPaymentToOldInvoiceCents,
      releasedPaymentToNewInvoiceCents,
      overpaidCreditToNewInvoiceCents,
      cashToOldInvoiceCents: remainingOld,
      cashToNewInvoiceCents: remainingNew,
    },
    creditAppliedToNewInvoiceCents: overpaidCreditToNewInvoiceCents,
    totalDueTodayCents: remainingOld + remainingNew,
  };
}

async function withTransaction<T>(
  client: PrismaClientOrTx | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
) {
  const candidate = client ?? prisma;
  if (typeof (candidate as PrismaClient).$transaction === "function") {
    return (candidate as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(candidate as Prisma.TransactionClient);
}

async function loadTransferContext(tx: Prisma.TransactionClient, input: PreviewEnrolmentTransferInput) {
  const [oldEnrolment, newPlan] = await Promise.all([
    tx.enrolment.findUnique({
      where: { id: input.oldEnrolmentId },
      include: {
        plan: true,
        student: { select: { id: true, familyId: true, levelId: true, name: true } },
        template: { select: { id: true, dayOfWeek: true, levelId: true, startDate: true, endDate: true, startTime: true, name: true } },
        classAssignments: {
          include: {
            template: {
              select: {
                id: true,
                dayOfWeek: true,
                levelId: true,
                startDate: true,
                endDate: true,
                startTime: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    tx.enrolmentPlan.findUnique({ where: { id: input.newPlanId } }),
  ]);

  if (!oldEnrolment) {
    throw new Error("Enrolment not found.");
  }
  if (!oldEnrolment.plan) {
    throw new Error("Enrolment plan missing.");
  }
  if (!newPlan) {
    throw new Error("Target enrolment plan not found.");
  }
  if (!input.newTemplates.length) {
    throw new Error("Select at least one new class.");
  }

  const transferEffectiveAt = asDay(input.transferEffectiveAt);
  const oldEnrolmentEndAt = resolveTransferEndDate(oldEnrolment, transferEffectiveAt);
  const anchorTemplateId =
    input.anchorTemplateId ??
    input.newTemplates
      .slice()
      .sort((left, right) => {
        const dayA = left.dayOfWeek ?? 7;
        const dayB = right.dayOfWeek ?? 7;
        if (dayA !== dayB) return dayA - dayB;
        return left.id.localeCompare(right.id);
      })[0]?.id;

  if (!anchorTemplateId) {
    throw new Error("Unable to resolve the new enrolment anchor class.");
  }

  return {
    oldEnrolment,
    newPlan,
    transferEffectiveAt,
    oldEnrolmentEndAt,
    plannedEndDate: input.plannedEndDate ? asDay(input.plannedEndDate) : null,
    anchorTemplateId,
  };
}

async function loadScheduleContext(
  tx: Prisma.TransactionClient,
  params: {
    templates: EnrolmentTransferTemplateInput[];
    startDate: Date;
    endDate: Date;
  }
) {
  const templateIds = params.templates.map((template) => template.id);
  const levelIds = params.templates.map((template) => template.levelId ?? null);

  const [holidays, cancellations] = await Promise.all([
    tx.holiday.findMany({
      where: {
        startDate: { lte: params.endDate },
        endDate: { gte: params.startDate },
        ...buildHolidayScopeWhere({ templateIds, levelIds }),
      },
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
    }),
    tx.classCancellation.findMany({
      where: {
        templateId: { in: templateIds },
        date: { gte: params.startDate, lte: params.endDate },
      },
      select: { templateId: true, date: true },
    }),
  ]);

  return { holidays, cancellations };
}

function buildOccurrenceTemplates(templates: EnrolmentTransferTemplateInput[]): OccurrenceTemplate[] {
  return templates.map((template) => ({
    templateId: template.id,
    dayOfWeek: template.dayOfWeek,
    startDate: template.startDate,
    endDate: template.endDate,
  }));
}

function shouldSkipAlternatingWeekOccurrence(
  plan: Pick<LoadedPlan, "alternatingWeeks">,
  enrolmentStartDate: Date,
  template: EnrolmentTransferTemplateInput,
  date: Date
) {
  if (!plan.alternatingWeeks) return false;
  return !isAlternatingWeekActiveOnDay({
    enrolmentStartDate,
    classDate: date,
    classDayOfWeek: template.dayOfWeek,
  });
}

async function listBillableOccurrencesForTemplates(
  tx: Prisma.TransactionClient,
  params: {
    templates: EnrolmentTransferTemplateInput[];
    enrolmentStartDate: Date;
    alternatingWeeks?: boolean | null;
    startExclusive: Date;
    endInclusive: Date;
  }
) {
  const startDate = addDays(asDay(params.startExclusive), 1);
  const endDate = asDay(params.endInclusive);
  if (startDate > endDate || params.templates.length === 0) {
    return [] as Date[];
  }

  const { holidays, cancellations } = await loadScheduleContext(tx, {
    templates: params.templates,
    startDate,
    endDate,
  });

  const holidayKeys = new Set<string>();
  for (const holiday of holidays) {
    let cursor = asDay(holiday.startDate);
    const end = asDay(holiday.endDate);
    while (cursor <= end) {
      holidayKeys.add(`${holiday.templateId ?? "all"}:${toBrisbaneDayKey(cursor)}:${holiday.levelId ?? "all"}`);
      holidayKeys.add(`all:${toBrisbaneDayKey(cursor)}:all`);
      holidayKeys.add(`all:${toBrisbaneDayKey(cursor)}:${holiday.levelId ?? "all"}`);
      cursor = addDays(cursor, 1);
    }
  }

  const occurrenceTemplates = buildOccurrenceTemplates(params.templates);
  const cancellationRows: OccurrenceCancellation[] = cancellations.map((cancellation) => ({
    templateId: cancellation.templateId,
    date: cancellation.date,
  }));

  return buildOccurrenceSchedule({
    startDate,
    endDate,
    templates: occurrenceTemplates,
    cancellations: cancellationRows,
    occurrencesNeeded: 1,
    sessionsPerWeek: Math.max(params.templates.length, 1),
    horizon: endDate,
    shouldSkipOccurrence: ({ templateId, date }) => {
      const template = params.templates.find((item) => item.id === templateId);
      if (!template) return true;

      const dayKey = toBrisbaneDayKey(date);
      const holidayMatches =
        holidayKeys.has(`all:${dayKey}:all`) ||
        holidayKeys.has(`${template.id}:${dayKey}:${template.levelId ?? "all"}`) ||
        holidayKeys.has(`all:${dayKey}:${template.levelId ?? "all"}`);
      if (holidayMatches) return true;

      return shouldSkipAlternatingWeekOccurrence(
        { alternatingWeeks: params.alternatingWeeks ?? false },
        params.enrolmentStartDate,
        template,
        date
      );
    },
  });
}

export async function listBillableOccurrences(
  enrolmentId: string,
  startExclusive: Date,
  endInclusive: Date,
  options?: { client?: PrismaClientOrTx }
) {
  const client = getClient(options?.client);

  return withTransaction(client, async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        plan: true,
        template: { select: { id: true, dayOfWeek: true, levelId: true, startDate: true, endDate: true, startTime: true, name: true } },
        classAssignments: {
          include: {
            template: {
              select: {
                id: true,
                dayOfWeek: true,
                levelId: true,
                startDate: true,
                endDate: true,
                startTime: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!enrolment?.plan) {
      throw new Error("Enrolment plan missing.");
    }

    const templates = resolveEnrolmentTemplates(enrolment).map((template) => ({
      id: template.id,
      dayOfWeek: template.dayOfWeek ?? null,
      levelId: template.levelId ?? null,
      startDate: template.startDate,
      endDate: template.endDate,
      startTime: template.startTime ?? null,
      name: template.name ?? null,
    }));

    return listBillableOccurrencesForTemplates(tx, {
      templates,
      enrolmentStartDate: enrolment.startDate,
      alternatingWeeks: enrolment.plan.alternatingWeeks,
      startExclusive,
      endInclusive,
    });
  });
}

function sumInvoiceLineItemsByKind(invoice: OpenTransferInvoice, kind: InvoiceLineItemKind[]) {
  return invoice.lineItems
    .filter((lineItem) => kind.includes(lineItem.kind))
    .reduce((sum, lineItem) => sum + lineItem.amountCents, 0);
}

async function resolveInvoiceChargeBeforeTransfer(
  tx: Prisma.TransactionClient,
  params: {
    oldEnrolment: LoadedEnrolment;
    invoice: OpenTransferInvoice;
    oldEnrolmentEndAt: Date;
  }
) {
  const { invoice, oldEnrolment, oldEnrolmentEndAt } = params;

  if (!invoice.coverageStart || !invoice.coverageEnd) {
    return invoice.amountCents;
  }

  const coverageStart = asDay(invoice.coverageStart);
  const coverageEnd = asDay(invoice.coverageEnd);
  if (coverageStart > oldEnrolmentEndAt) {
    const nonEnrolmentAmount = invoice.amountCents - sumInvoiceLineItemsByKind(invoice, [InvoiceLineItemKind.ENROLMENT]);
    return Math.max(nonEnrolmentAmount, 0);
  }

  const templates = resolveEnrolmentTemplates(oldEnrolment).map((template) => ({
    id: template.id,
    dayOfWeek: template.dayOfWeek ?? null,
    levelId: template.levelId ?? null,
    startDate: template.startDate,
    endDate: template.endDate,
    startTime: template.startTime ?? null,
    name: template.name ?? null,
  }));

  if (!templates.length) {
    return invoice.amountCents;
  }

  const proratedEnd = oldEnrolmentEndAt < coverageEnd ? oldEnrolmentEndAt : coverageEnd;
  const totalOccurrences = await listBillableOccurrencesForTemplates(tx, {
    templates,
    enrolmentStartDate: oldEnrolment.startDate,
    alternatingWeeks: oldEnrolment.plan?.alternatingWeeks,
    startExclusive: addDays(coverageStart, -1),
    endInclusive: coverageEnd,
  });
  const dueOccurrences = await listBillableOccurrencesForTemplates(tx, {
    templates,
    enrolmentStartDate: oldEnrolment.startDate,
    alternatingWeeks: oldEnrolment.plan?.alternatingWeeks,
    startExclusive: addDays(coverageStart, -1),
    endInclusive: proratedEnd,
  });

  const enrolmentAmountCents = sumInvoiceLineItemsByKind(invoice, [InvoiceLineItemKind.ENROLMENT, InvoiceLineItemKind.DISCOUNT]);
  const residualAmountCents = invoice.amountCents - enrolmentAmountCents;

  if (totalOccurrences.length === 0) {
    return invoice.amountCents;
  }

  const proratedEnrolmentAmount = Math.round((enrolmentAmountCents * dueOccurrences.length) / totalOccurrences.length);
  return Math.max(proratedEnrolmentAmount + residualAmountCents, 0);
}

export async function computeOutstanding(
  oldEnrolment: LoadedEnrolment,
  endAtOverride: Date,
  options?: { client?: PrismaClientOrTx }
) {
  const client = getClient(options?.client);

  return withTransaction(client, async (tx) => {
    const openInvoices = await tx.invoice.findMany({
      where: {
        enrolmentId: oldEnrolment.id,
        status: { in: [...OPEN_TRANSFER_INVOICE_STATUSES] },
      },
      include: {
        lineItems: {
          select: {
            id: true,
            kind: true,
            description: true,
            amountCents: true,
            quantity: true,
            unitPriceCents: true,
            enrolmentId: true,
            planId: true,
          },
        },
        allocations: {
          include: {
            payment: {
              select: {
                id: true,
                status: true,
                paidAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
    });

    const releasedAllocations = openInvoices.flatMap((invoice) =>
      invoice.allocations
        .filter((allocation) => allocation.payment.status !== PaymentStatus.VOID)
        .map((allocation) => ({
          paymentId: allocation.paymentId,
          amountCents: allocation.amountCents,
          paidAt: allocation.payment.paidAt ?? null,
        }))
    );

    const releasedPaymentCreditCents = releasedAllocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);

    let outstandingCents = 0;
    if (openInvoices.length > 0) {
      for (const invoice of openInvoices) {
        outstandingCents += await resolveInvoiceChargeBeforeTransfer(tx, {
          oldEnrolment,
          invoice,
          oldEnrolmentEndAt: endAtOverride,
        });
      }
    } else {
      const overdueBlocks = calculateUnpaidBlocks({
        paidThroughDate: resolvePaidThrough(oldEnrolment),
        sessionsPerWeek: oldEnrolment.plan?.sessionsPerWeek ?? null,
        blockClassCount: oldEnrolment.plan?.blockClassCount ?? null,
        today: endAtOverride,
      });
      outstandingCents = overdueBlocks * (oldEnrolment.plan?.priceCents ?? 0);
    }

    return {
      outstandingCents: Math.max(outstandingCents, 0),
      releasedPaymentCreditCents,
      releasedAllocations,
      openInvoices,
    } satisfies OutstandingComputation;
  });
}

export async function computeOverpaidCredit(
  oldEnrolment: LoadedEnrolment,
  endAtOverride: Date,
  options?: { client?: PrismaClientOrTx }
) {
  const client = getClient(options?.client);

  return withTransaction(client, async (tx) => {
    const oldPaidThrough = resolvePaidThrough(oldEnrolment);
    if (!oldEnrolment.plan || !oldPaidThrough) {
      return 0;
    }
    if (isAfter(endAtOverride, oldPaidThrough)) {
      return 0;
    }

    const templates = resolveEnrolmentTemplates(oldEnrolment).map((template) => ({
      id: template.id,
      dayOfWeek: template.dayOfWeek ?? null,
      levelId: template.levelId ?? null,
      startDate: template.startDate,
      endDate: template.endDate,
      startTime: template.startTime ?? null,
      name: template.name ?? null,
    }));

    const occurrences = await listBillableOccurrencesForTemplates(tx, {
      templates,
      enrolmentStartDate: oldEnrolment.startDate,
      alternatingWeeks: oldEnrolment.plan.alternatingWeeks,
      startExclusive: addDays(asDay(endAtOverride), -1),
      endInclusive: oldPaidThrough,
    });

    return Math.max(Math.round(occurrences.length * resolveCostPerClassCents(oldEnrolment.plan)), 0);
  });
}

export function computeInitialBlock(newPlan: Pick<LoadedPlan, "billingType" | "priceCents">) {
  return resolveInitialBlockChargeCents(newPlan);
}

async function buildTransferPreviewInternal(tx: Prisma.TransactionClient, input: PreviewEnrolmentTransferInput) {
  const context = await loadTransferContext(tx, input);
  const outstanding = await computeOutstanding(context.oldEnrolment, context.oldEnrolmentEndAt, { client: tx });
  const oldOverpaidCreditCents = await computeOverpaidCredit(context.oldEnrolment, context.transferEffectiveAt, {
    client: tx,
  });

  return {
    ...context,
    newTemplates: input.newTemplates,
    oldOutstandingCents: outstanding.outstandingCents,
    oldOverpaidCreditCents,
    releasedPaymentCreditCents: outstanding.releasedPaymentCreditCents,
    newBlockChargeCents: computeInitialBlock(context.newPlan),
    oldPaidThroughDate: resolvePaidThrough(context.oldEnrolment),
    oldTemplates: summarizeTemplates(resolveEnrolmentTemplates(context.oldEnrolment)),
    newTemplateSummaries: summarizeTemplates(input.newTemplates),
    releasedAllocations: outstanding.releasedAllocations,
    openInvoices: outstanding.openInvoices,
  } satisfies TransferPreviewInternal;
}

function toPublicPreview(preview: TransferPreviewInternal, applyOverpaidCredit: boolean): EnrolmentTransferPreview {
  const allocationPlan = buildAllocationPlan({
    oldOutstandingCents: preview.oldOutstandingCents,
    oldOverpaidCreditCents: preview.oldOverpaidCreditCents,
    releasedPaymentCreditCents: preview.releasedPaymentCreditCents,
    newBlockChargeCents: preview.newBlockChargeCents,
    applyOverpaidCredit,
  });

  return {
    oldEnrolmentId: preview.oldEnrolment.id,
    newPlanId: preview.newPlan.id,
    transferEffectiveAt: preview.transferEffectiveAt,
    oldEnrolmentEndAt: preview.oldEnrolmentEndAt,
    plannedEndDate: preview.plannedEndDate,
    oldPaidThroughDate: preview.oldPaidThroughDate,
    oldOutstandingCents: preview.oldOutstandingCents,
    oldOverpaidCreditCents: preview.oldOverpaidCreditCents,
    releasedPaymentCreditCents: preview.releasedPaymentCreditCents,
    newBlockChargeCents: preview.newBlockChargeCents,
    totalDueTodayCents: allocationPlan.totalDueTodayCents,
    creditAppliedToNewInvoiceCents: allocationPlan.creditAppliedToNewInvoiceCents,
    oldTemplates: preview.oldTemplates,
    newTemplates: preview.newTemplateSummaries,
    recommendedAllocations: allocationPlan.recommendedAllocations,
  };
}

export async function previewEnrolmentTransfer(input: PreviewEnrolmentTransferInput): Promise<EnrolmentTransferPreview> {
  const client = getClient(input.client);
  const applyOverpaidCredit = input.applyOverpaidCredit ?? true;

  return withTransaction(client, async (tx) => {
    const preview = await buildTransferPreviewInternal(tx, input);
    return toPublicPreview(preview, applyOverpaidCredit);
  });
}

async function lockEnrolmentRow(tx: Prisma.TransactionClient, enrolmentId: string) {
  const client = tx as Prisma.TransactionClient & { $queryRaw?: (...args: unknown[]) => Promise<unknown> };
  if (typeof client.$queryRaw === "function") {
    await client.$queryRaw`SELECT id FROM "Enrolment" WHERE id = ${enrolmentId} FOR UPDATE`;
  }
}

async function moveReleasedAllocations(params: {
  tx: Prisma.TransactionClient;
  releasedAllocations: ReleasedAllocation[];
  oldInvoiceId?: string | null;
  newInvoiceId?: string | null;
  oldInvoiceAmountCents: number;
  newInvoiceAmountCents: number;
}) {
  let remainingOld = params.oldInvoiceAmountCents;
  let remainingNew = params.newInvoiceAmountCents;
  const rows: Array<{ paymentId: string; invoiceId: string; amountCents: number }> = [];

  const released = params.releasedAllocations.slice().sort((left, right) => {
    const leftTime = left.paidAt?.getTime() ?? 0;
    const rightTime = right.paidAt?.getTime() ?? 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.paymentId.localeCompare(right.paymentId);
  });

  for (const allocation of released) {
    let remaining = allocation.amountCents;

    if (params.oldInvoiceId && remainingOld > 0) {
      const applied = Math.min(remaining, remainingOld);
      if (applied > 0) {
        rows.push({ paymentId: allocation.paymentId, invoiceId: params.oldInvoiceId, amountCents: applied });
        remaining -= applied;
        remainingOld -= applied;
      }
    }

    if (params.newInvoiceId && remainingNew > 0 && remaining > 0) {
      const applied = Math.min(remaining, remainingNew);
      if (applied > 0) {
        rows.push({ paymentId: allocation.paymentId, invoiceId: params.newInvoiceId, amountCents: applied });
        remaining -= applied;
        remainingNew -= applied;
      }
    }
  }

  if (rows.length) {
    const { recomputeInvoicePaymentState } = await import("@/server/billing/paymentRollback");
    await params.tx.paymentAllocation.createMany({ data: rows });
    if (params.oldInvoiceId) {
      await recomputeInvoicePaymentState(params.tx, params.oldInvoiceId);
    }
    if (params.newInvoiceId) {
      await recomputeInvoicePaymentState(params.tx, params.newInvoiceId);
    }
  }
}

async function voidSupersededOpenInvoices(tx: Prisma.TransactionClient, invoices: OpenTransferInvoice[]) {
  if (!invoices.length) return;

  await tx.paymentAllocation.deleteMany({
    where: {
      invoiceId: { in: invoices.map((invoice) => invoice.id) },
    },
  });

  await tx.invoice.updateMany({
    where: {
      id: { in: invoices.map((invoice) => invoice.id) },
    },
    data: {
      status: InvoiceStatus.VOID,
      amountPaidCents: 0,
      paidAt: null,
      entitlementsAppliedAt: null,
    },
  });
}

async function createOldTransferInvoice(params: {
  tx: Prisma.TransactionClient;
  familyId: string;
  oldEnrolmentId: string;
  oldPlanName: string;
  oldOutstandingCents: number;
  transferEffectiveAt: Date;
}) {
  if (params.oldOutstandingCents <= 0) {
    return null;
  }

  const { createInvoiceWithLineItems } = await import("@/server/billing/invoiceMutations");

  return createInvoiceWithLineItems({
    familyId: params.familyId,
    enrolmentId: params.oldEnrolmentId,
    lineItems: [
      {
        kind: InvoiceLineItemKind.ADJUSTMENT,
        description: `Transfer balance for ${params.oldPlanName}`,
        quantity: 1,
        amountCents: params.oldOutstandingCents,
        enrolmentId: params.oldEnrolmentId,
      },
    ],
    status: InvoiceStatus.SENT,
    issuedAt: params.transferEffectiveAt,
    dueAt: params.transferEffectiveAt,
    client: params.tx,
    skipAuth: true,
  });
}

function buildTransferMetadata(params: {
  preview: EnrolmentTransferPreview;
  newEnrolmentId: string;
  voidedInvoiceIds: string[];
  applyOverpaidCredit: boolean;
  takePaymentNow: boolean;
}) {
  return {
    preview: {
      oldOutstandingCents: params.preview.oldOutstandingCents,
      oldOverpaidCreditCents: params.preview.oldOverpaidCreditCents,
      releasedPaymentCreditCents: params.preview.releasedPaymentCreditCents,
      newBlockChargeCents: params.preview.newBlockChargeCents,
      totalDueTodayCents: params.preview.totalDueTodayCents,
      recommendedAllocations: params.preview.recommendedAllocations,
    },
    oldTemplates: params.preview.oldTemplates,
    newTemplates: params.preview.newTemplates,
    voidedInvoiceIds: params.voidedInvoiceIds,
    newEnrolmentId: params.newEnrolmentId,
    applyOverpaidCredit: params.applyOverpaidCredit,
    takePaymentNow: params.takePaymentNow,
  } satisfies Record<string, unknown>;
}

async function hydrateExistingTransfer(
  tx: Prisma.TransactionClient,
  idempotencyKey: string
): Promise<EnrolmentTransferConfirmResult | null> {
  const existing = await tx.enrolmentTransfer.findUnique({
    where: { idempotencyKey },
  });
  if (!existing) return null;

  const metadata = (existing.metadata ?? null) as StoredTransferMetadata | null;
  const previewMeta = metadata?.preview ?? null;
  const allocationMeta = previewMeta?.recommendedAllocations ?? {};
  const oldTemplates = metadata?.oldTemplates ?? [];
  const newTemplates = metadata?.newTemplates ?? [];

  const preview: EnrolmentTransferPreview = {
    oldEnrolmentId: existing.oldEnrolmentId,
    newPlanId: "",
    transferEffectiveAt: existing.transferEffectiveAt,
    oldEnrolmentEndAt: existing.transferEffectiveAt,
    plannedEndDate: null,
    oldPaidThroughDate: null,
    oldOutstandingCents: existing.oldOutstandingCents,
    oldOverpaidCreditCents: existing.oldOverpaidCreditCents,
    releasedPaymentCreditCents: existing.releasedPaymentCreditCents,
    newBlockChargeCents: existing.newBlockChargeCents,
    totalDueTodayCents: existing.paymentAmountCents,
    creditAppliedToNewInvoiceCents: existing.creditAppliedCents,
    oldTemplates: oldTemplates.map((template) => ({
      id: String(template.id ?? ""),
      name: String(template.name ?? "Class"),
      dayOfWeek: template.dayOfWeek == null ? null : Number(template.dayOfWeek),
    })),
    newTemplates: newTemplates.map((template) => ({
      id: String(template.id ?? ""),
      name: String(template.name ?? "Class"),
      dayOfWeek: template.dayOfWeek == null ? null : Number(template.dayOfWeek),
    })),
    recommendedAllocations: {
      releasedPaymentToOldInvoiceCents: Number(allocationMeta.releasedPaymentToOldInvoiceCents ?? 0),
      releasedPaymentToNewInvoiceCents: Number(allocationMeta.releasedPaymentToNewInvoiceCents ?? 0),
      overpaidCreditToNewInvoiceCents: Number(allocationMeta.overpaidCreditToNewInvoiceCents ?? 0),
      cashToOldInvoiceCents: Number(allocationMeta.cashToOldInvoiceCents ?? 0),
      cashToNewInvoiceCents: Number(allocationMeta.cashToNewInvoiceCents ?? 0),
    },
  };

  return {
    transferId: existing.id,
    oldEnrolmentId: existing.oldEnrolmentId,
    newEnrolmentId: existing.newEnrolmentId,
    familyId: existing.familyId,
    oldInvoiceId: existing.oldInvoiceId ?? null,
    newInvoiceId: existing.newInvoiceId ?? null,
    creditPaymentId: existing.creditPaymentId ?? null,
    paymentId: existing.paymentId ?? null,
    preview,
  };
}

export async function confirmEnrolmentTransfer(
  input: ConfirmEnrolmentTransferInput
): Promise<EnrolmentTransferConfirmResult> {
  const client = getClient(input.client);
  const applyOverpaidCredit = input.applyOverpaidCredit ?? true;

  return withTransaction(client, async (tx) => {
    const existing = await hydrateExistingTransfer(tx, input.idempotencyKey);
    if (existing) {
      return existing;
    }

    await lockEnrolmentRow(tx, input.oldEnrolmentId);

    const duplicateForEnrolment = await tx.enrolmentTransfer.findUnique({
      where: { oldEnrolmentId: input.oldEnrolmentId },
    });
    if (duplicateForEnrolment) {
      throw new Error("This enrolment has already been transferred.");
    }

    const previewInternal = await buildTransferPreviewInternal(tx, input);
    const preview = toPublicPreview(previewInternal, applyOverpaidCredit);
    const familyId = previewInternal.oldEnrolment.student.familyId ?? null;

    const nextEnrolment = await tx.enrolment.create({
      data: {
        templateId: previewInternal.anchorTemplateId,
        studentId: previewInternal.oldEnrolment.studentId,
        startDate: previewInternal.transferEffectiveAt,
        endDate: previewInternal.plannedEndDate,
        status: EnrolmentStatus.ACTIVE,
        planId: previewInternal.newPlan.id,
        billingGroupId: previewInternal.oldEnrolment.billingGroupId ?? previewInternal.oldEnrolment.id,
        paidThroughDate: null,
        paidThroughDateComputed: null,
        creditsRemaining: previewInternal.newPlan.billingType === BillingType.PER_CLASS ? 0 : null,
        creditsBalanceCached: previewInternal.newPlan.billingType === BillingType.PER_CLASS ? 0 : null,
        transferFromEnrolmentId: previewInternal.oldEnrolment.id,
        transferEffectiveAt: previewInternal.transferEffectiveAt,
      },
    });

    await tx.enrolmentClassAssignment.createMany({
      data: input.newTemplates.map((template) => ({
        enrolmentId: nextEnrolment.id,
        templateId: template.id,
      })),
      skipDuplicates: true,
    });

    const currentPaidThrough = resolvePaidThrough(previewInternal.oldEnrolment);
    const cappedPaidThrough =
      currentPaidThrough && currentPaidThrough > previewInternal.oldEnrolmentEndAt
        ? previewInternal.oldEnrolmentEndAt
        : currentPaidThrough;

    const transferMetadata = buildTransferMetadata({
      preview,
      newEnrolmentId: nextEnrolment.id,
      voidedInvoiceIds: previewInternal.openInvoices.map((invoice) => invoice.id),
      applyOverpaidCredit,
      takePaymentNow: Boolean(input.takePaymentNow),
    });

    await tx.enrolment.update({
      where: { id: previewInternal.oldEnrolment.id },
      data: {
        endDate: previewInternal.oldEnrolmentEndAt,
        status: EnrolmentStatus.CHANGEOVER,
        cancelledAt: null,
        paidThroughDate: cappedPaidThrough,
        paidThroughDateComputed: cappedPaidThrough,
        transferEffectiveAt: previewInternal.transferEffectiveAt,
        transferMetadata,
      },
    });

    await tx.enrolment.update({
      where: { id: nextEnrolment.id },
      data: {
        transferMetadata,
      },
    });

    if (previewInternal.oldEnrolment.plan?.billingType === BillingType.PER_CLASS) {
      const refreshedOld = await tx.enrolment.findUnique({
        where: { id: previewInternal.oldEnrolment.id },
        include: {
          plan: true,
          template: true,
          classAssignments: { include: { template: true } },
        },
      });
      if (refreshedOld) {
        await adjustCreditsForManualPaidThroughDate(tx, refreshedOld, cappedPaidThrough);
      }
    }

    await voidSupersededOpenInvoices(tx, previewInternal.openInvoices);

    let oldInvoiceId: string | null = null;
    if (familyId && preview.oldOutstandingCents > 0) {
      const oldInvoice = await createOldTransferInvoice({
        tx,
        familyId,
        oldEnrolmentId: previewInternal.oldEnrolment.id,
        oldPlanName: previewInternal.oldEnrolment.plan?.name ?? "Previous enrolment",
        oldOutstandingCents: preview.oldOutstandingCents,
        transferEffectiveAt: previewInternal.transferEffectiveAt,
      });
      oldInvoiceId = oldInvoice?.id ?? null;
    }

    let newInvoiceId: string | null = null;
    if (familyId && preview.newBlockChargeCents > 0) {
      const { createInitialInvoiceForEnrolment } = await import("@/server/invoicing");
      const initialInvoice = await createInitialInvoiceForEnrolment(nextEnrolment.id, {
        prismaClient: tx,
        skipAuth: true,
      });
      newInvoiceId = initialInvoice.invoice.id;
    }

    await moveReleasedAllocations({
      tx,
      releasedAllocations: previewInternal.releasedAllocations,
      oldInvoiceId,
      newInvoiceId,
      oldInvoiceAmountCents: preview.recommendedAllocations.releasedPaymentToOldInvoiceCents,
      newInvoiceAmountCents: preview.recommendedAllocations.releasedPaymentToNewInvoiceCents,
    });

    let creditPaymentId: string | null = null;
    if (familyId && preview.oldOverpaidCreditCents > 0) {
      const { createPaymentAndAllocate } = await import("@/server/billing/invoiceMutations");
      const creditAllocations =
        applyOverpaidCredit && newInvoiceId && preview.creditAppliedToNewInvoiceCents > 0
          ? [{ invoiceId: newInvoiceId, amountCents: preview.creditAppliedToNewInvoiceCents }]
          : [];

      const creditPayment = await createPaymentAndAllocate({
        familyId,
        amountCents: preview.oldOverpaidCreditCents,
        paidAt: input.paymentPaidAt ?? previewInternal.transferEffectiveAt,
        method: "transfer-credit",
        note: `Transfer credit from enrolment ${previewInternal.oldEnrolment.id}`,
        allocations: creditAllocations,
        idempotencyKey: `${input.idempotencyKey}:credit`,
        client: tx,
        skipAuth: true,
      });
      creditPaymentId = creditPayment.payment.id;
    }

    let paymentId: string | null = null;
    if (familyId && input.takePaymentNow && preview.totalDueTodayCents > 0) {
      const { createPaymentAndAllocate } = await import("@/server/billing/invoiceMutations");
      const allocations: Array<{ invoiceId: string; amountCents: number }> = [];
      if (oldInvoiceId && preview.recommendedAllocations.cashToOldInvoiceCents > 0) {
        allocations.push({
          invoiceId: oldInvoiceId,
          amountCents: preview.recommendedAllocations.cashToOldInvoiceCents,
        });
      }
      if (newInvoiceId && preview.recommendedAllocations.cashToNewInvoiceCents > 0) {
        allocations.push({
          invoiceId: newInvoiceId,
          amountCents: preview.recommendedAllocations.cashToNewInvoiceCents,
        });
      }

      const payment = await createPaymentAndAllocate({
        familyId,
        amountCents: preview.totalDueTodayCents,
        paidAt: input.paymentPaidAt ?? previewInternal.transferEffectiveAt,
        method: input.paymentMethod?.trim() || undefined,
        note: input.paymentNote?.trim() || undefined,
        allocations,
        idempotencyKey: `${input.idempotencyKey}:payment`,
        client: tx,
        skipAuth: true,
      });
      paymentId = payment.payment.id;
    }

    const transfer = await tx.enrolmentTransfer.create({
      data: {
        oldEnrolmentId: previewInternal.oldEnrolment.id,
        newEnrolmentId: nextEnrolment.id,
        familyId,
        transferEffectiveAt: previewInternal.transferEffectiveAt,
        idempotencyKey: input.idempotencyKey,
        applyOverpaidCredit,
        takePaymentNow: Boolean(input.takePaymentNow),
        oldOutstandingCents: preview.oldOutstandingCents,
        oldOverpaidCreditCents: preview.oldOverpaidCreditCents,
        releasedPaymentCreditCents: preview.releasedPaymentCreditCents,
        newBlockChargeCents: preview.newBlockChargeCents,
        creditAppliedCents: preview.creditAppliedToNewInvoiceCents,
        paymentAmountCents: preview.totalDueTodayCents,
        oldInvoiceId,
        newInvoiceId,
        creditPaymentId,
        paymentId,
        metadata: transferMetadata,
      },
    });

    return {
      transferId: transfer.id,
      oldEnrolmentId: previewInternal.oldEnrolment.id,
      newEnrolmentId: nextEnrolment.id,
      familyId,
      oldInvoiceId,
      newInvoiceId,
      creditPaymentId,
      paymentId,
      preview,
    };
  });
}
