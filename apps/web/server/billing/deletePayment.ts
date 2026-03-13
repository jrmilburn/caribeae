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

export async function deletePayment(paymentId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const payment = await prisma.payment.findUnique({
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
  if (payment.status === PaymentStatus.VOID) {
    throw new Error("Cannot delete a voided payment. It has already been reversed.");
  }

  return prisma.$transaction(async (tx) => {
    const invoiceIds = unique([
      ...payment.allocations.map((allocation) => allocation.invoiceId),
      ...payment.appliedDiscountLineItems.map((lineItem) => lineItem.invoiceId),
    ]);

    if (payment.allocations.length > 0) {
      await tx.paymentAllocation.deleteMany({
        where: { paymentId },
      });
    }
    if (payment.appliedDiscountLineItems.length > 0) {
      await tx.invoiceLineItem.deleteMany({
        where: { appliedByPaymentId: paymentId },
      });
    }

    await tx.payment.delete({
      where: { id: paymentId },
    });

    const updatedInvoices = [];
    for (const invoiceId of invoiceIds) {
      const recalculated = await recomputeInvoicePaymentState(tx, invoiceId);
      if (recalculated) {
        updatedInvoices.push(recalculated);
      }
    }

    const enrolmentIds = unique(updatedInvoices.map((invoice) => invoice.enrolmentId).filter(Boolean) as string[]);
    for (const enrolmentId of enrolmentIds) {
      await recomputeEntitlementsForEnrolment(tx, enrolmentId);
    }

    return { success: true };
  });
}
