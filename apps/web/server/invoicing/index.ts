"use server";

import { addDays, addWeeks, isAfter, isBefore, max as maxDate } from "date-fns";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BillingType, InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

const OPEN_INVOICE_STATUSES = [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.OVERDUE] as const;
const DEFAULT_DUE_IN_DAYS = 7;
const SWEEP_THROTTLE_MS = 15 * 60 * 1000;

const enrolmentWithPlanInclude = {
  include: {
    plan: true,
    student: { select: { familyId: true } },
  },
} satisfies Prisma.EnrolmentInclude;

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

function resolveCoverageForPlan(params: {
  enrolment: Prisma.EnrolmentGetPayload<typeof enrolmentWithPlanInclude>;
  plan: Prisma.EnrolmentPlanUncheckedCreateInput | Prisma.EnrolmentPlanGetPayload<{ include: { level: true } }>;
  today?: Date;
}) {
  const { enrolment, plan } = params;
  const today = params.today ?? new Date();

  if (plan.billingType === BillingType.PER_WEEK) {
    if (!plan.durationWeeks || plan.durationWeeks <= 0) {
      throw new Error("Weekly plans require a duration in weeks.");
    }
    const duration = plan.durationWeeks;
    const coverageStart = enrolment.paidThroughDate
      ? maxDate([today, enrolment.paidThroughDate])
      : enrolment.startDate;
    const rawEnd = addWeeks(coverageStart, duration);
    const coverageEnd =
      enrolment.endDate && isBefore(enrolment.endDate, rawEnd) ? enrolment.endDate : rawEnd;
    return { coverageStart, coverageEnd, creditsPurchased: null };
  }

  if (plan.billingType === BillingType.BLOCK && (!plan.blockClassCount || plan.blockClassCount <= 0)) {
    throw new Error("Block plans require the number of classes per block.");
  }
  const creditsPurchased = plan.billingType === BillingType.BLOCK ? plan.blockClassCount! : 1;
  return { coverageStart: null, coverageEnd: null, creditsPurchased };
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

    const existingOpen = await tx.invoice.findFirst({
      where: { enrolmentId, status: { in: OPEN_INVOICE_STATUSES } },
    });
    if (existingOpen) return { invoice: existingOpen, created: false };

    const { coverageStart, coverageEnd, creditsPurchased } = resolveCoverageForPlan({
      enrolment,
      plan: enrolment.plan,
      today: enrolment.startDate,
    });

    const invoice = await tx.invoice.create({
      data: {
        familyId: enrolment.student.familyId,
        enrolmentId: enrolment.id,
        amountCents: enrolment.plan.priceCents,
        status: InvoiceStatus.SENT,
        coverageStart: coverageStart ?? null,
        coverageEnd: coverageEnd ?? null,
        creditsPurchased,
        issuedAt: new Date(),
        dueAt: addDays(new Date(), DEFAULT_DUE_IN_DAYS),
      },
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
      },
    });

    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === InvoiceStatus.PAID) return invoice;

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
    });

    if (invoice.enrolment && invoice.enrolment.plan) {
      const plan = invoice.enrolment.plan;
      if (plan.billingType === BillingType.PER_WEEK && invoice.coverageEnd) {
        await tx.enrolment.update({
          where: { id: invoice.enrolment.id },
          data: { paidThroughDate: invoice.coverageEnd },
        });
      } else if (
        (plan.billingType === BillingType.BLOCK || plan.billingType === BillingType.PER_CLASS) &&
        invoice.creditsPurchased
      ) {
        await tx.enrolment.update({
          where: { id: invoice.enrolment.id },
          data: {
            creditsRemaining: (invoice.enrolment.creditsRemaining ?? 0) + invoice.creditsPurchased,
          },
        });
      }
    }

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

    const openInvoice = await tx.invoice.findFirst({
      where: { enrolmentId: enrolment.id, status: { in: OPEN_INVOICE_STATUSES } },
    });
    if (openInvoice) return { invoice: openInvoice, created: false };

    const today = new Date();
    if (enrolment.plan.billingType === BillingType.PER_WEEK) {
      const durationWeeks = enrolment.plan.durationWeeks;
      if (!durationWeeks) throw new Error("Weekly plans require durationWeeks to be set.");

      const coverageStart = enrolment.paidThroughDate
        ? maxDate([today, enrolment.paidThroughDate])
        : maxDate([today, enrolment.startDate]);
      if (enrolment.endDate && isAfter(coverageStart, enrolment.endDate)) {
        return { created: false };
      }
      const rawEnd = addWeeks(coverageStart, durationWeeks);
      const coverageEnd =
        enrolment.endDate && isBefore(enrolment.endDate, rawEnd) ? enrolment.endDate : rawEnd;

      const invoice = await tx.invoice.create({
        data: {
          familyId: enrolment.student.familyId,
          enrolmentId: enrolment.id,
          amountCents: enrolment.plan.priceCents,
          status: InvoiceStatus.SENT,
          coverageStart,
          coverageEnd,
          issuedAt: today,
          dueAt: addDays(today, DEFAULT_DUE_IN_DAYS),
        },
      });
      return { invoice, created: true };
    }

    const needsCredits =
      enrolment.creditsRemaining == null || enrolment.creditsRemaining <= 0;
    if (!needsCredits) return { created: false };

    if (enrolment.plan.billingType === BillingType.BLOCK && !enrolment.plan.blockClassCount) {
      throw new Error("Block plans require blockClassCount to be set.");
    }

    const creditsPurchased =
      enrolment.plan.billingType === BillingType.BLOCK
        ? enrolment.plan.blockClassCount!
        : enrolment.plan.blockClassCount ?? 1;
    const invoice = await tx.invoice.create({
      data: {
        familyId: enrolment.student.familyId,
        enrolmentId: enrolment.id,
        amountCents: enrolment.plan.priceCents,
        status: InvoiceStatus.SENT,
        creditsPurchased,
        issuedAt: today,
        dueAt: addDays(today, DEFAULT_DUE_IN_DAYS),
      },
    });

    return { invoice, created: true };
  });
}

export async function runInvoicingSweep(params: { maxToProcess?: number }) {
  await ensureAdminAccess();

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
          OR: [{ paidThroughDate: null }, { paidThroughDate: { lt: today } }],
        },
        {
          plan: { billingType: { in: [BillingType.BLOCK, BillingType.PER_CLASS] } },
          OR: [{ creditsRemaining: null }, { creditsRemaining: { lte: 0 } }],
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
        select: { id: true, amountCents: true, status: true, dueAt: true },
        orderBy: { dueAt: "asc" },
      },
    },
  });

  const summary = families.map((family) => {
    const amountDueCents = family.invoices.reduce((total, inv) => total + inv.amountCents, 0);
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
