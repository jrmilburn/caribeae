"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

import { adjustInvoicePayment } from "./utils";

export async function deletePayment(paymentId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true },
  });

  if (!payment) throw new Error("Payment not found.");

  return prisma.$transaction(async (tx) => {
    if (payment.allocations.length > 0) {
      for (const allocation of payment.allocations) {
        await adjustInvoicePayment(tx, allocation.invoiceId, -allocation.amountCents);
      }
      await tx.paymentAllocation.deleteMany({
        where: { paymentId },
      });
    }

    await tx.payment.delete({
      where: { id: paymentId },
    });

    return { success: true };
  });
}
