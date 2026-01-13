
import { addDays } from "date-fns";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BillingType, InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { createInvoiceWithLineItems, recalculateInvoiceTotals } from "@/server/billing/invoiceMutations";
import { applyPaidInvoiceToEnrolment } from "@/server/invoicing/applyPaidInvoiceToEnrolment";
import { enrolmentWithPlanInclude, resolveCoverageForPlan } from "@/server/invoicing/coverage";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";
import { isEnrolmentOverdue } from "@/server/billing/overdue";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const;
const DEFAULT_DUE_IN_DAYS = 7;

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

async function ensureAdminAccess(skipAuth?: boolean) {
  if (skipAuth) return;
  await getOrCreateUser();
  await requireAdmin();
}

function inTransaction<T>(client: PrismaClientOrTx | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  const candidate = client ?? prisma;
  if (typeof (candidate as PrismaClient).$transaction === "function") {
    return (candidate as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(candidate as Prisma.TransactionClient);
}

export async function createInitialInvoiceForEnrolment(
  enrolmentId: string,
  options?: { prismaClient?: PrismaClientOrTx; skipAuth?: boolean }
) {
  await ensureAdminAccess(options?.skipAuth);

  const client = getClient(options?.prismaClient);

  return inTransaction(client, async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      ...enrolmentWithPlanInclude,
    });
    if (!enrolment) throw new Error("Enrolment not found");
    if (!enrolment.plan) throw new Error("Enrolment plan missing");
    if (!enrolment.isBillingPrimary) {
      throw new Error("Secondary enrolments cannot be billed directly.");
    }
    if (!enrolment.template) {
      throw new Error("Class template missing for enrolment.");
    }
    assertPlanMatchesTemplate(enrolment.plan, enrolment.template);

    const existingOpen = await tx.invoice.findFirst({
      where: { enrolmentId, status: { in: [...OPEN_INVOICE_STATUSES] } },
    });
    if (existingOpen) return { invoice: existingOpen, created: false };

    const assignedTemplates = enrolment.classAssignments.length
      ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
      : enrolment.template
        ? [enrolment.template]
        : [];
    const templateIds = assignedTemplates.map((template) => template.id);
    const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
    const holidays = await tx.holiday.findMany({
      where: buildHolidayScopeWhere({ templateIds, levelIds }),
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
    });
    const { coverageStart, coverageEnd, creditsPurchased } = resolveCoverageForPlan({
      enrolment,
      plan: enrolment.plan,
      holidays,
      today: enrolment.startDate,
    });

    const invoice = await createInvoiceWithLineItems({
      familyId: enrolment.student.familyId,
      enrolmentId: enrolment.id,
      lineItems: [
        {
          kind: InvoiceLineItemKind.ENROLMENT,
          description: enrolment.plan.name,
          quantity: 1,
          unitPriceCents: enrolment.plan.priceCents,
        },
      ],
      status: InvoiceStatus.SENT,
      coverageStart: coverageStart ?? null,
      coverageEnd: coverageEnd ?? null,
      creditsPurchased,
      issuedAt: new Date(),
      dueAt: addDays(new Date(), DEFAULT_DUE_IN_DAYS),
      client: tx,
      skipAuth: true,
    });

    return { invoice, created: true };
  });
}

export async function markInvoicePaid(invoiceId: string) {
  await ensureAdminAccess();

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        enrolment: {
          ...enrolmentWithPlanInclude,
        },
        lineItems: { select: { kind: true } },
      },
    });

    if (!invoice) throw new Error("Invoice not found");
    const recalculated = await recalculateInvoiceTotals(invoiceId, { client: tx, skipAuth: true });
    if (recalculated.status === InvoiceStatus.PAID && recalculated.amountPaidCents >= recalculated.amountCents) {
      return recalculated;
    }

    const allocated = await tx.paymentAllocation.aggregate({
      where: { invoiceId },
      _sum: { amountCents: true },
    });
    const allocatedCents = allocated._sum.amountCents ?? 0;
    const nextPaid = Math.max(recalculated.amountCents, allocatedCents, recalculated.amountPaidCents);

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: recalculated.paidAt ?? new Date(),
        amountPaidCents: nextPaid,
      },
    });

    await applyPaidInvoiceToEnrolment(invoiceId, { client: tx });

    return updated;
  });
}

