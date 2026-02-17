import "server-only";

import { StripePaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFamilyBalanceCents } from "@/server/billing/getFamilyBalanceCents";
import { getFamilyPayments } from "@/server/portal/getFamilyPayments";
import type { PortalPaymentStatus } from "@/types/portal";

export type FamilyBillingOverview = {
  outstandingCents: number;
  recentPayments: Awaited<ReturnType<typeof getFamilyPayments>>;
  checkoutSessionStatus: PortalPaymentStatus | null;
};

function mapStripeStatus(status: StripePaymentStatus): PortalPaymentStatus {
  if (status === StripePaymentStatus.PAID) return "PAID";
  if (status === StripePaymentStatus.FAILED) return "FAILED";
  if (status === StripePaymentStatus.CANCELLED) return "CANCELLED";
  return "PENDING";
}

export async function getFamilyBillingOverview(
  familyId: string,
  options?: { checkoutSessionId?: string | null }
): Promise<FamilyBillingOverview> {
  const [outstandingCentsRaw, recentPayments, checkoutSession] = await Promise.all([
    getFamilyBalanceCents(familyId),
    getFamilyPayments(familyId),
    options?.checkoutSessionId
      ? prisma.stripePayment.findFirst({
          where: {
            familyId,
            stripeSessionId: options.checkoutSessionId,
          },
          select: { status: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    outstandingCents: outstandingCentsRaw,
    recentPayments,
    checkoutSessionStatus: checkoutSession ? mapStripeStatus(checkoutSession.status) : null,
  };
}
