"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

export async function getFamilyBillingData(familyId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const [openInvoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { familyId, status: { in: OPEN_INVOICE_STATUSES } },
      orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
      select: {
        id: true,
        amountCents: true,
        amountPaidCents: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        coverageStart: true,
        coverageEnd: true,
        creditsPurchased: true,
      },
    }),
    prisma.payment.findMany({
      where: { familyId },
      orderBy: { paidAt: "desc" },
      take: 10,
      include: {
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
                amountCents: true,
                amountPaidCents: true,
                issuedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    openInvoices,
    payments,
  };
}
