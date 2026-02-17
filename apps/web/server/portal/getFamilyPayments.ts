import "server-only";

import { PaymentStatus, StripePaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PortalPayment } from "@/types/portal";

function paymentSortValue(payment: PortalPayment) {
  return new Date(payment.paidAt ?? payment.createdAt).getTime();
}

function mapStripeStatus(status: StripePaymentStatus): PortalPayment["status"] {
  if (status === StripePaymentStatus.PAID) return "PAID";
  if (status === StripePaymentStatus.FAILED) return "FAILED";
  if (status === StripePaymentStatus.CANCELLED) return "CANCELLED";
  return "PENDING";
}

export async function getFamilyPayments(familyId: string): Promise<PortalPayment[]> {
  const [stripePayments, settledPayments] = await Promise.all([
    prisma.stripePayment.findMany({
      where: { familyId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        amountCents: true,
        currency: true,
        status: true,
        createdAt: true,
        stripeSessionId: true,
        settledAt: true,
        settledPayment: {
          select: {
            id: true,
            paidAt: true,
            method: true,
            note: true,
            allocations: {
              select: { invoiceId: true },
            },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { familyId, status: { not: PaymentStatus.VOID } },
      orderBy: { paidAt: "desc" },
      take: 12,
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
    }),
  ]);

  const settledPaymentIds = new Set(
    stripePayments
      .map((payment) => payment.settledPayment?.id)
      .filter((id): id is string => Boolean(id))
  );

  const stripeRows: PortalPayment[] = stripePayments.map((payment) => {
    const invoiceIds = payment.settledPayment
      ? Array.from(new Set(payment.settledPayment.allocations.map((allocation) => allocation.invoiceId)))
      : [];

    return {
      id: `stripe_${payment.id}`,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: mapStripeStatus(payment.status),
      createdAt: payment.createdAt,
      paidAt: payment.settledPayment?.paidAt ?? payment.settledAt ?? null,
      method: payment.settledPayment?.method ?? null,
      note: payment.settledPayment?.note ?? null,
      invoiceIds,
      stripeSessionId: payment.stripeSessionId,
    };
  });

  const manualRows: PortalPayment[] = settledPayments
    .filter((payment) => !settledPaymentIds.has(payment.id))
    .map((payment) => ({
      id: `payment_${payment.id}`,
      amountCents: payment.amountCents,
      currency: "usd",
      status: "PAID",
      createdAt: payment.paidAt,
      paidAt: payment.paidAt,
      method: payment.method ?? null,
      note: payment.note ?? null,
      invoiceIds: Array.from(new Set(payment.allocations.map((allocation) => allocation.invoiceId))),
      stripeSessionId: null,
    }));

  return [...stripeRows, ...manualRows]
    .sort((a, b) => paymentSortValue(b) - paymentSortValue(a))
    .slice(0, 12);
}
