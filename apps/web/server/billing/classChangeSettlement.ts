import { isAfter } from "date-fns";
import {
  BillingType,
  InvoiceLineItemKind,
  InvoiceStatus,
  type Prisma,
} from "@prisma/client";

import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { listScheduledOccurrences } from "@/server/billing/paidThroughDate";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
type CreateInvoiceFn = (input: {
  familyId: string;
  enrolmentId?: string | null;
  lineItems: Array<{
    kind: InvoiceLineItemKind;
    description: string;
    quantity?: number;
    unitPriceCents?: number;
    amountCents?: number;
    enrolmentId?: string | null;
    planId?: string | null;
  }>;
  status?: InvoiceStatus;
  issuedAt?: Date;
  dueAt?: Date | null;
  client?: Prisma.TransactionClient;
  skipAuth?: boolean;
}) => Promise<{ id: string }>;

type CreatePaymentFn = (input: {
  familyId: string;
  amountCents: number;
  paidAt?: Date;
  method?: string;
  note?: string;
  allocations?: Array<{ invoiceId: string; amountCents: number }>;
  strategy?: "oldest-open-first";
  idempotencyKey?: string;
  skipAuth?: boolean;
  client?: Prisma.TransactionClient;
}) => Promise<{ payment: { id: string } }>;

export type ClassChangeTemplate = {
  id: string;
  dayOfWeek: number | null;
  levelId?: string | null;
};

export type ClassChangePlan = {
  id?: string | null;
  billingType: BillingType;
  priceCents: number;
  sessionsPerWeek: number | null;
  blockClassCount: number | null;
};

export type ClassChangeSettlementSummary = {
  changeOverDate: Date;
  paidThroughDate: Date | null;
  chargeableClasses: number;
  oldCostPerClassCents: number;
  newCostPerClassCents: number;
  oldValueCents: number;
  newValueCents: number;
  differenceCents: number;
};

type HolidayScope = { startDate: Date; endDate: Date; levelId?: string | null; templateId?: string | null };
type CancellationScope = { templateId: string; date: Date };

function resolveSessionsPerWeek(plan: ClassChangePlan) {
  return plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
}

function resolveBlockClassCount(plan: ClassChangePlan) {
  return plan.blockClassCount && plan.blockClassCount > 0 ? plan.blockClassCount : 1;
}

export function resolveCostPerClassCents(plan: ClassChangePlan) {
  if (plan.billingType === BillingType.PER_WEEK) {
    return plan.priceCents / resolveSessionsPerWeek(plan);
  }
  return plan.priceCents / resolveBlockClassCount(plan);
}

function holidayAppliesToTemplate(holiday: HolidayScope, template: ClassChangeTemplate) {
  if (holiday.templateId && holiday.templateId !== template.id) return false;
  if (holiday.levelId && holiday.levelId !== template.levelId) return false;
  return true;
}

export function countChargeableClassesInRange(params: {
  templates: ClassChangeTemplate[];
  startDate: Date;
  endDate: Date;
  holidays: HolidayScope[];
  cancellations: CancellationScope[];
}) {
  const start = brisbaneStartOfDay(params.startDate);
  const end = brisbaneStartOfDay(params.endDate);

  if (isAfter(start, end)) return 0;
  if (!params.templates.length) return 0;

  const cancellationsByTemplate = params.cancellations.reduce<Map<string, Date[]>>((map, cancellation) => {
    const entry = map.get(cancellation.templateId) ?? [];
    entry.push(cancellation.date);
    map.set(cancellation.templateId, entry);
    return map;
  }, new Map());

  let total = 0;
  for (const template of params.templates) {
    const templateHolidays = params.holidays.filter((holiday) => holidayAppliesToTemplate(holiday, template));
    const templateCancellations = cancellationsByTemplate.get(template.id) ?? [];
    const occurrences = listScheduledOccurrences({
      startDate: start,
      endDate: end,
      classTemplate: { dayOfWeek: template.dayOfWeek },
      holidays: templateHolidays,
      cancellations: templateCancellations,
    });
    total += occurrences.length;
  }

  return total;
}

export async function countChargeableClasses(params: {
  client: Prisma.TransactionClient;
  templates: ClassChangeTemplate[];
  startDate: Date;
  endDate: Date;
}) {
  if (!params.templates.length) return 0;

  const start = brisbaneStartOfDay(params.startDate);
  const end = brisbaneStartOfDay(params.endDate);
  if (isAfter(start, end)) return 0;

  const templateIds = params.templates.map((template) => template.id);
  const levelIds = params.templates.map((template) => template.levelId ?? null);

  const [holidays, cancellations] = await Promise.all([
    params.client.holiday.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
        ...buildHolidayScopeWhere({ templateIds, levelIds }),
      },
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    }),
    params.client.classCancellation.findMany({
      where: { templateId: { in: templateIds }, date: { gte: start, lte: end } },
      select: { templateId: true, date: true },
    }),
  ]);

  return countChargeableClassesInRange({
    templates: params.templates,
    startDate: start,
    endDate: end,
    holidays,
    cancellations,
  });
}

