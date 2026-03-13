"use server";

import { BillingType, EnrolmentCreditEventType, InvoiceLineItemKind, InvoiceStatus, type Prisma } from "@prisma/client";

import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { nextInvoiceStatus } from "@/server/billing/utils";
import { resolveCreditsPurchased } from "@/server/invoicing/applyPaidInvoiceToEnrolment";
import { normalizeDate } from "@/server/invoicing/dateUtils";

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    enrolment: {
      include: {
        plan: true;
        template: true;
        classAssignments: {
          include: {
            template: true;
          };
        };
      };
    };
    lineItems: {
      select: {
        id: true;
        kind: true;
        quantity: true;
        enrolmentId: true;
        planId: true;
        blocksBilled: true;
        billingType: true;
      };
    };
  };
}>;

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function recomputeInvoicePaymentState(
  tx: Prisma.TransactionClient,
  invoiceId: string
): Promise<InvoiceWithRelations | null> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      enrolment: { include: { plan: true, template: true, classAssignments: { include: { template: true } } } },
      lineItems: {
        select: {
          kind: true,
          quantity: true,
          enrolmentId: true,
          planId: true,
          blocksBilled: true,
          billingType: true,
        },
      },
    },
  });

  if (!invoice) return null;

  const lineItemsTotal = await tx.invoiceLineItem.aggregate({
    where: { invoiceId },
    _sum: { amountCents: true },
  });
  const amountCents = lineItemsTotal._sum.amountCents ?? 0;

  const aggregate = await tx.paymentAllocation.aggregate({
    where: { invoiceId },
    _sum: { amountCents: true },
  });
  const paidCents = Math.max(aggregate._sum.amountCents ?? 0, 0);

  const paymentDates = await tx.paymentAllocation.findMany({
    where: { invoiceId },
    select: { payment: { select: { paidAt: true } } },
  });

  const latestPaidAt = paymentDates.reduce<Date | null>((latest, allocation) => {
    const paidAt = allocation.payment?.paidAt ? new Date(allocation.payment.paidAt) : null;
    if (!paidAt) return latest;
    if (!latest || paidAt > latest) return paidAt;
    return latest;
  }, null);

  const status = nextInvoiceStatus({
    invoice: {
      status: invoice.status,
      amountCents,
      dueAt: invoice.dueAt,
      issuedAt: invoice.issuedAt,
    },
    paidCents,
  });

  const paidAt =
    status === InvoiceStatus.PAID
      ? invoice.paidAt ?? latestPaidAt ?? new Date()
      : status === InvoiceStatus.VOID
        ? invoice.paidAt
        : null;

  const updated = await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountCents,
      amountPaidCents: paidCents,
      status,
      paidAt,
      entitlementsAppliedAt: status === InvoiceStatus.PAID ? invoice.entitlementsAppliedAt : null,
    },
    include: {
      enrolment: {
        include: {
          plan: true,
          template: true,
          classAssignments: {
            include: { template: true },
          },
        },
      },
      lineItems: {
        select: {
          id: true,
          kind: true,
          quantity: true,
          enrolmentId: true,
          planId: true,
          blocksBilled: true,
          billingType: true,
        },
      },
    },
  });

  return updated;
}

export async function recomputeEntitlementsForEnrolment(tx: Prisma.TransactionClient, enrolmentId: string) {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: enrolmentId },
    include: { plan: true, template: true },
  });
  if (!enrolment?.plan) return;

  const invoices = await tx.invoice.findMany({
    where: { enrolmentId },
    include: {
      enrolment: { include: { plan: true, template: true, classAssignments: { include: { template: true } } } },
      lineItems: {
        select: {
          kind: true,
          quantity: true,
          enrolmentId: true,
          planId: true,
          blocksBilled: true,
          billingType: true,
        },
      },
    },
  });

  const paidInvoices = invoices.filter((inv) => inv.status === InvoiceStatus.PAID);
  const enrolmentInvoices = paidInvoices.filter((inv) =>
    inv.lineItems.some((li) => li.kind === InvoiceLineItemKind.ENROLMENT)
  );

  const paidInvoiceIds = enrolmentInvoices.map((inv) => inv.id);
  const clearTargets = invoices
    .filter((inv) => !paidInvoiceIds.includes(inv.id))
    .map((inv) => inv.id);

  if (clearTargets.length) {
    await tx.invoice.updateMany({
      where: { id: { in: clearTargets } },
      data: { entitlementsAppliedAt: null },
    });
  }

  if (enrolment.plan.billingType === BillingType.PER_WEEK) {
    const coverageEnds: Date[] = [];
    for (const inv of enrolmentInvoices) {
      if (!inv.coverageEnd) {
        throw new Error("Weekly invoices must include a coverage window to recompute entitlements.");
      }
      coverageEnds.push(normalizeDate(inv.coverageEnd));
    }

    const paidThrough = coverageEnds.reduce<Date | null>((latest, current) => {
      if (!current) return latest;
      if (!latest || current > latest) return current;
      return latest;
    }, null);

    if (paidInvoiceIds.length) {
      await tx.invoice.updateMany({
        where: { id: { in: paidInvoiceIds } },
        data: { entitlementsAppliedAt: new Date() },
      });
    }

    await tx.enrolment.update({
      where: { id: enrolmentId },
      data: {
        paidThroughDate: paidThrough,
        paidThroughDateComputed: paidThrough ?? undefined,
      },
    });
    await getEnrolmentBillingStatus(enrolmentId, { client: tx });
    return;
  }

  const invoiceIds = invoices.map((inv) => inv.id);
  if (invoiceIds.length) {
    await tx.enrolmentCreditEvent.deleteMany({
      where: {
        enrolmentId,
        type: EnrolmentCreditEventType.PURCHASE,
        invoiceId: { in: invoiceIds },
      },
    });
  }

  const purchases: Prisma.EnrolmentCreditEventCreateManyInput[] = [];
  for (const invoice of enrolmentInvoices) {
    const creditsDelta = resolveCreditsPurchased(invoice, enrolment.plan);
    if (creditsDelta <= 0) continue;
    const occurredOn = normalizeDate(invoice.paidAt ?? new Date());
    purchases.push({
      enrolmentId,
      type: EnrolmentCreditEventType.PURCHASE,
      creditsDelta,
      occurredOn,
      note: "Invoice paid",
      invoiceId: invoice.id,
    });
  }

  if (purchases.length) {
    await tx.enrolmentCreditEvent.createMany({ data: purchases });
  }

  if (paidInvoiceIds.length) {
    await tx.invoice.updateMany({
      where: { id: { in: paidInvoiceIds } },
      data: { entitlementsAppliedAt: new Date() },
    });
  }

  await getEnrolmentBillingStatus(enrolmentId, { client: tx });
}
