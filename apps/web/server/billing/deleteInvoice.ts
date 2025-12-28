"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteInvoice(invoiceId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const allocations = await prisma.paymentAllocation.count({
    where: { invoiceId },
  });

  if (allocations > 0) {
    throw new Error("Cannot delete an invoice with payments applied.");
  }

  await prisma.invoice.delete({
    where: { id: invoiceId },
  });

  return { success: true };
}