export function computeClassChangeSettlement(params: {
  oldPlan: ClassChangePlan;
  newPlan: ClassChangePlan;
  chargeableClasses: number;
  changeOverDate: Date;
  paidThroughDate: Date | null;
}): ClassChangeSettlementSummary {
  const oldCostPerClassCents = resolveCostPerClassCents(params.oldPlan);
  const newCostPerClassCents = resolveCostPerClassCents(params.newPlan);
  const oldValueCents = Math.round(params.chargeableClasses * oldCostPerClassCents);
  const newValueCents = Math.round(params.chargeableClasses * newCostPerClassCents);
  const differenceCents = newValueCents - oldValueCents;

  return {
    changeOverDate: brisbaneStartOfDay(params.changeOverDate),
    paidThroughDate: params.paidThroughDate ? brisbaneStartOfDay(params.paidThroughDate) : null,
    chargeableClasses: params.chargeableClasses,
    oldCostPerClassCents,
    newCostPerClassCents,
    oldValueCents,
    newValueCents,
    differenceCents,
  };
}

export async function computeClassChangeSettlementForRange(params: {
  client: Prisma.TransactionClient;
  oldPlan: ClassChangePlan;
  newPlan: ClassChangePlan;
  changeOverDate: Date;
  paidThroughDate: Date | null;
  templates: ClassChangeTemplate[];
}) {
  const changeOverDate = brisbaneStartOfDay(params.changeOverDate);
  const paidThroughDate = params.paidThroughDate ? brisbaneStartOfDay(params.paidThroughDate) : null;

  if (!paidThroughDate || isAfter(changeOverDate, paidThroughDate)) {
    return computeClassChangeSettlement({
      oldPlan: params.oldPlan,
      newPlan: params.newPlan,
      chargeableClasses: 0,
      changeOverDate,
      paidThroughDate,
    });
  }

  const chargeableClasses = await countChargeableClasses({
    client: params.client,
    templates: params.templates,
    startDate: changeOverDate,
    endDate: paidThroughDate,
  });

  return computeClassChangeSettlement({
    oldPlan: params.oldPlan,
    newPlan: params.newPlan,
    chargeableClasses,
    changeOverDate,
    paidThroughDate,
  });
}

export function resolveChangeOverPaidThroughDate(paidThroughDate: Date | null | undefined) {
  return paidThroughDate ? brisbaneStartOfDay(paidThroughDate) : null;
}

export function buildClassChangeSettlementKey(params: {
  enrolmentId: string;
  newPlanId: string;
  changeOverDate: Date;
  paidThroughDate: Date | null;
  templateIds: string[];
}) {
  const changeKey = toBrisbaneDayKey(brisbaneStartOfDay(params.changeOverDate));
  const paidKey = params.paidThroughDate ? toBrisbaneDayKey(brisbaneStartOfDay(params.paidThroughDate)) : "none";
  const templatesKey = params.templateIds.slice().sort().join(",");
  return `class-change:${params.enrolmentId}:${params.newPlanId}:${changeKey}:${paidKey}:${templatesKey}`;
}

export async function applyClassChangeSettlement(params: {
  client: Prisma.TransactionClient;
  familyId: string;
  enrolmentId: string;
  settlement: ClassChangeSettlementSummary;
  settlementKey: string;
  issuedAt?: Date;
  planId?: string | null;
  mutations?: {
    createInvoice?: CreateInvoiceFn;
    createPayment?: CreatePaymentFn;
  };
}) {
  const difference = params.settlement.differenceCents;
  if (!difference) {
    return { invoiceId: null as string | null, paymentId: null as string | null };
  }

  const description = `Class change settlement (${params.settlementKey})`;
  const issuedAt = params.issuedAt ?? new Date();
  const createInvoice =
    params.mutations?.createInvoice ??
    (await import("@/server/billing/invoiceMutations")).createInvoiceWithLineItems;
  const createPayment =
    params.mutations?.createPayment ??
    (await import("@/server/billing/invoiceMutations")).createPaymentAndAllocate;

  if (difference > 0) {
    const existing = await params.client.invoiceLineItem.findFirst({
      where: {
        description,
        enrolmentId: params.enrolmentId,
        amountCents: difference,
      },
      select: { invoiceId: true },
    });
    if (existing) {
      return { invoiceId: existing.invoiceId, paymentId: null };
    }

    const invoice = await createInvoice({
      familyId: params.familyId,
      enrolmentId: params.enrolmentId,
      lineItems: [
        {
          kind: InvoiceLineItemKind.ADJUSTMENT,
          description,
          quantity: 1,
          amountCents: difference,
          enrolmentId: params.enrolmentId,
          planId: params.planId ?? null,
        },
      ],
      status: InvoiceStatus.SENT,
      issuedAt,
      dueAt: issuedAt,
      client: params.client,
      skipAuth: true,
    });

    return { invoiceId: invoice.id, paymentId: null };
  }

  const existingPayment = await params.client.payment.findFirst({
    where: {
      familyId: params.familyId,
      idempotencyKey: params.settlementKey,
    },
    select: { id: true },
  });
  if (existingPayment) {
    return { invoiceId: null, paymentId: existingPayment.id };
  }

  const payment = await createPayment({
    familyId: params.familyId,
    amountCents: Math.abs(difference),
    method: "credit",
    note: description,
    idempotencyKey: params.settlementKey,
    client: params.client,
    skipAuth: true,
  });

  return { invoiceId: null, paymentId: payment.payment.id };
}
