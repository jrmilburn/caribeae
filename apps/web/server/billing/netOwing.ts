import "server-only";

import { InvoiceStatus, PaymentStatus, PrismaClient, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { enrolmentIsPayable } from "@/lib/enrolment/enrolmentVisibility";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";
import { computeFamilyBillingSummary, type FamilyBillingSummary } from "./familyBillingSummary";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export type NetOwingBreakdown = {
  netOwingCents: number;
  invoiceOutstandingCents: number;
  unallocatedCreditCents: number;
  overdueOwingCents: number;
};

type OpenInvoiceInput = {
  id: string;
  amountCents: number;
  amountPaidCents?: number | null;
  status: InvoiceStatus;
  enrolmentId?: string | null;
};

type InvoiceTotalsById = Record<string, { amountCents: number; status: InvoiceStatus }>;

type ComputeNetOwingFromDataInput = {
  summary: FamilyBillingSummary;
  openInvoices: OpenInvoiceInput[];
  allocationTotalsByInvoiceId: Record<string, number>;
  invoiceTotalsById: InvoiceTotalsById;
  paymentsTotalCents: number;
};

export type ComputeFamilyNetOwingInput = {
  familyId: string;
  client?: PrismaClientOrTx;
  summary?: FamilyBillingSummary;
  openInvoices?: OpenInvoiceInput[];
  allocationTotalsByInvoiceId?: Record<string, number>;
  invoiceTotalsById?: InvoiceTotalsById;
  paymentsTotalCents?: number;
};

export function computeFamilyNetOwingFromData(input: ComputeNetOwingFromDataInput): NetOwingBreakdown {
  const openEnrolmentIds = new Set(
    input.openInvoices.map((invoice) => invoice.enrolmentId).filter((id): id is string => Boolean(id))
  );

  const overdueOwingCents = input.summary.breakdown?.length
    ? input.summary.breakdown.reduce(
        (sum, entry) => (openEnrolmentIds.has(entry.enrolmentId) ? sum : sum + entry.overdueOwingCents),
        0
      )
    : input.summary.totalOwingCents;

  const invoiceOutstandingCents = input.openInvoices.reduce((sum, invoice) => {
    const allocated = input.allocationTotalsByInvoiceId[invoice.id] ?? 0;
    const paidCents = Math.max(invoice.amountPaidCents ?? 0, allocated);
    return sum + Math.max(invoice.amountCents - paidCents, 0);
  }, 0);

  const appliedCents = Object.entries(input.invoiceTotalsById).reduce((sum, [invoiceId, invoice]) => {
    if (invoice.status === InvoiceStatus.VOID) return sum;
    const allocated = input.allocationTotalsByInvoiceId[invoiceId] ?? 0;
    const applied = Math.min(Math.max(allocated, 0), invoice.amountCents);
    return sum + applied;
  }, 0);

  const unallocatedCreditCents = Math.max(input.paymentsTotalCents - appliedCents, 0);
  const netOwingCents = overdueOwingCents + invoiceOutstandingCents - unallocatedCreditCents;

  return {
    netOwingCents,
    invoiceOutstandingCents,
    unallocatedCreditCents,
    overdueOwingCents,
  };
}

async function fetchBillingSummary(familyId: string, client: PrismaClientOrTx) {
  const enrolments = await client.enrolment.findMany({
    where: { student: { familyId }, isBillingPrimary: true },
    select: {
      id: true,
      studentId: true,
      planId: true,
      status: true,
      paidThroughDate: true,
      endDate: true,
      creditsRemaining: true,
      plan: {
        select: {
          billingType: true,
          priceCents: true,
          blockClassCount: true,
          sessionsPerWeek: true,
        },
      },
    },
  });

  const payableEnrolments = enrolments.filter((enrolment) =>
    enrolmentIsPayable({
      status: enrolment.status,
      paidThroughDate: enrolment.paidThroughDate,
      endDate: enrolment.endDate,
    })
  );

  return computeFamilyBillingSummary({
    enrolments: payableEnrolments.map((enrolment) => ({
      id: enrolment.id,
      studentId: enrolment.studentId,
      planId: enrolment.planId,
      billingType: enrolment.plan?.billingType ?? null,
      planPriceCents: enrolment.plan?.priceCents ?? 0,
      blockClassCount: enrolment.plan?.blockClassCount ?? null,
      sessionsPerWeek: enrolment.plan?.sessionsPerWeek ?? null,
      paidThroughDate: enrolment.paidThroughDate ?? null,
      creditsRemaining: enrolment.creditsRemaining ?? 0,
    })),
    today: new Date(),
  });
}

export async function computeFamilyNetOwing(input: ComputeFamilyNetOwingInput): Promise<NetOwingBreakdown> {
  const client = input.client ?? prisma;
  const familyId = input.familyId;

  const summary = input.summary ?? (await fetchBillingSummary(familyId, client));

  const openInvoices =
    input.openInvoices ??
    (await client.invoice.findMany({
      where: { familyId, status: { in: [...OPEN_INVOICE_STATUSES] } },
      select: {
        id: true,
        amountCents: true,
        amountPaidCents: true,
        status: true,
        enrolmentId: true,
      },
    }));

  const paymentsTotalCents =
    input.paymentsTotalCents ??
    (await client.payment.aggregate({
      where: { familyId, status: { not: PaymentStatus.VOID } },
      _sum: { amountCents: true },
    }))._sum.amountCents ??
    0;

  let allocationTotalsByInvoiceId = input.allocationTotalsByInvoiceId;
  if (!allocationTotalsByInvoiceId) {
    const allocations = await client.paymentAllocation.groupBy({
      by: ["invoiceId"],
      where: {
        invoice: { familyId, status: { not: InvoiceStatus.VOID } },
        payment: { status: { not: PaymentStatus.VOID } },
      },
      _sum: { amountCents: true },
    });

    allocationTotalsByInvoiceId = allocations.reduce<Record<string, number>>((acc, allocation) => {
      acc[allocation.invoiceId] = allocation._sum.amountCents ?? 0;
      return acc;
    }, {});
  }

  let invoiceTotalsById = input.invoiceTotalsById;
  if (!invoiceTotalsById) {
    const invoiceIds = Object.keys(allocationTotalsByInvoiceId);
    const invoices = invoiceIds.length
      ? await client.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, amountCents: true, status: true },
        })
      : [];
    invoiceTotalsById = invoices.reduce<InvoiceTotalsById>((acc, invoice) => {
      acc[invoice.id] = { amountCents: invoice.amountCents, status: invoice.status };
      return acc;
    }, {});
  }

  return computeFamilyNetOwingFromData({
    summary,
    openInvoices,
    allocationTotalsByInvoiceId,
    invoiceTotalsById,
    paymentsTotalCents,
  });
}
