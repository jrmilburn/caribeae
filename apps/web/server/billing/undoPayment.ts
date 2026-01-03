"use server";

import { BillingType, EnrolmentCreditEventType, InvoiceLineItemKind, InvoiceStatus, PaymentStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { nextInvoiceStatus } from "@/server/billing/utils";
import { resolveCreditsPurchased } from "@/server/invoicing/applyPaidInvoiceToEnrolment";
import { normalizeDate } from "@/server/invoicing/dateUtils";

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    enrolment: { include: { plan: true; template: true } };
    lineItems: { select: { kind: InvoiceLineItemKind; quantity: number } };
  };
}>;

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

async function recomputeInvoicePaymentState(
  tx: Prisma.TransactionClient,
  invoiceId: string
): Promise<InvoiceWithRelations | null> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      enrolment: { include: { plan: true, template: true } },
      lineItems: { select: { kind: true, quantity: true } },
    },
  });

  if (!invoice) return null;

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
      amountCents: invoice.amountCents,
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
      amountPaidCents: paidCents,
      status,
      paidAt,
      entitlementsAppliedAt: status === InvoiceStatus.PAID ? invoice.entitlementsAppliedAt : null,
    },
    include: {
      enrolment: { include: { plan: true, template: true } },
      lineItems: { select: { kind: true, quantity: true } },
    },
  });

  return updated;
}

async function recomputeEntitlementsForEnrolment(tx: Prisma.TransactionClient, enrolmentId: string) {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: enrolmentId },
    include: { plan: true, template: true },
  });
  if (!enrolment?.plan) return;

  const invoices = await tx.invoice.findMany({
    where: { enrolmentId },
    include: {
      enrolment: { include: { plan: true, template: true } },
      lineItems: { select: { kind: true, quantity: true } },
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

  // Credit/Block plans derive from credit events
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
    const creditsDelta = resolveCreditsPurchased(invoice as InvoiceWithRelations, enrolment.plan);
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

export async function undoPayment(paymentId: string, reason?: string) {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });
    if (!payment) throw new Error("Payment not found.");

    const allocations = payment.allocations.length
      ? payment.allocations
      : await tx.paymentAllocation.findMany({ where: { paymentId } });

    const invoiceIds = unique(allocations.map((a) => a.invoiceId));

    if (allocations.length) {
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
    }

    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.VOID,
        reversedAt: payment.reversedAt ?? new Date(),
        reversalReason: reason?.trim() || payment.reversalReason || "Payment reversed via admin undo",
      },
    });

    const updatedInvoices: InvoiceWithRelations[] = [];
    for (const invoiceId of invoiceIds) {
      const recalculated = await recomputeInvoicePaymentState(tx, invoiceId);
      if (recalculated) {
        updatedInvoices.push(recalculated);
      }
    }

    const enrolmentIds = unique(
      updatedInvoices.map((inv) => inv.enrolmentId).filter(Boolean) as string[]
    );

    for (const enrolmentId of enrolmentIds) {
      await recomputeEntitlementsForEnrolment(tx, enrolmentId);
    }

    return {
      payment: updatedPayment,
      invoicesUpdated: invoiceIds,
      enrolmentsRefreshed: enrolmentIds,
    };
  });
}