export async function issueNextInvoiceForEnrolment(
  enrolmentId: string,
  options?: {
    prismaClient?: PrismaClientOrTx;
    enrolment?: Prisma.EnrolmentGetPayload<typeof enrolmentWithPlanInclude>;
    skipAuth?: boolean;
  }
) {
  await ensureAdminAccess(options?.skipAuth);

  const client = getClient(options?.prismaClient);

  return inTransaction(client, async (tx) => {
    const enrolment =
      options?.enrolment ??
      (await tx.enrolment.findUnique({
        where: { id: enrolmentId },
        ...enrolmentWithPlanInclude,
      }));

    if (!enrolment) throw new Error("Enrolment not found");
    if (!enrolment.plan) throw new Error("Enrolment plan missing");
    if (!enrolment.isBillingPrimary) {
      throw new Error("Secondary enrolments cannot be billed directly.");
    }
    if (!enrolment.template) {
      throw new Error("Class template missing for enrolment.");
    }
    assertPlanMatchesTemplate(enrolment.plan, enrolment.template);

    const openInvoice = await tx.invoice.findFirst({
      where: { enrolmentId: enrolment.id, status: { in: [...OPEN_INVOICE_STATUSES] } },
    });
    if (openInvoice) return { invoice: openInvoice, created: false };

    const billingSnapshot = await getEnrolmentBillingStatus(enrolment.id, { client: tx });
    const assignedTemplates = enrolment.classAssignments.length
      ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
      : enrolment.template
        ? [enrolment.template]
        : [];
    const templateIds = assignedTemplates.map((template) => template.id);
    const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
    const holidays = await tx.holiday.findMany({
      where: buildHolidayScopeWhere({ templateIds, levelIds }),
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
    });

    const today = new Date();
    if (enrolment.plan.billingType === BillingType.PER_WEEK) {
      const { coverageStart, coverageEnd } = resolveCoverageForPlan({
        enrolment,
        plan: enrolment.plan,
        holidays,
        today,
      });

      const invoice = await createInvoiceWithLineItems({
        familyId: enrolment.student.familyId,
        enrolmentId: enrolment.id,
        lineItems: [
          {
            kind: InvoiceLineItemKind.ENROLMENT,
            description: enrolment.plan.name,
            quantity: 1,
            unitPriceCents: enrolment.plan.priceCents,
          },
        ],
        status: InvoiceStatus.SENT,
        coverageStart,
        coverageEnd,
        issuedAt: today,
        dueAt: addDays(today, DEFAULT_DUE_IN_DAYS),
        client: tx,
        skipAuth: true,
      });
      return { invoice, created: true };
    }

    const needsCredits = (billingSnapshot.remainingCredits ?? 0) <= 0;
    if (!needsCredits) return { created: false };

    if (enrolment.plan.billingType === BillingType.PER_CLASS && enrolment.plan.blockClassCount != null && enrolment.plan.blockClassCount <= 0) {
      throw new Error("PER_CLASS plans require blockClassCount to be greater than zero when provided.");
    }

    const creditsPurchased = enrolment.plan.blockClassCount ?? 1;
    const invoice = await createInvoiceWithLineItems({
      familyId: enrolment.student.familyId,
      enrolmentId: enrolment.id,
      lineItems: [
        {
          kind: InvoiceLineItemKind.ENROLMENT,
          description: enrolment.plan.name,
          quantity: 1,
          unitPriceCents: enrolment.plan.priceCents,
        },
      ],
      status: InvoiceStatus.SENT,
      creditsPurchased,
      issuedAt: today,
      dueAt: addDays(today, DEFAULT_DUE_IN_DAYS),
      client: tx,
      skipAuth: true,
    });

    return { invoice, created: true };
  });
}

export async function runInvoicingSweep(_params?: { maxToProcess?: number }) {
  await ensureAdminAccess();
  return { processed: 0, created: 0 };
}

export async function maybeRunInvoicingSweep() {
  await ensureAdminAccess();
  return { ran: false, created: 0 };
}

export async function getUnpaidFamiliesSummary() {
  await getOrCreateUser();
  await requireAdmin();

  const now = brisbaneStartOfDay(new Date());
  const enrolments = await prisma.enrolment.findMany({
    where: {
      status: "ACTIVE",
      isBillingPrimary: true,
      planId: { not: null },
    },
    select: {
      id: true,
      status: true,
      paidThroughDate: true,
      creditsRemaining: true,
      creditsBalanceCached: true,
      plan: { select: { billingType: true, priceCents: true } },
      student: { select: { familyId: true, family: { select: { id: true, name: true } } } },
    },
  });

  const familyMap = new Map<
    string,
    {
      id: string;
      name: string;
      amountDueCents: number;
      overdueEnrolments: number;
      dueSince: Date | null;
      lastPaidThrough: Date | null;
    }
  >();

  enrolments.forEach((enrolment) => {
    if (!isEnrolmentOverdue(enrolment, now)) return;
    const family = enrolment.student.family;
    if (!family) return;
    const existing =
      familyMap.get(family.id) ??
      {
        id: family.id,
        name: family.name,
        amountDueCents: 0,
        overdueEnrolments: 0,
        dueSince: null,
        lastPaidThrough: null,
      };

    const price = enrolment.plan?.priceCents ?? 0;
    const paidThrough = enrolment.plan?.billingType === BillingType.PER_WEEK ? asDate(enrolment.paidThroughDate) : null;

    existing.amountDueCents += price;
    existing.overdueEnrolments += 1;
    if (paidThrough) {
      if (!existing.dueSince || paidThrough.getTime() < existing.dueSince.getTime()) {
        existing.dueSince = paidThrough;
      }
      if (!existing.lastPaidThrough || paidThrough.getTime() > existing.lastPaidThrough.getTime()) {
        existing.lastPaidThrough = paidThrough;
      }
    }

    familyMap.set(family.id, existing);
  });

  const summary = Array.from(familyMap.values()).map((family) => ({
    ...family,
    link: `/admin/family/${family.id}`,
  }));

  return {
    count: summary.length,
    families: summary,
  };
}

export type UnpaidFamiliesSummary = Awaited<ReturnType<typeof getUnpaidFamiliesSummary>>;
