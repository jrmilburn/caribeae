"use server";

import { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

export async function getFamilyBillingData(familyId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const [openInvoices, payments, enrolments, coverageAudits] = await Promise.all([
    prisma.invoice.findMany({
      where: { familyId, status: { in: [...OPEN_INVOICE_STATUSES] } },
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
      where: { familyId, status: { not: PaymentStatus.VOID } },
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
    prisma.enrolment.findMany({
      where: { student: { familyId }, status: "ACTIVE", planId: { not: null } },
      select: {
        id: true,
        student: { select: { name: true } },
        plan: { select: { name: true, billingType: true, priceCents: true, blockClassCount: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.enrolmentCoverageAudit.findMany({
      where: { enrolment: { student: { familyId } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        enrolment: {
          select: {
            id: true,
            student: { select: { id: true, name: true } },
            plan: { select: { name: true, billingType: true } },
          },
        },
      },
    }),
  ]);

  return {
    openInvoices,
    payments,
    enrolments,
    coverageAudits,
  };
}
