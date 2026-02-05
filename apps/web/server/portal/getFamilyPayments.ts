import "server-only";

import { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PortalPayment } from "@/types/portal";

export async function getFamilyPayments(familyId: string): Promise<PortalPayment[]> {
  const payments = await prisma.payment.findMany({
    where: { familyId, status: { not: PaymentStatus.VOID } },
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      paidAt: true,
      method: true,
      note: true,
      allocations: {
        select: { invoiceId: true },
      },
    },
  });

  return payments.map((payment) => ({
    id: payment.id,
    amountCents: payment.amountCents,
    paidAt: payment.paidAt,
    method: payment.method ?? null,
    note: payment.note ?? null,
    invoiceIds: Array.from(new Set(payment.allocations.map((allocation) => allocation.invoiceId))),
  }));
}
