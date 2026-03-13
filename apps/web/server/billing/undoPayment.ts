"use server";

import { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  recomputeEntitlementsForEnrolment,
  recomputeInvoicePaymentState,
  unique,
} from "@/server/billing/paymentRollback";

export async function undoPayment(paymentId: string, reason?: string) {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: true,
        appliedDiscountLineItems: {
          select: {
            id: true,
            invoiceId: true,
          },
        },
      },
    });
    if (!payment) throw new Error("Payment not found.");

    const allocations = payment.allocations.length
      ? payment.allocations
      : await tx.paymentAllocation.findMany({ where: { paymentId } });

    const discountedInvoiceIds = payment.appliedDiscountLineItems.map((lineItem) => lineItem.invoiceId);
    const invoiceIds = unique([...allocations.map((a) => a.invoiceId), ...discountedInvoiceIds]);

    if (allocations.length) {
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
    }
    if (payment.appliedDiscountLineItems.length) {
      await tx.invoiceLineItem.deleteMany({ where: { appliedByPaymentId: paymentId } });
    }

    const updatedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.VOID,
        reversedAt: payment.reversedAt ?? new Date(),
        reversalReason: reason?.trim() || payment.reversalReason || "Payment reversed via admin undo",
      },
    });

    const updatedInvoices = [];
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
