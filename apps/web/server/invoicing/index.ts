
import { addDays } from "date-fns";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BillingType, InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getEnrolmentBillingStatus,
  getWeeklyPaidThrough,
  refreshBillingForOpenEnrolments,
} from "@/server/billing/enrolmentBilling";
import { createInvoiceWithLineItems, recalculateInvoiceTotals } from "@/server/billing/invoiceMutations";
import { applyPaidInvoiceToEnrolment } from "@/server/invoicing/applyPaidInvoiceToEnrolment";
import {
  enrolmentWithPlanInclude,
  resolveCoverageForPlan,
  resolveWeeklyCoverageWindow,
} from "@/server/invoicing/coverage";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const;
const DEFAULT_DUE_IN_DAYS = 7;
const SWEEP_THROTTLE_MS = 15 * 60 * 1000;

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
    if (!enrolment.template) {
      throw new Error("Class template missing for enrolment.");
    }
    assertPlanMatchesTemplate(enrolment.plan, enrolment.template);

    const existingOpen = await tx.invoice.findFirst({
      where: { enrolmentId, status: { in: OPEN_INVOICE_STATUSES } },
    });
    if (existingOpen) return { invoice: existingOpen, created: false };

    const { coverageStart, coverageEnd, creditsPurchased } = resolveCoverageForPlan({
      enrolment,
      plan: enrolment.plan,
      today: enrolment.startDate,
    });

    console.log("COVERAGE", coverageStart, coverageEnd, creditsPurchased);

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
    if (!enrolment.template) {
      throw new Error("Class template missing for enrolment.");
    }
    assertPlanMatchesTemplate(enrolment.plan, enrolment.template);

    const openInvoice = await tx.invoice.findFirst({
      where: { enrolmentId: enrolment.id, status: { in: OPEN_INVOICE_STATUSES } },
    });
    if (openInvoice) return { invoice: openInvoice, created: false };

    const billingSnapshot = await getEnrolmentBillingStatus(enrolment.id, { client: tx });

    const today = new Date();
    if (enrolment.plan.billingType === BillingType.PER_WEEK) {
      const paidThrough = billingSnapshot.paidThroughDate ?? getWeeklyPaidThrough(enrolment);
      const { coverageStart, coverageEnd } = resolveWeeklyCoverageWindow({
        enrolment: {
          startDate: enrolment.startDate,
          endDate: enrolment.endDate,
          paidThroughDate: paidThrough,
        },
        plan: { durationWeeks: enrolment.plan.durationWeeks ?? null },
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

export async function runInvoicingSweep(params: { maxToProcess?: number }) {
  await ensureAdminAccess();
  await refreshBillingForOpenEnrolments({ client: prisma });

  const today = new Date();
  const candidates = await prisma.enrolment.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
      planId: { not: null },
      OR: [
        {
          plan: { billingType: BillingType.PER_WEEK },
          OR: [
            { paidThroughDate: null },
            { paidThroughDate: { lt: today } },
            { paidThroughDateComputed: null },
            { paidThroughDateComputed: { lt: today } },
          ],
        },
        {
          plan: { billingType: BillingType.PER_CLASS },
          OR: [
            { creditsRemaining: null },
            { creditsRemaining: { lte: 0 } },
            { creditsBalanceCached: null },
            { creditsBalanceCached: { lte: 0 } },
          ],
        },
      ],
    },
    ...enrolmentWithPlanInclude,
    take: params.maxToProcess ?? 200,
  });

  let created = 0;

  for (const enrolment of candidates) {
    const result = await issueNextInvoiceForEnrolment(enrolment.id, {
      prismaClient: prisma,
      enrolment,
      skipAuth: true,
    });
    if (result?.created) created += 1;
  }

  return { processed: candidates.length, created };
}

export async function maybeRunInvoicingSweep() {
  await ensureAdminAccess();

  const now = new Date();
  const shouldRun = await prisma.$transaction(async (tx) => {
    const state = await tx.invoicingSweepState.findUnique({ where: { id: "global" } });
    const lastRun = state?.lastRunAt ?? new Date(0);
    if (now.getTime() - lastRun.getTime() < SWEEP_THROTTLE_MS) return false;

    if (state) {
      await tx.invoicingSweepState.update({
        where: { id: "global" },
        data: { lastRunAt: now },
      });
    } else {
      await tx.invoicingSweepState.create({ data: { id: "global", lastRunAt: now } });
    }
    return true;
  });

  if (!shouldRun) return { ran: false, created: 0 };

  const result = await runInvoicingSweep({ maxToProcess: 200 });
  return { ran: true, created: result.created };
}

export async function getUnpaidFamiliesSummary() {
  await getOrCreateUser();
  await requireAdmin();

  const families = await prisma.family.findMany({
    where: {
      invoices: {
        some: { status: { in: OPEN_INVOICE_STATUSES } },
      },
    },
    select: {
      id: true,
      name: true,
      invoices: {
        where: { status: { in: OPEN_INVOICE_STATUSES } },
        select: {
          id: true,
          amountCents: true,
          amountPaidCents: true,
          status: true,
          dueAt: true,
        },
        orderBy: { dueAt: "asc" },
      },
    },
  });

  const summary = families.map((family) => {
    const amountDueCents = family.invoices.reduce(
      (total, inv) => total + Math.max(inv.amountCents - inv.amountPaidCents, 0),
      0
    );
    const latestInvoice = family.invoices[0];
    return {
      id: family.id,
      name: family.name,
      amountDueCents,
      latestStatus: latestInvoice?.status ?? InvoiceStatus.SENT,
      dueAt: asDate(latestInvoice?.dueAt),
      link: `/admin/family/${family.id}`,
    };
  });

  return {
    count: summary.length,
    families: summary,
  };
}

export type UnpaidFamiliesSummary = Awaited<ReturnType<typeof getUnpaidFamiliesSummary>>;
